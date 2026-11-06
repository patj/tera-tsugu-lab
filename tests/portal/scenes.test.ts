// 台本の場面 5（田中家の窓口がポータルから法要を申し込む）と、場面 3（山田さんがポータルからほうろく灸に申し込む）
import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { closeDb, db } from "@/db/client";
import { formResponses, memorialRequests } from "@/db/schema";
import type { SeedContext } from "@/db/seed/context";
import { jst, type Actor } from "@/domain/core";
import { createForm, type FormWithQuestions } from "@/domain/forms";
import {
  applyMemorial,
  getMemorialApplyOptions,
  getPortalEventForm,
  getPortalFamilyTree,
  getPortalMemorialSchedule,
  listPortalEventResponses,
  listPortalEvents,
  listPortalMemorialRequests,
  submitPortalEvent,
} from "@/domain/portal";
import { resetDb } from "../helpers/db";
import { bookDirectly, loginByEmail, rejects, staffOf } from "./helpers";

let seed: SeedContext;
const TODAY = "2026-11-06";

after(async () => {
  await closeDb();
});

describe("場面 5: 田中家の窓口が、ポータルから法要を申し込む", () => {
  beforeEach(async () => {
    seed = await resetDb();
  });

  it("ログイン → 家系図と法要の予定 → 申し込み → 状況 → 確定すると、窓口にも家族にも予定が見える", async () => {
    // 1. 窓口の健一さんがメールアドレスでログインする（マジックリンク）
    const kenichi = await loginByEmail("kenichi.tanaka@example.com");

    // 2. 家系図: 4 世代（正雄・ヨシ → 一郎・和子 → 健一・美咲 → 陽菜）。故人も入る
    const tree = await getPortalFamilyTree(kenichi);
    const rows = tree.generations.map((g) => g.units.map((u) => u.people.map((p) => p.name).join("＝")).join(" / "));
    assert.deepEqual(rows, ["田中 正雄＝田中 ヨシ", "田中 一郎＝田中 和子", "田中 健一＝田中 美咲", "田中 陽菜"]);
    const kazuko = tree.generations[1].units[0].people.find((p) => p.name === "田中 和子")!;
    assert.equal(kazuko.isDeceased, true);
    assert.equal(kazuko.homyo, "蓮華院日和信女");
    assert.equal(tree.generations[2].units[0].people[0].isContact, true);
    assert.deepEqual(tree.generations[3].units[0].people[0].parentNames, ["健一", "美咲"]);

    // 3. 家の法要の予定: 今後の年忌の目安に「2027 年 妻・和子 三回忌」
    const before = await getPortalMemorialSchedule(kenichi, { today: TODAY });
    assert.deepEqual(before.confirmed, []);
    const sankaiki = before.upcoming.find((u) => u.name === "田中 和子" && u.kaiki === 3);
    assert.ok(sankaiki, JSON.stringify(before.upcoming));
    assert.equal(sankaiki.year, 2027);
    assert.equal(sankaiki.kaikiName, "三回忌");
    assert.equal(sankaiki.meinichi, "2027-04-12");
    assert.equal(sankaiki.relation, "妻");
    assert.ok(before.upcoming.every((u) => u.meinichi >= TODAY));
    // 2026 年の一周忌（4 月）は過ぎているので出ない
    assert.ok(!before.upcoming.some((u) => u.name === "田中 和子" && u.kaiki === 2));

    // 4. 申し込みフォーム: 回忌を自動で提案する（2027 年の和子さんは三回忌）。施主の初期値は本人
    const opts = await getMemorialApplyOptions(kenichi, { today: TODAY });
    const kz = opts.deceased.find((d) => d.name === "田中 和子")!;
    assert.deepEqual(kz.suggestions[2027], { kaiki: 3, kaikiName: "三回忌", isMemorialKaiki: true });
    assert.equal(kz.suggestions[2026].kaikiName, "一周忌");
    assert.equal(opts.defaultYear, 2027);
    assert.equal(opts.family[0].name, "田中 健一");
    assert.equal(opts.family[0].isSelf, true);
    assert.ok(opts.kaikiChoices.some((c) => c.kaiki === 3 && c.kaikiName === "三回忌"));
    assert.equal(opts.minDate, "2026-11-07");

    // 5. 申し込む（施主は世帯主の一郎さん、第 1・第 2 希望、お寺で、8 人、お斎あり）
    const { id } = await applyMemorial(
      kenichi,
      {
        targets: [{ personId: kz.id, kaiki: 3 }],
        seshuPersonId: seed.get("person:tanaka:head"),
        preferredPeriods: [
          { from: "2027-03-20", to: "2027-04-04", note: "土日を希望" },
          { from: "2027-04-05", to: "2027-04-11" },
        ],
        location: "temple",
        attendees: 8,
        otoki: true,
        notes: "高齢の父が参列します",
      },
      { today: TODAY },
    );
    const [row] = await db.select().from(memorialRequests).where(eq(memorialRequests.id, id));
    assert.equal(row.source, "portal");
    assert.equal(row.status, "requested");
    assert.equal(row.householdId, seed.get("household:tanaka"));
    assert.equal(row.requestedByPersonId, seed.get("person:tanaka:son"));
    assert.equal(row.seshuPersonId, seed.get("person:tanaka:head"));
    assert.equal(row.seshuName, null);
    assert.deepEqual(row.targets, [{ personId: kz.id, kaiki: 3 }]);
    assert.deepEqual(row.preferredPeriods, [
      { from: "2027-03-20", to: "2027-04-04", note: "土日を希望" },
      { from: "2027-04-05", to: "2027-04-11" },
    ]);
    assert.equal(row.attendees, 8);
    assert.equal(row.otoki, true);

    // 6. 申し込みの状況: 受付済み
    const listed = await listPortalMemorialRequests(kenichi);
    assert.equal(listed.length, 1);
    assert.equal(listed[0].status, "requested");
    assert.equal(listed[0].mine, true);
    assert.equal(listed[0].targets[0].kaikiName, "三回忌");
    assert.equal(listed[0].service, null);

    // 7. 住職が日時を確定する（04 の bookMemorialService の代わり）
    const startAt = jst("2027-03-27", "10:00");
    const serviceId = await bookDirectly(seed, id, { startAt });

    // 8. ポータルに確定した予定が出る。家族（一郎さん。閲覧を許可されている）にも同じ予定が見える
    const ichiro = await loginByEmail("ichiro.tanaka@example.com");
    for (const actor of [kenichi, ichiro] as Actor[]) {
      const s = await getPortalMemorialSchedule(actor, { today: TODAY });
      assert.equal(s.confirmed.length, 1);
      assert.equal(s.confirmed[0].id, serviceId);
      assert.equal(s.confirmed[0].startAt.getTime(), startAt.getTime());
      assert.equal(s.confirmed[0].location, "temple");
      assert.equal(s.confirmed[0].officiantName, "高橋 日照");
      assert.deepEqual(s.confirmed[0].targets.map((t) => `${t.name} ${t.kaikiName}`), ["田中 和子 三回忌"]);
      // 確定済みの年忌は、目安から消える
      assert.ok(!s.upcoming.some((u) => u.name === "田中 和子" && u.kaiki === 3));
      const r = await listPortalMemorialRequests(actor);
      assert.equal(r[0].status, "scheduled");
      assert.equal(r[0].service?.id, serviceId);
    }
    // 確定した日を過ぎると、確定の予定には出ない
    const later = await getPortalMemorialSchedule(kenichi, { today: "2027-03-28" });
    assert.equal(later.confirmed.length, 0);
  });

  it("複数の故人をあわせて供養する申し込み（故人ごとの回忌）。施主は名前の入力もできる", async () => {
    const kenichi = await loginByEmail("kenichi.tanaka@example.com");
    const { id } = await applyMemorial(
      kenichi,
      {
        targets: [
          { personId: seed.get("person:tanaka:wife"), kaiki: 3 },
          { personId: seed.get("person:tanaka:father"), kaiki: 19 },
        ],
        seshuName: "田中 一郎（代理 健一）",
        preferredPeriods: [{ from: "2027-03-01", to: "2027-03-31" }],
        location: "grave",
      },
      { today: TODAY },
    );
    const [row] = await db.select().from(memorialRequests).where(eq(memorialRequests.id, id));
    assert.equal(row.targets.length, 2);
    assert.equal(row.seshuPersonId, null);
    assert.equal(row.seshuName, "田中 一郎（代理 健一）");
    const listed = await listPortalMemorialRequests(kenichi);
    assert.deepEqual(listed[0].targets.map((t) => t.kaikiName), ["三回忌", "十九回忌"]);
  });

  it("施主を指定しなければ申し込んだ本人。入力の誤りは日本語で拒否する", async () => {
    const kenichi = await loginByEmail("kenichi.tanaka@example.com");
    const wife = seed.get("person:tanaka:wife");
    const base = { targets: [{ personId: wife, kaiki: 3 }], preferredPeriods: [{ from: "2027-03-01", to: "2027-03-31" }], location: "temple" };
    const { id } = await applyMemorial(kenichi, base, { today: TODAY });
    const [row] = await db.select().from(memorialRequests).where(eq(memorialRequests.id, id));
    assert.equal(row.seshuPersonId, seed.get("person:tanaka:son"));

    const bad = (patch: Record<string, unknown>, re: RegExp) =>
      rejects(applyMemorial(kenichi, { ...base, ...patch } as typeof base, { today: TODAY }), "invalid", re);
    await bad({ targets: [] }, /故人を 1 人以上/);
    await bad({ targets: [{ personId: wife, kaiki: 3 }, { personId: wife, kaiki: 3 }] }, /2 回選ばれています/);
    await bad({ targets: [{ personId: wife, kaiki: 0 }] }, /回忌/);
    await bad({ targets: [{ personId: wife, kaiki: 2.5 }] }, /回忌/);
    await bad({ targets: [{ personId: seed.get("person:tanaka:son"), kaiki: 3 }] }, /過去帳/);
    await bad({ seshuPersonId: seed.get("person:tanaka:head"), seshuName: "田中 一郎" }, /どちらか/);
    await bad({ seshuPersonId: wife }, /この家のご家族/);
    await bad({ preferredPeriods: [] }, /第 1 希望/);
    await bad({ preferredPeriods: [{ from: "2026-11-06", to: "2026-11-30" }] }, /明日以降/);
    await bad({ preferredPeriods: [{ from: "2027-03-31", to: "2027-03-01" }] }, /終わりの日/);
    await bad({ preferredPeriods: [{ from: "2027-02-30", to: "2027-03-01" }] }, /正しい日付/);
    await bad({ preferredPeriods: [{ from: "2027-01-01", to: "2027-12-31" }] }, /3 か月以内/);
    await bad(
      { preferredPeriods: [1, 2, 3, 4].map((i) => ({ from: `2027-0${i}-01`, to: `2027-0${i}-10` })) },
      /第 3 希望まで/,
    );
    await bad({ location: "hall" }, /場所/);
    await bad({ attendees: 0 }, /人数/);
    await bad({ notes: "あ".repeat(1001) }, /連絡事項/);
    assert.equal((await db.select().from(memorialRequests)).length, 1);
  });
});

function horoku(): Parameters<typeof createForm>[1] {
  return {
    title: "ほうろく灸 申し込み",
    description: "夏の土用に、ほうろく灸の祈祷を行います",
    mode: "both",
    status: "open",
    questions: [
      { type: "short", label: "代表者のお名前", required: true, profileField: "name" },
      { type: "short", label: "電話番号", required: true, profileField: "phone" },
      {
        type: "person_list",
        label: "祈願する方",
        required: true,
        maxPersons: 5,
        itemFields: [
          { label: "カナ", type: "short", required: true, profileField: "kana" },
          { label: "氏名", type: "short", required: true, profileField: "name" },
          { label: "生年月日", type: "date", required: true, profileField: "birth_date" },
          { label: "男・女", type: "single", required: true, options: ["男", "女"], profileField: "gender" },
          { label: "祈願の主旨", type: "long", required: true },
        ],
      },
    ],
  };
}

describe("場面 3: 山田さんが、ポータルからほうろく灸に申し込む", () => {
  let form: FormWithQuestions;
  beforeEach(async () => {
    seed = await resetDb();
    form = await createForm(await staffOf(seed), horoku());
  });

  it("家族を選ぶだけで台帳の項目が入り、祈願の主旨だけを入力する。source = portal で、本人と世帯にひもづく", async () => {
    const ken = await loginByEmail("ken.yamada@example.com");
    const events = await listPortalEvents(ken);
    const ev = events.find((e) => e.id === form.id);
    assert.ok(ev);
    assert.equal(ev.myResponseCount, 0);

    const view = await getPortalEventForm(ken, form.id);
    assert.equal(view.availability, "ok");
    assert.equal(view.source, "portal");
    // 台帳でわかる設問（代表者のお名前、電話番号）は出ない
    assert.deepEqual(view.questions.map((q) => q.label), ["祈願する方"]);
    const q = view.questions[0];
    const yumi = q.candidates.find((c) => c.name === "山田 由美")!;
    const shota = q.candidates.find((c) => c.name === "山田 翔太")!;
    assert.ok(yumi && shota);
    assert.ok(q.candidates.every((c) => c.name.startsWith("山田")));
    const kanaKey = q.itemFields!.find((f) => f.label === "カナ")!.key;
    const wishKey = q.itemFields!.find((f) => f.label === "祈願の主旨")!.key;
    assert.equal(yumi.values[kanaKey], "やまだ ゆみ");

    // 家族を選び、祈願の主旨だけを入力する（台帳の項目は送らない）
    const { id } = await submitPortalEvent(ken, form.id, {
      [q.id]: [
        { personId: yumi.personId, values: { [wishKey]: "腰痛平癒" } },
        { personId: shota.personId, values: { [wishKey]: "学業成就" } },
      ],
    });
    const [row] = await db.select().from(formResponses).where(eq(formResponses.id, id));
    assert.equal(row.source, "portal");
    assert.equal(row.personId, seed.get("person:yamada:head"));
    assert.equal(row.householdId, seed.get("household:yamada"));
    const entries = row.answers[q.id] as { personId: string; values: Record<string, string> }[];
    assert.equal(entries.length, 2);
    assert.equal(entries[0].values[kanaKey], "やまだ ゆみ");
    assert.equal(entries[0].values[wishKey], "腰痛平癒");
    const birthKey = q.itemFields!.find((f) => f.label === "生年月日")!.key;
    assert.equal(entries[1].values[birthKey], "1998-11-15");

    // 自分の申し込みの確認
    const mine = await listPortalEventResponses(ken);
    assert.equal(mine.mine.length, 1);
    assert.equal(mine.mine[0].formTitle, "ほうろく灸 申し込み");
    assert.ok(mine.household?.some((r) => r.id === id));
    assert.equal((await listPortalEvents(ken)).find((e) => e.id === form.id)!.myResponseCount, 1);

    // 田中家の窓口からは、山田さんの申し込みは見えない
    const kenichi = await loginByEmail("kenichi.tanaka@example.com");
    const t = await listPortalEventResponses(kenichi);
    assert.ok(!t.mine.some((r) => r.id === id));
    assert.ok(!t.household!.some((r) => r.id === id));
  });

  it("ほかの家の人は選べない。家族（窓口でない）は、世帯の申し込みではなく自分の申し込みだけを見る", async () => {
    const ken = await loginByEmail("ken.yamada@example.com");
    const view = await getPortalEventForm(ken, form.id);
    const q = view.questions[0];
    const wishKey = q.itemFields!.find((f) => f.label === "祈願の主旨")!.key;
    await rejects(
      submitPortalEvent(ken, form.id, { [q.id]: [{ personId: seed.get("person:tanaka:son"), values: { [wishKey]: "x" } }] }),
      "invalid",
      /家族に見つかりません/,
    );
    await submitPortalEvent(ken, form.id, { [q.id]: [{ personId: seed.get("person:yamada:head"), values: { [wishKey]: "無病息災" } }] });

    const ichiro = await loginByEmail("ichiro.tanaka@example.com");
    const iview = await getPortalEventForm(ichiro, form.id);
    const iq = iview.questions[0];
    await submitPortalEvent(ichiro, form.id, { [iq.id]: [{ personId: seed.get("person:tanaka:head"), values: { [wishKey]: "健康長寿" } }] });
    const r = await listPortalEventResponses(ichiro);
    assert.equal(r.mine.length, 1);
    assert.equal(r.household, null);
    const kenichi = await loginByEmail("kenichi.tanaka@example.com");
    const k = await listPortalEventResponses(kenichi);
    assert.equal(k.mine.length, 0);
    assert.equal(k.household!.length, 1, "窓口は、一郎さんの申し込みも世帯の申し込みとして見られる");
  });
});
