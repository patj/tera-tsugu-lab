// フォームのテストの準備。台帳（01）のシードはまだ使えないので、世帯と人をテストの中で直接 insert する
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { households, persons } from "@/db/schema";
import { staffActor, getStaffById, type Actor } from "@/domain/core";
import type { SeedContext } from "@/db/seed/context";
import type { FormInput } from "@/domain/forms";

export type TestHousehold = {
  id: string;
  members: Record<string, string>;
};

type PersonSeed = {
  key: string;
  familyName: string;
  givenName: string;
  kana: string;
  gender: "male" | "female";
  birthDate: string;
  isDeceased?: boolean;
  mobilePhone?: string;
  email?: string;
};

export async function createHousehold(
  templeId: string,
  h: { name: string; address: string; phone: string; status?: string },
  people: PersonSeed[],
  contactKey?: string,
): Promise<TestHousehold> {
  const [row] = await db
    .insert(households)
    .values({ templeId, name: h.name, address: h.address, phone: h.phone, status: h.status ?? "active" })
    .returning({ id: households.id });
  const members: Record<string, string> = {};
  for (const p of people) {
    const [pr] = await db
      .insert(persons)
      .values({
        templeId,
        householdId: row.id,
        familyName: p.familyName,
        givenName: p.givenName,
        kana: p.kana,
        gender: p.gender,
        birthDate: p.birthDate,
        isDeceased: p.isDeceased ?? false,
        mobilePhone: p.mobilePhone ?? null,
        email: p.email ?? null,
      })
      .returning({ id: persons.id });
    members[p.key] = pr.id;
  }
  const head = members[people[0]?.key];
  if (head) {
    await db
      .update(households)
      .set({ headPersonId: head, contactPersonId: contactKey ? members[contactKey] : head })
      .where(eq(households.id, row.id));
  }
  return { id: row.id, members };
}

/** 山田家（デモの檀家）。太郎（窓口）、花子、一郎。父の茂は故人 */
export function createYamada(templeId: string) {
  return createHousehold(
    templeId,
    { name: "山田家", address: "東京都台東区谷中 1-2-3", phone: "03-1111-2222" },
    [
      { key: "taro", familyName: "山田", givenName: "太郎", kana: "ヤマダ タロウ", gender: "male", birthDate: "1965-04-08", email: "taro@example.com" },
      { key: "hanako", familyName: "山田", givenName: "花子", kana: "ヤマダ ハナコ", gender: "female", birthDate: "1968-09-15" },
      { key: "ichiro", familyName: "山田", givenName: "一郎", kana: "ヤマダ イチロウ", gender: "male", birthDate: "1995-01-20" },
      { key: "shigeru", familyName: "山田", givenName: "茂", kana: "ヤマダ シゲル", gender: "male", birthDate: "1935-02-01", isDeceased: true },
    ],
  );
}

export function createTanaka(templeId: string) {
  return createHousehold(
    templeId,
    { name: "田中家", address: "東京都文京区根津 4-5-6", phone: "03-3333-4444" },
    [{ key: "kazuo", familyName: "田中", givenName: "一夫", kana: "タナカ カズオ", gender: "male", birthDate: "1950-06-01" }],
  );
}

export async function jushokuActor(seed: SeedContext): Promise<Actor & { staffId: string }> {
  const s = await getStaffById(seed.get("staff:jushoku"));
  if (!s) throw new Error("住職が見つかりません");
  return { ...staffActor(s, "web"), staffId: s.id };
}

/** ほうろく灸のフォーム（台本の場面 3 で Claude が組み立てる形） */
export function horokuInput(overrides: Partial<FormInput> = {}): FormInput {
  return {
    title: "ほうろく灸 申し込み",
    description: "祈願する方ごとにご記入ください。",
    mode: "both",
    status: "open",
    questions: [
      { type: "short", label: "申込者のお名前", required: true, profileField: "name" },
      { type: "short", label: "電話番号", required: true, profileField: "phone" },
      { type: "short", label: "ご住所", profileField: "address" },
      {
        type: "person_list",
        label: "祈願する方",
        required: true,
        maxPersons: 5,
        itemFields: [
          { label: "カナ", type: "short", required: true, profileField: "kana" },
          { label: "氏名", type: "short", required: true, profileField: "name" },
          { label: "生年月日", type: "date", required: true, profileField: "birth_date" },
          { label: "男女", type: "single", required: true, options: ["男", "女"], profileField: "gender" },
          { label: "祈願の主旨", type: "long", required: true },
        ],
      },
    ],
    ...overrides,
  };
}
