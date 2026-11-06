// スタッフによる予約の登録（電話で受けたときなど）。管理画面と MCP の create_reservation から使う
import { db, type DbOrTx } from "@/db/client";
import type { Actor } from "@/domain/core";
import { createContact } from "./ledger-adapter";
import { createReservation, type CreateReservationInput, type Reservation } from "./reservations";

export type RegisterReservationInput = Omit<CreateReservationInput, "contactId"> & {
  /** 申込者（一般の方）。氏名があれば一般コンタクトとして登録して、予約にひもづける */
  contact?: { name?: string | null; phone?: string | null; email?: string | null };
};

/** 一般コンタクトの登録と予約の作成を、1 つのトランザクションで行う */
export async function registerReservation(
  actor: Actor,
  input: RegisterReservationInput,
  conn: DbOrTx = db,
): Promise<Reservation> {
  const { contact, ...rest } = input;
  return conn.transaction(async (tx) => {
    const name = contact?.name?.trim();
    const c = name ? await createContact(actor, tx, { name, phone: contact?.phone, email: contact?.email }) : null;
    return createReservation(actor, tx, { ...rest, contactId: c?.id ?? null });
  });
}
