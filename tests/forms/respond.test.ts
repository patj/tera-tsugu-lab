// 回答する側: 入口ごとの出し分け、person_list の自動入力、検証、ポータル向けの関数
import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { closeDb, db } from "@/db/client";
import { formResponses } from "@/db/schema";
import { portalActor, type Actor } from "@/domain/core";
import {
  createForm,
  findHouseholdToken,
  getFormForRespondent,
  listOpenFormsForPortal,
  listResponsesOfHousehold,
  listResponsesOfPerson,
  publicRespondentActor,
  resolveHouseholdToken,
  setFormStatus,
  submitResponse,
  type FormWithQuestions,
  type PersonEntry,
} from "@/domain/forms";
import type { SeedContext } from "@/db/seed/context";
import { resetDb } from "../helpers/db";
import { createTanaka, createYamada, horokuInput, jushokuActor, type TestHousehold } from "./helpers";

let seed: SeedContext;
let staff: Actor;
let yamada: TestHousehold;
let tanaka: TestHousehold;
let form: FormWithQuestions;
let pub: Actor;

function qid(f: FormWithQuestions, label: string): string {
  const q = f.questions.find((x) => x.label === label);
  if (!q) throw new Error(`設問がありません: ${label}`);
  return q.id;
}

async function rejects(p: Promise<unknown>, re: RegExp) {
  await assert.rejects(p, (e: Error) => {
    assert.match(e.message, re);
    return true;
  });
}

describe("回答する側", () => {
  beforeEach(async () => {
    seed = await resetDb();
    staff = await jushokuActor(seed);
    yamada = await createYamada(seed.templeId);
    tanaka = await createTanaka(seed.templeId);
    form = await createForm(staff, horokuInput());
    pub = publicRespondentActor(seed.templeId);
  });
  after(async () => {
    await closeDb();
  });

  it("受付中にすると、檀家の世帯ごとに推測できない個別リンクを発行する", async () => {
    const t1 = await findHouseholdToken(form.id, yamada.id);
    const t2 = await findHouseholdToken(form.id, tanaka.id);
    assert.ok(t1 && t2);
    assert.notEqual(t1, t2);
    assert.ok(t1.length >= 22);
    assert.equal(await resolveHouseholdToken(form.id, t1), yamada.id);
    // ほかのフォームのトークンは使えない
    const other = await createForm(staff, horokuInput({ title: "別の行事" }));
    assert.equal(await resolveHouseholdToken(other.id, t1), null);
    assert.equal(await resolveHouseholdToken(form.id, "nope"), null);
  });

  it("共通リンクは全項目、個別リンクとポータルは profile_field の設問を隠す", async () => {
    const p = await getFormForRespondent(form.id, { source: "public" });
    assert.deepEqual(
      p?.questions.map((q) => q.label),
      ["申込者のお名前", "電話番号", "ご住所", "祈願する方"],
    );
    assert.equal(p?.questions[3].itemFields?.some((f) => f.autoFill), false);
    assert.deepEqual(p?.questions[3].candidates, []);

    for (const source of ["member_link", "portal"] as const) {
      const m = await getFormForRespondent(form.id, { source, householdId: yamada.id });
      assert.deepEqual(m?.questions.map((q) => q.label), ["祈願する方"]);
      assert.equal(m?.household?.name, "山田家");
    }
  });

  it("person_list に、生きている家族の候補と台帳の値がつく", async () => {
    const m = await getFormForRespondent(form.id, { source: "member_link", householdId: yamada.id });
    const list = m!.questions[0];
    assert.deepEqual(
      list.itemFields?.map((f) => [f.label, f.autoFill]),
      [["カナ", true], ["氏名", true], ["生年月日", true], ["男女", true], ["祈願の主旨", false]],
    );
    assert.deepEqual(list.candidates.map((c) => c.name), ["山田 太郎", "山田 花子", "山田 一郎"]);
    const hanako = list.candidates.find((c) => c.name === "山田 花子")!;
    assert.deepEqual(hanako.values, { kana: "ヤマダ ハナコ", name: "山田 花子", birth_date: "1968-09-15", gender: "女" });
  });

  it("個別リンク: 家族を選ぶと台帳の値で保存し、隠した設問は世帯の住所と電話で埋める", async () => {
    const list = qid(form, "祈願する方");
    const entries: PersonEntry[] = [
      // 送られてきた台帳の項目は使わない（台帳の値で上書きする）
      { personId: yamada.members.taro, values: { name: "いたずら", f5: "家内安全" } },
      { personId: yamada.members.hanako, values: { f5: "病気平癒" } },
    ];
    const { id } = await submitResponse(pub, form.id, {
      source: "member_link",
      householdId: yamada.id,
      answers: { [list]: entries, [qid(form, "電話番号")]: "090-0000-0000" },
    });
    const [row] = await db.select().from(formResponses).where(eq(formResponses.id, id));
    assert.equal(row.householdId, yamada.id);
    assert.equal(row.source, "member_link");
    assert.equal(row.respondentName, "山田 太郎");
    assert.equal(row.contact, "03-1111-2222");
    const saved = row.answers as Record<string, unknown>;
    assert.equal(saved[qid(form, "ご住所")], "東京都台東区谷中 1-2-3");
    assert.equal(saved[qid(form, "電話番号")], "03-1111-2222");
    assert.deepEqual(saved[list], [
      { personId: yamada.members.taro, values: { kana: "ヤマダ タロウ", name: "山田 太郎", birth_date: "1965-04-08", gender: "男", f5: "家内安全" } },
      { personId: yamada.members.hanako, values: { kana: "ヤマダ ハナコ", name: "山田 花子", birth_date: "1968-09-15", gender: "女", f5: "病気平癒" } },
    ]);
  });

  it("個別リンク: 台帳にない人は手で入力できる。台帳にない項目（祈願の主旨）は必須のまま", async () => {
    const list = qid(form, "祈願する方");
    await rejects(
      submitResponse(pub, form.id, {
        source: "member_link",
        householdId: yamada.id,
        answers: { [list]: [{ personId: yamada.members.taro, values: {} }] },
      }),
      /1 人目の「祈願の主旨」を入力してください/,
    );
    await submitResponse(pub, form.id, {
      source: "member_link",
      householdId: yamada.id,
      answers: {
        [list]: [{ values: { kana: "サトウ ミキ", name: "佐藤 美紀", birth_date: "2000-03-03", gender: "女", f5: "学業成就" } }],
      },
    });
  });

  it("個別リンク: ほかの世帯の人、故人、同じ人の重複は選べない", async () => {
    const list = qid(form, "祈願する方");
    const submit = (entries: PersonEntry[]) =>
      submitResponse(pub, form.id, { source: "member_link", householdId: yamada.id, answers: { [list]: entries } });
    await rejects(submit([{ personId: tanaka.members.kazuo, values: { f5: "x" } }]), /この世帯の家族に見つかりません/);
    await rejects(submit([{ personId: yamada.members.shigeru, values: { f5: "x" } }]), /この世帯の家族に見つかりません/);
    await rejects(
      submit([
        { personId: yamada.members.taro, values: { f5: "x" } },
        { personId: yamada.members.taro, values: { f5: "y" } },
      ]),
      /2 回選ばれています/,
    );
  });

  it("共通リンク: 全項目を検証する（必須、選択肢、日付、人数の上限、家族は選べない）", async () => {
    const list = qid(form, "祈願する方");
    const person = { kana: "スズキ イチロウ", name: "鈴木 一郎", birth_date: "1970-01-01", gender: "男", f5: "身体健全" };
    const base = {
      [qid(form, "申込者のお名前")]: "鈴木 一郎",
      [qid(form, "電話番号")]: "090-1234-5678",
      [list]: [{ values: person }],
    };
    const submit = (answers: Record<string, unknown>) => submitResponse(pub, form.id, { source: "public", answers });

    await rejects(submit({ ...base, [qid(form, "電話番号")]: "" }), /「電話番号」を入力してください/);
    await rejects(submit({ ...base, [list]: [] }), /「祈願する方」を 1 人以上入力してください/);
    await rejects(submit({ ...base, [list]: [{ values: { ...person, gender: "その他" } }] }), /選択肢から選んでください/);
    await rejects(submit({ ...base, [list]: [{ values: { ...person, birth_date: "1970-02-30" } }] }), /日付/);
    await rejects(submit({ ...base, [list]: Array.from({ length: 6 }, () => ({ values: person })) }), /5 人までです/);
    await rejects(submit({ ...base, [list]: [{ personId: yamada.members.taro, values: person }] }), /台帳の家族を選べません/);

    const { id } = await submit(base);
    const [row] = await db.select().from(formResponses).where(eq(formResponses.id, id));
    assert.equal(row.householdId, null);
    assert.equal(row.respondentName, "鈴木 一郎");
    assert.equal(row.contact, "090-1234-5678");
  });

  it("公開範囲と入口が合わないとき、締め切りのとき、下書きのときは回答できない", async () => {
    const members = await createForm(staff, horokuInput({ title: "檀家だけ", mode: "members" }));
    const v = await getFormForRespondent(members.id, { source: "public" });
    assert.equal(v?.availability, "mode_mismatch");
    assert.match(v?.notice ?? "", /檀家の方専用/);
    await rejects(submitResponse(pub, members.id, { source: "public", answers: {} }), /檀家の方専用/);

    const publicOnly = await createForm(staff, horokuInput({ title: "一般だけ", mode: "public" }));
    assert.equal(await findHouseholdToken(publicOnly.id, yamada.id), null);
    await rejects(
      submitResponse(pub, publicOnly.id, { source: "member_link", householdId: yamada.id, answers: {} }),
      /共通のリンクから/,
    );

    await setFormStatus(staff, form.id, "closed");
    assert.equal((await getFormForRespondent(form.id, { source: "public" }))?.availability, "closed");
    await rejects(submitResponse(pub, form.id, { source: "public", answers: {} }), /締め切りました/);

    const draft = await createForm(staff, horokuInput({ title: "下書き", status: "draft" }));
    assert.equal(await getFormForRespondent(draft.id, { source: "public" }), null);
    assert.equal(await getFormForRespondent("not-a-uuid", { source: "public" }), null);
    await rejects(submitResponse(pub, draft.id, { source: "public", answers: {} }), /見つかりません/);
  });

  it("ポータル: 回答した人と世帯にひもづき、自分や世帯の申し込みを確認できる", async () => {
    const hanako: Actor = portalActor({
      id: "00000000-0000-0000-0000-000000000001",
      templeId: seed.templeId,
      personId: yamada.members.hanako,
      displayName: "山田 花子",
    });
    const list = qid(form, "祈願する方");
    await rejects(
      submitResponse(pub, form.id, { source: "portal", answers: {} }),
      /ポータルにログインしてから/,
    );
    await rejects(
      submitResponse(hanako, form.id, { source: "portal", householdId: tanaka.id, answers: {} }),
      /ほかの世帯/,
    );
    await submitResponse(hanako, form.id, {
      source: "portal",
      answers: { [list]: [{ personId: yamada.members.hanako, values: { f5: "厄除け" } }] },
    });
    const [row] = await db.select().from(formResponses).where(eq(formResponses.formId, form.id));
    assert.equal(row.personId, yamada.members.hanako);
    assert.equal(row.householdId, yamada.id);
    assert.equal(row.respondentName, "山田 花子");

    const mine = await listResponsesOfPerson(yamada.members.hanako);
    assert.equal(mine.length, 1);
    assert.equal(mine[0].formTitle, "ほうろく灸 申し込み");
    assert.deepEqual(mine[0].items.find((i) => i.label === "祈願する方"), { label: "祈願する方", value: "1 人: 山田 花子" });
    assert.equal((await listResponsesOfHousehold(yamada.id)).length, 1);
    assert.equal((await listResponsesOfHousehold(tanaka.id)).length, 0);
    assert.equal((await listResponsesOfPerson(yamada.members.taro)).length, 0);
  });

  it("ポータルに表示するのは、members か both で受付中のフォーム", async () => {
    await createForm(staff, horokuInput({ title: "一般だけ", mode: "public" }));
    await createForm(staff, horokuInput({ title: "檀家だけ", mode: "members" }));
    await createForm(staff, horokuInput({ title: "下書き", status: "draft" }));
    const titles = (await listOpenFormsForPortal(seed.templeId)).map((f) => f.title).sort();
    assert.deepEqual(titles, ["ほうろく灸 申し込み", "檀家だけ"].sort());
    // お寺を省略すると、最初のお寺
    assert.equal((await listOpenFormsForPortal()).length, 2);
  });
});
