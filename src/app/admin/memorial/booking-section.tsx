// 候補の日時を出して確定する部分（申し込みの詳細と、電話で受けた法要の登録で共通に使う）
import { isDomainError, type Actor } from "@/domain/core";
import { defaultLocationAddress, findMemorialSlots, type FindMemorialSlotsResult, type MemorialLocation } from "@/domain/memorial";
import { BookForm } from "./forms";
import { input, SlotPicker } from "./ui";

type Props = {
  actor: Actor;
  /** 場所の住所の初期値（自宅は世帯の住所、墓前はお墓の場所）を取るため */
  householdId: string;
  periods: { from: string; to: string }[];
  location: MemorialLocation;
  targetPersonIds: string[];
  travelBefore: number | null;
  travelAfter: number | null;
  /** 確定のフォームに入れる隠しフィールド（target は複数） */
  hidden: { name: string; value: string }[];
  /** 移動時間を入れる GET のフォームで引き継ぐ検索の条件 */
  keep: Record<string, string>;
};

export async function BookingSection(props: Props) {
  const { location, travelBefore, travelAfter } = props;
  const needsTravel = location !== "temple";

  if (needsTravel && (travelBefore === null || travelAfter === null)) {
    return <TravelForm keep={props.keep} travelBefore={travelBefore} travelAfter={travelAfter} />;
  }

  const address = needsTravel ? await defaultLocationAddress(props.actor, props.householdId, location) : null;
  let result: FindMemorialSlotsResult | null = null;
  let error: string | null = null;
  try {
    result = await findMemorialSlots(props.actor, {
      periods: props.periods,
      location,
      targetPersonIds: props.targetPersonIds,
      travelBeforeMin: travelBefore,
      travelAfterMin: travelAfter,
    });
  } catch (e) {
    if (!isDomainError(e) && !(e instanceof Error && /^(日付|日時)/.test(e.message))) throw e;
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="space-y-3">
      {needsTravel && <TravelForm keep={props.keep} travelBefore={travelBefore} travelAfter={travelAfter} compact />}
      {error && <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-red-800">{error}</p>}
      {result && (
        <BookForm>
          {props.hidden.map((h, i) => (
            <input key={`${h.name}-${i}`} type="hidden" name={h.name} value={h.value} />
          ))}
          <input type="hidden" name="location" value={location} />
          {needsTravel && (
            <>
              <input type="hidden" name="travelBefore" value={String(travelBefore)} />
              <input type="hidden" name="travelAfter" value={String(travelAfter)} />
            </>
          )}
          <SlotPicker result={result} />
          {needsTravel && (
            <label className="block max-w-2xl">
              <span className="block font-medium">場所の住所</span>
              <input name="locationAddress" defaultValue={address ?? ""} className={input} placeholder="例: 東京都府中市多磨町 4-628" />
              <span className="mt-1 block text-sm text-stone-500">
                {location === "home" ? "初期値は世帯の住所です。" : "初期値は世帯のお墓の場所です。"}ほかの場所なら書き換えてください
              </span>
            </label>
          )}
          <label className="block max-w-2xl">
            <span className="block font-medium">メモ（任意。担当者の予定にも載ります）</span>
            <input name="notes" className={input} placeholder="例: 塔婆 3 本" />
          </label>
        </BookForm>
      )}
    </div>
  );
}

function TravelForm({
  keep,
  travelBefore,
  travelAfter,
  compact = false,
}: {
  keep: Record<string, string>;
  travelBefore: number | null;
  travelAfter: number | null;
  compact?: boolean;
}) {
  return (
    <form className={`flex flex-wrap items-end gap-3 rounded border p-3 ${compact ? "border-stone-200 bg-white" : "border-amber-300 bg-amber-50"}`}>
      {Object.entries(keep).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {!compact && <p className="w-full">自宅・墓前の法要は、行きと帰りの移動時間（分）を入れてから候補を出します（場所と直前の予定で変わるため、毎回入れます）。</p>}
      <label className="block">
        <span className="text-sm text-stone-600">行きの移動時間（分）</span>
        <input type="number" name="travelBefore" min={0} max={300} required defaultValue={travelBefore ?? ""} className={input} />
      </label>
      <label className="block">
        <span className="text-sm text-stone-600">帰りの移動時間（分）</span>
        <input type="number" name="travelAfter" min={0} max={300} required defaultValue={travelAfter ?? ""} className={input} />
      </label>
      <button type="submit" className="rounded border border-stone-400 bg-white px-4 py-2 hover:bg-stone-50">
        {compact ? "移動時間を変えて出し直す" : "候補を出す"}
      </button>
    </form>
  );
}

/** 検索の条件の数字（空なら null） */
export function intParam(v: string | string[] | undefined): number | null {
  if (typeof v !== "string" || v.trim() === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : null;
}
