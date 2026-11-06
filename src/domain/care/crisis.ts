// 危機兆候の検知（サーバー側のキーワードのルール。外部の AI には送らない）。spec.md §7
// 取りこぼしを減らすことを優先する（言いすぎて窓口を案内しても害は小さいが、見落としの害は大きい）。
import { isCrisisTarget, type CareEntryData, type CareManifest } from "@/care-sdk/types";

/** 照合のための正規化: NFKC、空白と記号を除く、カタカナをひらがなに */
export function normalizeForCrisis(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s　、。,.・!！?？「」『』（）()…ー〜~-]/g, "")
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

/** 正規化したあとの文字列で照合するキーワード（ひらがな / 漢字の両方の書き方を入れる） */
// ほかの言葉の一部に当たりやすいもの（「いきたくない」=「行きたくない」、「いしょ」⊂「かいしょう」など）は入れない
export const CRISIS_KEYWORDS: string[] = [
  "死にたい", "しにたい", "死のう", "死んでしまいたい", "死ねたら", "しねたら", "死ぬしかない", "しぬしかない", "死なせて",
  "消えたい", "きえたい", "消えてしまいたい", "きえてしまいたい", "いなくなりたい", "居なくなりたい",
  "生きていたくない", "いきていたくない", "生きたくない", "生きるのがつらい", "いきるのがつらい", "生きるのが辛い",
  "生きる意味がない", "生きてる意味がない", "生きている意味がない", "生きている意味がわからない",
  "自殺", "じさつ", "自死", "首をつ", "首を吊", "くびをつ", "飛び降り", "とびおり", "飛び込みたい", "とびこみたい",
  "リストカット", "自傷", "オーバードーズ", "薬をたくさん飲",
  "遺書", "楽になりたい", "らくになりたい", "終わりにしたい", "おわりにしたい", "全部終わらせたい",
];

const NORMALIZED_KEYWORDS = [...new Set(CRISIS_KEYWORDS.map(normalizeForCrisis))].filter((k) => k.length > 0);

/** 文に危機のキーワードが含まれるか */
export function containsCrisisKeyword(text: string): boolean {
  const n = normalizeForCrisis(text);
  if (!n) return false;
  return NORMALIZED_KEYWORDS.some((k) => n.includes(k));
}

/** 記録 1 件に危機兆候があるか（manifest で対象の項目だけを見る。text と textarea は必ず対象） */
export function detectCrisis(manifest: CareManifest, data: CareEntryData): boolean {
  for (const field of manifest.fields) {
    if (!isCrisisTarget(field)) continue;
    const v = data[field.id];
    if (v === undefined || v === "") continue;
    let text = String(v);
    if (field.type === "choice") text = `${text} ${field.options.find((o) => o.value === v)?.label ?? ""}`;
    if (containsCrisisKeyword(text)) return true;
  }
  return false;
}
