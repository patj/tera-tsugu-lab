"use server";
// 台帳の管理画面の Server Actions。業務のロジックはドメイン層（src/domain/ledger）が持つ。
// 失敗したら（DomainError）、元の画面に ?error= をつけて戻す。成功したら ?done= をつけて移る。

import { redirect } from "next/navigation";
import { isDomainError } from "@/domain/core";
import {
  addContactLog,
  addRelation,
  createHousehold,
  createPerson,
  removeRelation,
  setHouseholdRoles,
  updateHousehold,
  updatePerson,
  type HouseholdInput,
  type PersonInput,
} from "@/domain/ledger";
import { getStaffActor } from "@/lib/staff-auth";

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
}

function withParam(path: string, key: string, value: string): string {
  const [base, query = ""] = path.split("?");
  const sp = new URLSearchParams(query);
  sp.delete("error");
  sp.delete("done");
  sp.set(key, value);
  return `${base}?${sp.toString()}`;
}

/** 元の画面のパス（/admin/ledger 以下だけを受け付ける） */
function backPath(fd: FormData, fallback: string): string {
  const b = str(fd, "back");
  return b.startsWith("/admin/ledger") ? b : fallback;
}

/** fn を実行し、成功したら移り先へ、DomainError なら元の画面へ ?error= をつけて戻す。redirect は try の外で呼ぶ */
async function run(back: string, fn: () => Promise<string>): Promise<never> {
  let dest: string;
  try {
    dest = await fn();
  } catch (e) {
    if (!isDomainError(e)) throw e;
    dest = withParam(back, "error", e.message);
  }
  redirect(dest);
}

function householdInput(fd: FormData): HouseholdInput {
  return {
    name: str(fd, "name"),
    kana: str(fd, "kana"),
    postalCode: str(fd, "postalCode"),
    address: str(fd, "address"),
    phone: str(fd, "phone"),
    graveAddress: str(fd, "graveAddress"),
    status: str(fd, "status") || "active",
    joinedOn: str(fd, "joinedOn"),
    notes: str(fd, "notes"),
  };
}

function personInput(fd: FormData): PersonInput {
  const age = str(fd, "ageAtDeath").trim();
  return {
    familyName: str(fd, "familyName"),
    givenName: str(fd, "givenName"),
    kana: str(fd, "kana"),
    gender: str(fd, "gender"),
    relation: str(fd, "relation"),
    birthDate: str(fd, "birthDate"),
    mobilePhone: str(fd, "mobilePhone"),
    email: str(fd, "email"),
    isDeceased: fd.get("isDeceased") === "on",
    deathDate: str(fd, "deathDate"),
    homyo: str(fd, "homyo"),
    ageAtDeath: age === "" ? null : Number(age),
    notes: str(fd, "notes"),
  };
}

export async function createHouseholdAction(fd: FormData): Promise<void> {
  await run("/admin/ledger/households/new", async () => {
    const actor = await getStaffActor();
    const { id } = await createHousehold(actor, householdInput(fd));
    return withParam(`/admin/ledger/households/${id}`, "done", "世帯を作りました。続けて家族を登録してください");
  });
}

export async function updateHouseholdAction(fd: FormData): Promise<void> {
  const id = str(fd, "householdId");
  await run(`/admin/ledger/households/${id}/edit`, async () => {
    const actor = await getStaffActor();
    await updateHousehold(actor, id, householdInput(fd));
    return withParam(`/admin/ledger/households/${id}`, "done", "世帯の情報を保存しました");
  });
}

export async function setHouseholdRolesAction(fd: FormData): Promise<void> {
  const id = str(fd, "householdId");
  await run(backPath(fd, `/admin/ledger/households/${id}`), async () => {
    const actor = await getStaffActor();
    await setHouseholdRoles(actor, id, {
      headPersonId: str(fd, "headPersonId") || null,
      contactPersonId: str(fd, "contactPersonId") || null,
    });
    return withParam(`/admin/ledger/households/${id}`, "done", "世帯主と窓口を保存しました");
  });
}

export async function createPersonAction(fd: FormData): Promise<void> {
  const householdId = str(fd, "householdId");
  await run(backPath(fd, `/admin/ledger/households/${householdId}/persons/new`), async () => {
    const actor = await getStaffActor();
    await createPerson(actor, { householdId, ...personInput(fd) });
    return withParam(`/admin/ledger/households/${householdId}`, "done", "登録しました");
  });
}

export async function updatePersonAction(fd: FormData): Promise<void> {
  const id = str(fd, "personId");
  const householdId = str(fd, "householdId");
  await run(`/admin/ledger/persons/${id}/edit`, async () => {
    const actor = await getStaffActor();
    await updatePerson(actor, id, personInput(fd));
    return withParam(`/admin/ledger/households/${householdId}`, "done", "保存しました");
  });
}

export async function addRelationAction(fd: FormData): Promise<void> {
  const id = str(fd, "personId");
  const back = `/admin/ledger/persons/${id}/edit`;
  await run(back, async () => {
    const actor = await getStaffActor();
    const other = str(fd, "otherPersonId");
    const role = str(fd, "role");
    // role は「相手がこの人の何か」: parent（相手が親）/ child（相手が子）/ spouse
    if (role === "child") {
      await addRelation(actor, { personId: other, relatedPersonId: id, kind: "parent" });
    } else {
      await addRelation(actor, { personId: id, relatedPersonId: other, kind: role === "spouse" ? "spouse" : "parent" });
    }
    return withParam(back, "done", "関係を登録しました");
  });
}

export async function removeRelationAction(fd: FormData): Promise<void> {
  const id = str(fd, "personId");
  const back = `/admin/ledger/persons/${id}/edit`;
  await run(back, async () => {
    const actor = await getStaffActor();
    await removeRelation(actor, str(fd, "relationId"));
    return withParam(back, "done", "関係を外しました");
  });
}

export async function addContactLogAction(fd: FormData): Promise<void> {
  const householdId = str(fd, "householdId");
  const back = `/admin/ledger/households/${householdId}`;
  await run(back, async () => {
    const actor = await getStaffActor();
    await addContactLog(actor, { householdId, kind: str(fd, "kind"), body: str(fd, "body") });
    return withParam(back, "done", "対応記録を追加しました");
  });
}
