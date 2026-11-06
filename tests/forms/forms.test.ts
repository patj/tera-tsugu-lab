// フォームの作成と編集、集計、CSV
import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import { closeDb } from "@/db/client";
import type { SeedContext } from "@/db/seed/context";
import type { Actor } from "@/domain/core";
import {
  addQuestion,
  createForm,
  deleteQuestion,
  getForm,
  getFormResults,
  listForms,
  listHouseholdLinks,
  moveQuestion,
  publicRespondentActor,
  responsesCsv,
  rosterCsv,
  setFormStatus,
  submitResponse,
  summarizeResults,
  updateQuestion,
  validateFormDraft,
  draftWarnings,
  type FormWithQuestions,
} from "@/domain/forms";
import { resetDb } from "../helpers/db";
import { createTanaka, createYamada, horokuInput, jushokuActor, type TestHousehold } from "./helpers";

let seed: SeedContext;
let staff: Actor;
let yamada: TestHousehold;
let tanaka: TestHousehold;

async function rejects(p: Promise<unknown>, re: RegExp) {
  await assert.rejects(p, (e: Error) => {
    assert.match(e.message, re);
    return true;
  });
}

function qid(f: FormWithQuestions, label: string): string {
  const q = f.questions.find((x) => x.label === label);
  if (!q) throw new Error(`設問がありません: ${label}`);
  return q.id;
}

after(async () => {
  await closeDb();
});

describe("フォームの作成と編集", () => {
  beforeEach(async () => {
    seed = await resetDb();
    staff = await jushokuActor(seed);
    yamada = await createYamada(seed.templeId);
    tanaka = await createTanaka(seed.templeId);
  });
  it("設問の構造を検証する", () => {
    assert.throws(() => validateFormDraft(horokuInput({ title: "" })), /題名を入力/);
    assert.throws(() => validateFormDraft(horokuInput({ mode: "all" as never })), /公開範囲/);
    assert.throws(
      () => validateFormDraft(horokuInput({ questions: [{ type: "single", label: "参加", options: [] }] })),
      /選択肢を 1 つ以上/,
    );
    assert.throws(
      () => validateFormDraft(horokuInput({ questions: [{ type: "person_list", label: "人", itemFields: [] }] })),
      /1 人分の項目を 1 つ以上/,
    );
    assert.throws(
      () =>
        validateFormDraft(
          horokuInput({
            questions: [{ type: "person_list", label: "人", itemFields: [{ label: "住所", type: "short", profileField: "address" as never }] }],
          }),
        ),
      /氏名、カナ、生年月日、性別 だけ/,
    );
    assert.throws(() => validateFormDraft(horokuInput({ questions: [] })), /設問が 1 つもない/);
    // 項目のキーは profile_field か f<番号>
    const d = validateFormDraft(horokuInput());
    assert.deepEqual(d.questions[3].itemFields?.map((f) => f.key), ["kana", "name", "birth_date", "gender", "f5"]);
    assert.equal(d.questions[3].maxPersons, 5);
    assert.deepEqual(draftWarnings(d), []);
    assert.equal(draftWarnings({ ...d, questions: [d.questions[3]] }).length, 1);
  });

  it("下書きで作り、設問を足し、並べ替え、変え、消す。回答が届いたら設問は変えられない", async () => {
    const f = await createForm(staff, { title: "花まつり", mode: "public", questions: [] });
    assert.equal(f.status, "draft");
    await rejects(setFormStatus(staff, f.id, "open"), /設問が 1 つもない/);
    const a = await addQuestion(staff, f.id, { type: "short", label: "お名前", required: true, profileField: "name" });
    const b = await addQuestion(staff, f.id, { type: "number", label: "参加人数" });
    await moveQuestion(staff, b, "up");
    assert.deepEqual((await getForm(staff, f.id)).questions.map((q) => q.label), ["参加人数", "お名前"]);
    await updateQuestion(staff, b, { type: "single", label: "参加しますか", options: ["参加", "不参加"], required: true });
    await deleteQuestion(staff, a);
    const after1 = await getForm(staff, f.id);
    assert.deepEqual(after1.questions.map((q) => [q.label, q.type]), [["参加しますか", "single"]]);

    await setFormStatus(staff, f.id, "open");
    await submitResponse(publicRespondentActor(seed.templeId), f.id, { source: "public", answers: { [b]: "参加" } });
    await rejects(addQuestion(staff, f.id, { type: "short", label: "x" }), /回答が届いている/);
    await rejects(setFormStatus(staff, f.id, "draft"), /下書きに戻せません/);
    await setFormStatus(staff, f.id, "closed");
    const list = await listForms(staff);
    assert.equal(list.find((x) => x.id === f.id)?.responseCount, 1);
  });

  it("個別リンクの一覧。下書きでは発行せず、受付中にすると発行する", async () => {
    const f = await createForm(staff, horokuInput({ status: "draft" }));
    assert.ok((await listHouseholdLinks(staff, f.id)).every((l) => l.token === null));
    await setFormStatus(staff, f.id, "open");
    const links = await listHouseholdLinks(staff, f.id);
    assert.deepEqual(links.map((l) => l.householdName).sort(), ["山田家", "田中家"].sort());
    assert.ok(links.every((l) => l.url?.includes(`/f/${f.id}?t=`)));
  });
});

describe("集計と CSV", () => {
  let form: FormWithQuestions;

  beforeEach(async () => {
    seed = await resetDb();
    staff = await jushokuActor(seed);
    yamada = await createYamada(seed.templeId);
    tanaka = await createTanaka(seed.templeId);
    form = await createForm(
      staff,
      horokuInput({
        questions: [
          ...horokuInput().questions,
          { type: "single", label: "お斎", options: ["いただく", "いただかない"] },
          { type: "multi", label: "ご希望の時間", options: ["午前", "午後"] },
          { type: "number", label: "付き添いの人数" },
        ],
      }),
    );
    const pub = publicRespondentActor(seed.templeId);
    const list = qid(form, "祈願する方");
    // 檀家: 山田家（2 人）
    await submitResponse(pub, form.id, {
      source: "member_link",
      householdId: yamada.id,
      answers: {
        [list]: [
          { personId: yamada.members.taro, values: { f5: "家内安全" } },
          { personId: yamada.members.hanako, values: { f5: "病気平癒, 「早く」\n元気に" } },
        ],
        [qid(form, "お斎")]: "いただく",
        [qid(form, "ご希望の時間")]: ["午後", "午前"],
        [qid(form, "付き添いの人数")]: 2,
      },
    });
    // 一般: 2 件（1 人と 3 人）
    const person = (name: string) => ({ values: { kana: "カナ", name, birth_date: "1980-01-01", gender: "女", f5: "健康" } });
    await submitResponse(pub, form.id, {
      source: "public",
      answers: {
        [qid(form, "申込者のお名前")]: "鈴木 一郎",
        [qid(form, "電話番号")]: "090-1111-1111",
        [list]: [person("鈴木 一郎")],
        [qid(form, "お斎")]: "いただかない",
        [qid(form, "ご希望の時間")]: ["午前"],
        [qid(form, "付き添いの人数")]: "1",
      },
    });
    await submitResponse(pub, form.id, {
      source: "public",
      answers: {
        [qid(form, "申込者のお名前")]: "佐藤 花",
        [qid(form, "電話番号")]: "090-2222-2222",
        [list]: [person("佐藤 花"), person("佐藤 葉"), person("佐藤 実")],
        [qid(form, "お斎")]: "いただく",
      },
    });
  });

  it("回答の件数、選択肢ごとの件数、数値の合計、person_list の人数を、檀家・一般・合計で出す", async () => {
    const r = await getFormResults(staff, form.id);
    assert.deepEqual(r.responses, { member: 1, public: 2, total: 3 });
    assert.deepEqual(r.persons, { member: 2, public: 4, total: 6 });
    const byLabel = (l: string) => r.questions.find((q) => q.label === l)!;
    assert.deepEqual(byLabel("お斎").options, [
      { option: "いただく", count: { member: 1, public: 1, total: 2 } },
      { option: "いただかない", count: { member: 0, public: 1, total: 1 } },
    ]);
    assert.deepEqual(byLabel("ご希望の時間").options?.map((o) => o.count.total), [2, 1]);
    assert.deepEqual(byLabel("付き添いの人数").sum, { member: 2, public: 1, total: 3 });
    assert.deepEqual(byLabel("付き添いの人数").answered, { member: 1, public: 1, total: 2 });
    assert.deepEqual(byLabel("祈願する方").persons, { member: 2, public: 4, total: 6 });
    assert.equal(
      summarizeResults(r),
      "回答 3 件（檀家 1 件、一般 2 件）。祈願する方は 6 人（檀家 2 人、一般 4 人）",
    );
  });

  it("名簿の CSV は 1 人 1 行。BOM と CRLF をつけ、カンマや改行や引用符を囲む", async () => {
    const { body, filename } = await rosterCsv(staff, form.id);
    assert.equal(filename, "ほうろく灸 申し込み_名簿.csv");
    assert.ok(body.startsWith("﻿番号,受付日時,区分,世帯,回答者,連絡先,台帳から,カナ,氏名,生年月日,男女,祈願の主旨\r\n"));
    const lines = body.slice(1).trimEnd().split("\r\n");
    // ヘッダー + 6 人。花子の行は改行を含むので、行の数え方は「番号」で数える
    assert.equal((body.match(/\r\n\d+,/g) ?? []).length, 6);
    assert.ok(lines[1].startsWith("1,"));
    assert.ok(lines[1].includes(",檀家,山田家,山田 太郎,03-1111-2222,◯,ヤマダ タロウ,山田 太郎,1965-04-08,男,家内安全"));
    assert.ok(body.includes(`,◯,ヤマダ ハナコ,山田 花子,1968-09-15,女,"病気平癒, 「早く」\n元気に"`));
    assert.ok(body.includes(",一般,,佐藤 花,090-2222-2222,,カナ,佐藤 実,1980-01-01,女,健康"));
  });

  it("回答の CSV は 1 回答 1 行", async () => {
    const { body } = await responsesCsv(staff, form.id);
    assert.ok(body.startsWith("﻿受付日時,区分,入口,世帯,回答者,連絡先,申込者のお名前,電話番号,ご住所,祈願する方,お斎,ご希望の時間,付き添いの人数,人数\r\n"));
    assert.ok(body.includes(",檀家,個別リンク,山田家,山田 太郎,03-1111-2222,山田 太郎,03-1111-2222,東京都台東区谷中 1-2-3,2 人: 山田 太郎、山田 花子,いただく,午前、午後,2,2\r\n"));
    assert.ok(body.includes(",一般,共通リンク,,佐藤 花,090-2222-2222,佐藤 花,090-2222-2222,,3 人: 佐藤 花、佐藤 葉、佐藤 実,いただく,,,3\r\n"));
  });
});
