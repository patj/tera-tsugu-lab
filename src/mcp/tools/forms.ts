// 行事・アンケートフォーム（forms）の MCP ツール: create_form、get_form_results（spec.md §4、§5）
import { z } from "zod";
import { db } from "@/db/client";
import {
  FORM_MODES,
  ITEM_FIELD_TYPES,
  ITEM_FIELD_TYPE_LABELS,
  MODE_LABELS,
  PERSON_PROFILE_FIELDS,
  PROFILE_FIELDS,
  PROFILE_FIELD_LABELS,
  QUESTION_TYPES,
  QUESTION_TYPE_LABELS,
  STATUS_LABELS,
  appBaseUrl,
  countLinkHouseholds,
  createForm,
  draftWarnings,
  formUrl,
  getFormResults,
  listForms,
  listHouseholdLinks,
  summarizeResults,
  validateFormDraft,
  type FormInput,
  type NormalizedForm,
  type ProfileField,
  type Tally,
} from "@/domain/forms";
import { defineReadTool, defineWriteTool, type ToolDef } from "../framework/define";

// ---- create_form ----

const itemFieldSchema = z.object({
  label: z.string().describe("項目の名前（例: 「カナ」「氏名」「生年月日」「男女」「祈願の主旨」）"),
  type: z
    .enum(ITEM_FIELD_TYPES)
    .describe(
      "項目の種類。short = 短い記述（カナ、氏名など）、long = 長い記述（祈願の主旨など自由記述）、" +
        "single = 選択肢から 1 つ（男女など。options が必要）、date = 日付（生年月日など）、number = 数値（年齢など）",
    ),
  required: z.boolean().optional().describe("必須にするか。省略すると任意"),
  options: z.array(z.string()).optional().describe("type が single のときの選択肢（例: 男女なら [\"男\", \"女\"]）"),
  profile_field: z
    .enum(PERSON_PROFILE_FIELDS)
    .optional()
    .describe(
      "台帳から補える項目なら必ず指定する: 氏名 → name、カナ・ふりがな → kana、生年月日 → birth_date、男女・性別 → gender。" +
        "指定すると、檀家が個別リンクやポータルで家族を選ぶだけで台帳の値が入る（入力しなくてよくなる）。" +
        "祈願の主旨など台帳にない項目には指定しない",
    ),
});

const questionSchema = z.object({
  type: z
    .enum(QUESTION_TYPES)
    .describe(
      "設問の種類。single = 単一選択、multi = 複数選択、short = 短い記述、long = 長い記述、number = 数値（参加人数など）、" +
        "date = 日付、person_list = 人ごとの項目（祈願者や申込者など、1 人分の項目のまとまりを最大 max_persons 人分入力する）",
    ),
  label: z.string().describe("設問の文言（例: 「申込者のお名前」「祈願する方」）"),
  description: z.string().optional().describe("設問の補足（任意）"),
  required: z.boolean().optional().describe("必須にするか。省略すると任意。person_list を必須にすると 1 人以上の入力が必要"),
  options: z.array(z.string()).optional().describe("single / multi の選択肢（2 つ以上）。それ以外の種類では省く"),
  profile_field: z
    .enum(PROFILE_FIELDS)
    .optional()
    .describe(
      "回答者本人の情報で、台帳から補える設問なら指定する: 氏名 → name、カナ → kana、生年月日 → birth_date、性別 → gender、" +
        "住所 → address、電話 → phone、メール → email。指定した設問は、檀家（個別リンク、ポータル）には表示せず台帳の値で埋め、" +
        "一般の方（共通リンク）にだけ聞く。person_list には指定しない",
    ),
  max_persons: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe("person_list の最大人数（1〜20。省略すると 5）。花まつりの「申込者（一）〜（三）」なら 3"),
  item_fields: z
    .array(itemFieldSchema)
    .optional()
    .describe("person_list の 1 人分の項目（聞かれた順に並べる）。person_list のときは必須、それ以外では省く"),
});

const createFormInput = {
  title: z.string().describe("フォームの題名（例: 「ほうろく灸 申し込み」）"),
  description: z.string().optional().describe("回答する人に見せる説明（日時、場所、申し込みの締め切りなど。任意）"),
  mode: z
    .enum(FORM_MODES)
    .describe(
      "公開範囲。「檀家さんにも一般の方にも」→ both、「檀家さんだけ」→ members、「一般の方だけ」→ public。" +
        "both / members では、檀家の世帯ごとの個別リンクも発行する",
    ),
  questions: z
    .array(questionSchema)
    .min(1)
    .describe(
      "設問の配列（表示する順）。住職の言葉から組み立てる。" +
        "「祈願する人ごとに、カナ、氏名、生年月日、男女、祈願の主旨を聞いて」のように人ごとに聞く項目は、1 つの person_list にまとめ、" +
        "各項目を item_fields に入れる（例: カナ → short + profile_field kana、氏名 → short + name、生年月日 → date + birth_date、" +
        "男女 → single + options [\"男\",\"女\"] + gender、祈願の主旨 → long、profile_field なし）。" +
        "mode が both / public のときは、一般の方に連絡できるように、申込者のお名前（short + profile_field name）と" +
        "電話番号（short + profile_field phone）の設問も先頭に入れる（檀家には表示されず、台帳から補われる）",
    ),
};

function toFormInput(args: z.infer<z.ZodObject<typeof createFormInput>>): FormInput {
  return {
    title: args.title,
    description: args.description ?? null,
    mode: args.mode,
    status: "open",
    questions: args.questions.map((q) => ({
      type: q.type,
      label: q.label,
      description: q.description ?? null,
      required: q.required ?? false,
      options: q.options ?? null,
      profileField: (q.profile_field ?? null) as ProfileField | null,
      maxPersons: q.max_persons ?? null,
      itemFields:
        q.item_fields?.map((f) => ({
          label: f.label,
          type: f.type,
          required: f.required ?? false,
          options: f.options ?? null,
          profileField: f.profile_field ?? null,
        })) ?? null,
    })),
  };
}

function describeDraft(d: NormalizedForm): string[] {
  const lines: string[] = [];
  d.questions.forEach((q, i) => {
    const flags = [QUESTION_TYPE_LABELS[q.type]];
    if (q.type === "person_list") flags.push(`最大 ${q.maxPersons} 人`);
    if (q.required) flags.push("必須");
    if (q.options) flags.push(`選択肢: ${q.options.join(" / ")}`);
    let line = `${i + 1}. ${q.label}（${flags.join("、")}）`;
    if (q.profileField) line += ` ※台帳で補う: ${PROFILE_FIELD_LABELS[q.profileField]}（檀家には表示しない）`;
    lines.push(line);
    for (const f of q.itemFields ?? []) {
      const ff = [ITEM_FIELD_TYPE_LABELS[f.type as keyof typeof ITEM_FIELD_TYPE_LABELS] ?? f.type];
      if (f.required) ff.push("必須");
      if (f.options) ff.push(`選択肢: ${f.options.join(" / ")}`);
      if (f.profileField) ff.push(`台帳から自動入力: ${PROFILE_FIELD_LABELS[f.profileField]}`);
      lines.push(`   - ${f.label}（${ff.join("、")}）`);
    }
  });
  return lines;
}

const createFormTool = defineWriteTool({
  name: "create_form",
  description:
    "行事の申し込みやアンケートのフォームを作り、受付中（open）にして、公開リンク（共通リンク）を返す。" +
    "住職の自然言語の依頼から、題名、公開範囲（mode）、設問の配列（questions）を組み立てて渡す。" +
    "人ごとに聞く項目（祈願者、申込者（一）〜（三）など）は person_list の設問 1 つにまとめる。" +
    "カナ、氏名、生年月日、男女のように台帳でわかる項目には profile_field を指定する（檀家は家族を選ぶだけで入力が済む）。" +
    "公開範囲が both / members のときは、檀家の世帯ごとの個別リンクも発行する（一覧と印刷は管理画面）。" +
    "例: 「ほうろく灸の申し込みフォームを作って。祈願する人ごとに、カナ、氏名、生年月日、男女、祈願の主旨を聞いて。檀家さんにも一般の方にも」→ " +
    "mode = both、questions = [申込者のお名前（short, required, profile_field name）, 電話番号（short, required, profile_field phone）, " +
    "祈願する方（person_list, required, item_fields = [カナ（short, required, kana）, 氏名（short, required, name）, " +
    "生年月日（date, required, birth_date）, 男女（single, required, options [男, 女], gender）, 祈願の主旨（long, required）]）]",
  input: createFormInput,
  preview: async (args, { actor }) => {
    const draft = validateFormDraft(toFormInput(args));
    const households = draft.mode === "public" ? 0 : await countLinkHouseholds(actor);
    const warnings = draftWarnings(draft);
    const summary = [
      `フォーム「${draft.title}」を作り、受付中にします。`,
      `公開範囲: ${MODE_LABELS[draft.mode]}`,
      ...(draft.description ? [`説明: ${draft.description}`] : []),
      "設問:",
      ...describeDraft(draft),
      draft.mode === "public"
        ? "個別リンク: 発行しません（共通リンクだけ）"
        : `個別リンク: 檀家 ${households} 世帯に発行します（家族を選ぶと台帳の項目が自動で入る簡易版）`,
      ...warnings.map((w) => `注意: ${w}`),
    ].join("\n");
    return {
      summary,
      details: { title: draft.title, mode: draft.mode, questions: draft.questions, household_links: households, warnings },
    };
  },
  execute: async (args, { actor }) => {
    const input = toFormInput(args);
    // フォーム、設問、個別リンクを 1 つのトランザクションで作る
    const form = await db.transaction((tx) => createForm(actor, input, tx));
    const links = form.mode === "public" ? [] : (await listHouseholdLinks(actor, form.id)).filter((l) => l.token);
    return {
      form_id: form.id,
      title: form.title,
      status: STATUS_LABELS[form.status],
      mode: MODE_LABELS[form.mode],
      public_url: form.mode === "members" ? null : formUrl(form.id),
      household_links: links.length,
      household_links_page: form.mode === "public" ? null : `${appBaseUrl()}/admin/forms/${form.id}/links`,
      admin_url: `${appBaseUrl()}/admin/forms/${form.id}`,
      note:
        form.mode === "members"
          ? "檀家専用のフォームです。世帯ごとの個別リンクは管理画面の一覧から印刷できます。"
          : "共通リンク（public_url）を一般の方に案内してください。" +
            (form.mode === "both" ? "檀家の世帯ごとの個別リンクは管理画面の一覧から印刷できます。" : ""),
    };
  },
});

// ---- get_form_results ----

function tallyJa(t: Tally) {
  return { 檀家: t.member, 一般: t.public, 合計: t.total };
}

const getFormResultsTool = defineReadTool({
  name: "get_form_results",
  description:
    "行事・アンケートのフォームの集計を返す。回答の件数と、person_list に入力された人数（祈願者などの人数）を、檀家・一般・合計で返す。" +
    "選択肢ごとの件数と数値の合計も返す。「ほうろく灸の申し込みは今何人？」のような質問には、title に「ほうろく灸」を入れて呼ぶ。" +
    "人数を聞かれたら、回答の件数ではなく person_list の人数（persons）を答える。" +
    "form_id も title も省くと、受付中のフォームの一覧と回答の件数を返す。名簿の CSV の出力は管理画面で行う。",
  input: {
    form_id: z.string().optional().describe("フォームの ID（create_form や前回の結果で返ったもの）"),
    title: z.string().optional().describe("フォームの題名の一部（例: 「ほうろく灸」）。form_id がわからないときに使う"),
  },
  handler: async ({ form_id, title }, { actor }) => {
    let formId = form_id;
    if (!formId) {
      const all = await listForms(actor);
      const keyword = title?.trim();
      const matched = keyword ? all.filter((f) => f.title.includes(keyword)) : all.filter((f) => f.status === "open");
      if (!keyword || matched.length !== 1) {
        return {
          message: keyword
            ? matched.length === 0
              ? `題名に「${keyword}」を含むフォームが見つかりません。forms から選んでください`
              : `題名に「${keyword}」を含むフォームが ${matched.length} 件あります。form_id を指定してもう一度呼んでください`
            : "受付中のフォームの一覧です。集計を見るには form_id か title を指定してください",
          forms: (matched.length > 0 || !keyword ? matched : all).map((f) => ({
            form_id: f.id,
            title: f.title,
            status: STATUS_LABELS[f.status],
            responses: f.responseCount,
          })),
        };
      }
      formId = matched[0].id;
    }
    const r = await getFormResults(actor, formId);
    return {
      form_id: r.form.id,
      title: r.form.title,
      status: STATUS_LABELS[r.form.status],
      mode: MODE_LABELS[r.form.mode],
      summary: summarizeResults(r),
      responses: tallyJa(r.responses),
      persons: r.hasPersonList ? tallyJa(r.persons) : null,
      questions: r.questions
        .filter((q) => q.options || q.sum || q.persons)
        .map((q) => ({
          label: q.label,
          type: QUESTION_TYPE_LABELS[q.type],
          ...(q.options ? { options: q.options.map((o) => ({ option: o.option, ...tallyJa(o.count) })) } : {}),
          ...(q.sum ? { sum: tallyJa(q.sum) } : {}),
          ...(q.persons ? { persons: tallyJa(q.persons) } : {}),
        })),
      csv: `名簿の CSV は管理画面で出力できます: ${appBaseUrl()}/admin/forms/${r.form.id}`,
    };
  },
});

export const formsTools: ToolDef[] = [createFormTool, getFormResultsTool];
