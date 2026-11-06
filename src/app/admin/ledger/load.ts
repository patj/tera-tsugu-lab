// 管理画面のページで使う読み込み。見つからなければ 404 にする
import { notFound } from "next/navigation";
import { isDomainError } from "@/domain/core";
import { getHousehold, getPerson, type HouseholdDetail, type PersonDetail } from "@/domain/ledger";
import { getStaffActor } from "@/lib/staff-auth";

async function or404<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (e) {
    if (isDomainError(e) && e.code === "not_found") notFound();
    throw e;
  }
}

export async function loadHousehold(id: string, contactLogLimit = 30): Promise<HouseholdDetail> {
  return or404(getHousehold(await getStaffActor(), id, { contactLogLimit }));
}

export async function loadPerson(id: string): Promise<PersonDetail> {
  return or404(getPerson(await getStaffActor(), id));
}
