// スタッフ（ログイン、一覧）
import { and, asc, eq } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { staff } from "@/db/schema";
import { verifyPassword } from "./password";

export type Staff = {
  id: string;
  templeId: string;
  name: string;
  kana: string | null;
  roleTitle: string;
  email: string | null;
  isOfficiant: boolean;
  position: number;
  canLogin: boolean;
};

type StaffRow = typeof staff.$inferSelect;

function toStaff(row: StaffRow): Staff {
  return {
    id: row.id,
    templeId: row.templeId,
    name: row.name,
    kana: row.kana,
    roleTitle: row.roleTitle,
    email: row.email,
    isOfficiant: row.isOfficiant,
    position: row.position,
    canLogin: Boolean(row.email && row.passwordHash),
  };
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** メールとパスワードを確かめる。合わなければ null */
export async function authenticateStaff(email: string, password: string): Promise<Staff | null> {
  const [row] = await db.select().from(staff).where(eq(staff.email, normalizeEmail(email)));
  if (!row || !row.passwordHash) return null;
  if (!(await verifyPassword(password, row.passwordHash))) return null;
  return toStaff(row);
}

export async function getStaffById(id: string, conn: DbOrTx = db): Promise<Staff | null> {
  const [row] = await conn.select().from(staff).where(eq(staff.id, id));
  return row ? toStaff(row) : null;
}

export async function getStaffByEmail(email: string, conn: DbOrTx = db): Promise<Staff | null> {
  const [row] = await conn.select().from(staff).where(eq(staff.email, normalizeEmail(email)));
  return row ? toStaff(row) : null;
}

/** 表示順に並べたスタッフの一覧 */
export async function listStaff(
  templeId: string,
  opts: { officiantsOnly?: boolean } = {},
  conn: DbOrTx = db,
): Promise<Staff[]> {
  const where = opts.officiantsOnly
    ? and(eq(staff.templeId, templeId), eq(staff.isOfficiant, true))
    : eq(staff.templeId, templeId);
  const rows = await conn.select().from(staff).where(where).orderBy(asc(staff.position), asc(staff.name));
  return rows.map(toStaff);
}
