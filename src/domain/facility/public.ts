// 公開ページ（/reserve。ログインなし）からの申請と、申請番号での状況の確認
import { db } from "@/db/client";
import {
  addDays,
  getDefaultTempleId,
  invalid,
  jst,
  parseDateString,
  parseHHMM,
  todayJst,
  type Actor,
} from "@/domain/core";
import {
  APPLY_PERIODS,
  PUBLIC_HORIZON_DAYS,
  PUBLIC_KINDS,
  PUBLIC_TIME_RANGE,
  kindLabel,
  statusLabel,
  type ApplyPeriod,
  type PublicKind,
  type ReservationStatus,
} from "./constants";
import { getFacility } from "./facilities";
import { createContact } from "./ledger-adapter";
import { createReservation, findReservationByCode } from "./reservations";

/** 公開ページの申請者（スタッフではない操作者） */
export function publicActor(templeId: string, name: string): Actor {
  return { templeId, channel: "web", label: `public:${name}` };
}

export type PublicApplicationInput = {
  templeId?: string;
  facilityId: string;
  kind: string;
  /** "YYYY-MM-DD" */
  date: string;
  /** 午前 / 午後 / 終日 / 時刻を指定（custom） */
  period: ApplyPeriod | "custom";
  /** period = custom のとき "HH:MM" */
  startTime?: string;
  endTime?: string;
  name: string;
  phone: string;
  email?: string;
  notes?: string;
};

/** 申請を受け付ける最初の日（翌日）と最後の日 */
export function publicApplyWindow(now: Date = new Date()): { first: string; last: string } {
  const today = todayJst(now);
  return { first: addDays(today, 1), last: addDays(today, PUBLIC_HORIZON_DAYS) };
}

/** 時刻を指定するときの選択肢（"08:00"、"08:30"、…） */
export function publicTimeOptions(): string[] {
  const out: string[] = [];
  const first = parseHHMM(PUBLIC_TIME_RANGE.first);
  const last = parseHHMM(PUBLIC_TIME_RANGE.last);
  for (let m = first; m <= last; m += PUBLIC_TIME_RANGE.stepMin) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  return out;
}

function resolveTimes(input: PublicApplicationInput): { start: string; end: string } {
  if (input.period === "custom") {
    const opts = publicTimeOptions();
    const start = input.startTime ?? "";
    const end = input.endTime ?? "";
    if (!opts.includes(start) || !opts.includes(end)) {
      throw invalid(`時刻は ${PUBLIC_TIME_RANGE.first}〜${PUBLIC_TIME_RANGE.last} の間で選んでください`);
    }
    if (start >= end) throw invalid("終わりの時刻は、始まりの時刻より後にしてください");
    return { start, end };
  }
  const p = APPLY_PERIODS[input.period];
  if (!p) throw invalid("時間帯を選んでください");
  return { start: p.start, end: p.end };
}

/**
 * 公開ページからの申請。一般コンタクトを作り、申請中（pending）の予約にする（仮押さえ）。
 * コンタクトと予約は 1 つのトランザクションで作る。申請番号を返す。
 */
export async function submitPublicApplication(
  input: PublicApplicationInput,
  now: Date = new Date(),
): Promise<{ requestCode: string; reservationId: string }> {
  const templeId = input.templeId ?? (await getDefaultTempleId());
  const name = input.name.trim();
  const phone = input.phone.trim();
  const email = input.email?.trim() ?? "";
  if (!name) throw invalid("お名前を入力してください");
  if (name.length > 100) throw invalid("お名前が長すぎます");
  if (!/^[0-9０-９+＋\-－ー()（）\s]{8,20}$/.test(phone)) throw invalid("電話番号を入力してください（数字とハイフン）");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw invalid("メールアドレスの形が正しくありません");
  if ((input.notes ?? "").length > 2000) throw invalid("内容は 2000 文字までにしてください");
  if (!(PUBLIC_KINDS as readonly string[]).includes(input.kind)) throw invalid("利用の種類を選んでください");

  try {
    parseDateString(input.date);
  } catch {
    throw invalid("利用する日を選んでください");
  }
  const window = publicApplyWindow(now);
  if (input.date < window.first) throw invalid("申請は、翌日以降の日について受け付けます。当日のご利用はお電話でお問い合わせください");
  if (input.date > window.last) throw invalid(`申請は ${window.last} までの日について受け付けます`);
  const times = resolveTimes(input);

  const actor = publicActor(templeId, name);
  await getFacility(templeId, input.facilityId);
  return db.transaction(async (tx) => {
    const contact = await createContact(actor, tx, { name, phone, email: email || null });
    const r = await createReservation(actor, tx, {
      facilityId: input.facilityId,
      kind: input.kind as PublicKind,
      status: "pending",
      start: jst(input.date, times.start),
      end: jst(input.date, times.end),
      contactId: contact.id,
      notes: input.notes,
    });
    return { requestCode: r.requestCode!, reservationId: r.id };
  });
}

export type PublicStatus = {
  requestCode: string;
  facilityName: string;
  kindLabel: string;
  start: Date;
  end: Date;
  status: ReservationStatus;
  statusLabel: string;
  /** お断りのときの理由 */
  rejectReason: string | null;
};

/** 申請番号での状況の確認。申請者に見せてよい項目（施設、種類、日時、状態、お断りの理由）だけを返す。見つからなければ null */
export async function getPublicStatus(code: string, templeId?: string): Promise<PublicStatus | null> {
  const tid = templeId ?? (await getDefaultTempleId());
  const r = await findReservationByCode(tid, code);
  if (!r || r.kind === "memorial") return null;
  return {
    requestCode: r.requestCode!,
    facilityName: r.facilityName,
    kindLabel: kindLabel(r.kind),
    start: r.start,
    end: r.end,
    status: r.status,
    statusLabel: statusLabel(r.status),
    rejectReason: r.status === "rejected" ? r.rejectReason : null,
  };
}
