// ポータルの認証: 招待コードの発行と登録、マジックリンク、ログインしているアカウントの読み込み（spec.md §2.1）
// スタッフの認証とは別。ログインの状態（cookie）は src/lib/portal-auth.ts が持つ
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { households, persons, portalAccounts, portalInvites, portalLoginTokens } from "@/db/schema";
import {
  conflict,
  DomainError,
  forbidden,
  invalid,
  isStaff,
  notFound,
  portalActor,
  writeAuditLog,
  type Actor,
} from "@/domain/core";
import {
  INVITE_EXPIRES_DAYS,
  LOGIN_LINK_MINUTES,
  hashLoginToken,
  inviteUrl,
  isInviteCodeShape,
  newInviteCode,
  newLoginToken,
  normalizeInviteCode,
  normalizePortalEmail,
} from "./codes";
import { inTx, isUuid } from "./common";

const expired = (message: string) => new DomainError("expired", message);
const DAY_MS = 24 * 60 * 60 * 1000;

export type PortalAccount = {
  id: string;
  templeId: string;
  personId: string;
  householdId: string;
  email: string;
  /** "田中 健一" */
  displayName: string;
  canViewHousehold: boolean;
  canApplyMemorial: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
};

/** ポータルの操作者（ドメイン層の関数に渡す） */
export function toPortalActor(account: Pick<PortalAccount, "id" | "templeId" | "personId" | "displayName">): Actor {
  return portalActor(account);
}

type AccountRow = {
  id: string;
  templeId: string;
  personId: string;
  email: string;
  canViewHousehold: boolean;
  canApplyMemorial: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  householdId: string;
  familyName: string;
  givenName: string;
  isDeceased: boolean;
  householdStatus: string;
};

function accountSelect() {
  return {
    id: portalAccounts.id,
    templeId: portalAccounts.templeId,
    personId: portalAccounts.personId,
    email: portalAccounts.email,
    canViewHousehold: portalAccounts.canViewHousehold,
    canApplyMemorial: portalAccounts.canApplyMemorial,
    lastLoginAt: portalAccounts.lastLoginAt,
    createdAt: portalAccounts.createdAt,
    householdId: persons.householdId,
    familyName: persons.familyName,
    givenName: persons.givenName,
    isDeceased: persons.isDeceased,
    householdStatus: households.status,
  };
}

function toAccount(r: AccountRow): PortalAccount {
  return {
    id: r.id,
    templeId: r.templeId,
    personId: r.personId,
    householdId: r.householdId,
    email: r.email,
    displayName: `${r.familyName} ${r.givenName}`,
    canViewHousehold: r.canViewHousehold,
    canApplyMemorial: r.canApplyMemorial,
    lastLoginAt: r.lastLoginAt,
    createdAt: r.createdAt,
  };
}

/** 使えるアカウントか（本人が生きていて、世帯が檀家のまま） */
function usable(r: AccountRow): boolean {
  return !r.isDeceased && r.householdStatus === "active";
}

async function findAccountRow(where: ReturnType<typeof eq>, conn: DbOrTx): Promise<AccountRow | undefined> {
  const [r] = await conn
    .select(accountSelect())
    .from(portalAccounts)
    .innerJoin(persons, eq(persons.id, portalAccounts.personId))
    .innerJoin(households, eq(households.id, persons.householdId))
    .where(where);
  return r;
}

/**
 * ログインしているアカウント（cookie の中の ID から引く）。ない、本人が故人になった、世帯が離檀・転出したときは null
 */
export async function getPortalAccount(accountId: string, conn: DbOrTx = db): Promise<PortalAccount | null> {
  if (!isUuid(accountId)) return null;
  const r = await findAccountRow(eq(portalAccounts.id, accountId), conn);
  return r && usable(r) ? toAccount(r) : null;
}

// ---- 招待コード ----

/** 招待できる人か（生きていて、世帯が檀家）。だめなら DomainError */
async function requireInvitablePerson(templeId: string, personId: string, conn: DbOrTx) {
  if (!isUuid(personId)) throw notFound("個人が見つかりません");
  const [p] = await conn
    .select({
      id: persons.id,
      familyName: persons.familyName,
      givenName: persons.givenName,
      isDeceased: persons.isDeceased,
      householdId: persons.householdId,
      householdName: households.name,
      householdStatus: households.status,
    })
    .from(persons)
    .innerJoin(households, eq(households.id, persons.householdId))
    .where(and(eq(persons.id, personId), eq(persons.templeId, templeId)));
  if (!p) throw notFound("個人が見つかりません");
  if (p.isDeceased) throw invalid("故人には招待コードを発行できません");
  if (p.householdStatus !== "active") throw invalid("離檀・転出した世帯の方には招待コードを発行できません");
  return p;
}

export type IssuedInvite = { id: string; code: string; expiresAt: Date; url: string };

/**
 * 招待コードを発行する（スタッフだけ）。個人ごと。アカウントがある人にも発行できる
 * （使うと、そのアカウントのメールアドレスを置き換える。メールアドレスを変えた・間違えたときの回復手段）
 */
export async function issueInvite(
  actor: Actor,
  input: { personId: string; expiresInDays?: number },
  opts: { now?: Date } = {},
  conn: DbOrTx = db,
): Promise<IssuedInvite> {
  if (!isStaff(actor)) throw forbidden("招待コードはスタッフだけが発行できます");
  const days = input.expiresInDays ?? INVITE_EXPIRES_DAYS;
  if (!Number.isInteger(days) || days < 1 || days > 365) throw invalid("有効期限は 1〜365 日で指定してください");
  const p = await requireInvitablePerson(actor.templeId, input.personId, conn);
  const now = opts.now ?? new Date();
  const expiresAt = new Date(now.getTime() + days * DAY_MS);

  return inTx(conn, async (tx) => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = newInviteCode();
      const [dup] = await tx.select({ id: portalInvites.id }).from(portalInvites).where(eq(portalInvites.code, code));
      if (dup) continue;
      const [row] = await tx
        .insert(portalInvites)
        .values({ templeId: actor.templeId, personId: p.id, code, expiresAt, createdAt: now })
        .returning({ id: portalInvites.id });
      await writeAuditLog(
        actor,
        { action: "portal.invite.issue", target: `person:${p.id}`, summary: `${p.householdName} ${p.familyName} ${p.givenName} さんの招待コード`, result: "ok" },
        tx,
      );
      return { id: row.id, code, expiresAt, url: inviteUrl(code) };
    }
    throw conflict("招待コードを作れませんでした。もう一度お試しください");
  });
}

export type InviteLookup =
  | { status: "ok"; personName: string; householdName: string; hasAccount: boolean; expiresAt: Date }
  | { status: "used" | "expired" | "not_found" | "unavailable" };

/** 登録の画面で、招待コードを確かめる（本人の名前を表示する） */
export async function lookupInvite(codeInput: string, opts: { now?: Date } = {}, conn: DbOrTx = db): Promise<InviteLookup> {
  const code = normalizeInviteCode(codeInput);
  if (!isInviteCodeShape(code)) return { status: "not_found" };
  const now = opts.now ?? new Date();
  const [r] = await conn
    .select({
      usedAt: portalInvites.usedAt,
      expiresAt: portalInvites.expiresAt,
      personId: portalInvites.personId,
      familyName: persons.familyName,
      givenName: persons.givenName,
      isDeceased: persons.isDeceased,
      householdName: households.name,
      householdStatus: households.status,
    })
    .from(portalInvites)
    .innerJoin(persons, eq(persons.id, portalInvites.personId))
    .innerJoin(households, eq(households.id, persons.householdId))
    .where(eq(portalInvites.code, code));
  if (!r) return { status: "not_found" };
  if (r.usedAt) return { status: "used" };
  if (r.expiresAt <= now) return { status: "expired" };
  if (r.isDeceased || r.householdStatus !== "active") return { status: "unavailable" };
  const [acc] = await conn.select({ id: portalAccounts.id }).from(portalAccounts).where(eq(portalAccounts.personId, r.personId));
  return {
    status: "ok",
    personName: `${r.familyName} ${r.givenName}`,
    householdName: r.householdName,
    hasAccount: Boolean(acc),
    expiresAt: r.expiresAt,
  };
}

export type RegisterResult = { account: PortalAccount; replaced: boolean };

/**
 * 招待コードとメールアドレスで登録する。コードは使用済みにする（1 回だけ）。
 * 本人にアカウントがあれば、メールアドレスを置き換える（家族の権限はそのまま）。
 * 登録したらそのままログインしてよい（呼ぶ側で startPortalSession する）
 */
export async function registerWithInvite(
  input: { code: string; email: string },
  opts: { now?: Date } = {},
  conn: DbOrTx = db,
): Promise<RegisterResult> {
  const code = normalizeInviteCode(input.code ?? "");
  if (!code) throw invalid("招待コードを入力してください");
  const email = normalizePortalEmail(input.email ?? "");
  if (!email) throw invalid("メールアドレスを正しく入力してください");
  const now = opts.now ?? new Date();

  return inTx(conn, async (tx) => {
    const [inv] = isInviteCodeShape(code)
      ? await tx.select().from(portalInvites).where(eq(portalInvites.code, code))
      : [];
    if (!inv) throw notFound("招待コードが見つかりません。お手元の案内のコードをお確かめください");
    if (inv.usedAt) throw conflict("この招待コードはすでに使われています。ログインの画面からメールアドレスでログインしてください");
    if (inv.expiresAt <= now) throw expired("この招待コードは有効期限が切れています。お寺にお問い合わせください");
    const p = await requireInvitablePerson(inv.templeId, inv.personId, tx).catch(() => {
      throw forbidden("この招待コードは使えません。お寺にお問い合わせください");
    });

    const [sameEmail] = await tx
      .select({ id: portalAccounts.id, personId: portalAccounts.personId })
      .from(portalAccounts)
      .where(eq(portalAccounts.email, email));
    if (sameEmail && sameEmail.personId !== p.id) {
      throw conflict("このメールアドレスは、ほかの方が登録しています。別のメールアドレスを入力してください");
    }

    // 使用済みにする（同時に 2 回使われても、1 回だけ通す）
    const used = await tx
      .update(portalInvites)
      .set({ usedAt: now })
      .where(and(eq(portalInvites.id, inv.id), isNull(portalInvites.usedAt), gt(portalInvites.expiresAt, now)))
      .returning({ id: portalInvites.id });
    if (used.length === 0) throw conflict("この招待コードはすでに使われています");

    const [existing] = await tx.select().from(portalAccounts).where(eq(portalAccounts.personId, p.id));
    let accountId: string;
    if (existing) {
      await tx.update(portalAccounts).set({ email }).where(eq(portalAccounts.id, existing.id));
      accountId = existing.id;
    } else {
      const [row] = await tx
        .insert(portalAccounts)
        .values({ templeId: inv.templeId, personId: p.id, email, createdAt: now })
        .returning({ id: portalAccounts.id });
      accountId = row.id;
    }
    const r = await findAccountRow(eq(portalAccounts.id, accountId), tx);
    const account = toAccount(r!);
    await writeAuditLog(
      toPortalActor(account),
      {
        action: existing ? "portal.account.reregister" : "portal.account.register",
        target: `portal_account:${account.id}`,
        summary: `${p.householdName} ${account.displayName} さんが招待コードで${existing ? "メールアドレスを登録し直しました" : "登録しました"}`,
        result: "ok",
      },
      tx,
    );
    return { account, replaced: Boolean(existing) };
  });
}

// ---- マジックリンク ----

export type LoginLink = { token: string; expiresAt: Date; accountId: string };

/**
 * メールアドレスから、ログイン用のリンクのトークンを作る（15 分有効、1 回だけ）。DB にはハッシュだけを保存する。
 * アカウントがない（または使えない）ときは null。画面では、どちらでも同じ案内を出す（登録の有無を知られないように）
 */
export async function requestLoginLink(
  emailInput: string,
  opts: { now?: Date; templeId?: string } = {},
  conn: DbOrTx = db,
): Promise<LoginLink | null> {
  const email = normalizePortalEmail(emailInput ?? "");
  if (!email) throw invalid("メールアドレスを正しく入力してください");
  const now = opts.now ?? new Date();
  const r = await findAccountRow(eq(portalAccounts.email, email), conn);
  if (!r || !usable(r) || (opts.templeId && r.templeId !== opts.templeId)) return null;
  const token = newLoginToken();
  const expiresAt = new Date(now.getTime() + LOGIN_LINK_MINUTES * 60 * 1000);
  await conn.insert(portalLoginTokens).values({
    templeId: r.templeId,
    portalAccountId: r.id,
    tokenHash: hashLoginToken(token),
    expiresAt,
    createdAt: now,
  });
  return { token, expiresAt, accountId: r.id };
}

/**
 * ログイン用のリンクを使う。期限切れ、使用済み、知らないトークンは拒否する。
 * 通ったら使用済みにして、最後のログインの日時を更新する
 */
export async function consumeLoginLink(
  token: string,
  opts: { now?: Date } = {},
  conn: DbOrTx = db,
): Promise<PortalAccount> {
  if (!token || token.length > 200) throw invalid("このリンクは使えません。もう一度ログインの画面からやり直してください");
  const now = opts.now ?? new Date();
  const hash = hashLoginToken(token);
  return inTx(conn, async (tx) => {
    const consumed = await tx
      .update(portalLoginTokens)
      .set({ usedAt: now })
      .where(
        and(
          eq(portalLoginTokens.tokenHash, hash),
          isNull(portalLoginTokens.usedAt),
          gt(portalLoginTokens.expiresAt, now),
        ),
      )
      .returning({ accountId: portalLoginTokens.portalAccountId });
    if (consumed.length === 0) {
      const [t] = await tx.select().from(portalLoginTokens).where(eq(portalLoginTokens.tokenHash, hash));
      if (!t) throw invalid("このリンクは使えません。もう一度ログインの画面からやり直してください");
      if (t.usedAt) throw conflict("このリンクはすでに使われています。もう一度ログインの画面からやり直してください");
      throw expired("このリンクは有効期限（15 分）が切れています。もう一度ログインの画面からやり直してください");
    }
    const r = await findAccountRow(eq(portalAccounts.id, consumed[0].accountId), tx);
    if (!r || !usable(r)) throw forbidden("このアカウントは使えません。お寺にお問い合わせください");
    await tx.update(portalAccounts).set({ lastLoginAt: now }).where(eq(portalAccounts.id, r.id));
    const account = { ...toAccount(r), lastLoginAt: now };
    await writeAuditLog(toPortalActor(account), { action: "portal.login", target: `portal_account:${account.id}`, result: "ok" }, tx);
    return account;
  });
}
