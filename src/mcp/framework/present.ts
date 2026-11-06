// MCP のツールの結果を LLM に返すときの決まり（spec.md §4「LLM に渡す情報」）。
//
// ツールの結果とプレビューは、Claude Desktop から LLM の事業者に送られる。檀家の情報はすべて個人情報として扱い、
// 名前（故人の俗名と法号、窓口・家族・施主の名前）は返さない。人は続柄と没年で指す。
// 家の名前は、その呼び出しの引数（検索語）に入っているときだけ返す（householdNameIfAsked）。
// 連絡先（住所の番地、電話、携帯、メール）、生年月日、自由記述（対応記録の本文、申し込みの連絡事項、施設の予約の件名と内容）も返さない。
// それらは管理画面の URL を添えて、住職がブラウザ（ログインが必要）で見る。

/** 管理画面の URL。URL だけでは見られない（スタッフのログインが必要）ので、LLM に渡してよい */
export function adminUrl(path: string): string {
  const base = (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

const PREFECTURE = /^(東京都|北海道|(?:京都|大阪)府|[^\s0-9０-９]{2,3}県)/;
const BLOCK = /[\s0-9０-９]|[一二三四五六七八九十]+丁目/;

/**
 * 住所から、市区町村と町名だけを返す（「東京都武蔵野市本町 2-3-5」→「武蔵野市本町」）。
 * 同じ名字の世帯を見分けるのに使う。番地は返さない
 */
export function areaOf(address: string | null | undefined): string | null {
  if (!address) return null;
  const rest = address.trim().replace(PREFECTURE, "");
  const i = rest.search(BLOCK);
  const area = (i === -1 ? rest : rest.slice(0, i)).trim();
  return area || null;
}

/** 自由記述の代わりに返す文 */
export const SEE_ADMIN = "あり（内容は管理画面で確認）";

/** 住所から、市区町村までを返す（「東京都武蔵野市本町 2-3-5」→「武蔵野市」）。自宅・墓前の法要の場所に使う */
export function cityOf(address: string | null | undefined): string | null {
  const area = areaOf(address);
  if (!area) return null;
  const m = area.match(/^(.+?郡)?.+?[市区町村]/);
  return m ? m[0] : area;
}

const compact = (v: string) => v.replace(/[\s　]/g, "");

/**
 * 家の名前を返してよいときだけ、家の名前を返す。世帯の名前から「家」を除いた部分（「山田家」なら「山田」）が、
 * その呼び出しの引数のどこかに入っていれば返す。入っていなければ null（住職が名前を出していない家の名前は LLM に渡さない）
 */
export function householdNameIfAsked(name: string, args: unknown): string | null {
  const base = compact(name).replace(/家$/, "");
  if (!base) return null;
  return compact(JSON.stringify(args ?? {})).includes(base) ? name : null;
}

/** 家の呼び方: 名前を返してよければ「本町の山田家」、だめなら「本町の世帯」 */
export function householdLabel(h: { name: string; address: string | null }, args: unknown): string {
  const area = areaOf(h.address);
  const name = householdNameIfAsked(h.name, args);
  return `${area ? `${area}の` : ""}${name ?? "世帯"}`;
}

/** 続柄の表し方。台帳の「本人」は世帯主のこと */
export function relationLabel(relation: string | null | undefined): string {
  if (!relation) return "続柄なし";
  return relation === "本人" ? "世帯主（本人）" : relation;
}

/** 故人や家族を名前を出さずに指す（「父（2021 年没）」「長男」） */
export function personLabel(p: { relation: string | null; deathDate?: string | null }): string {
  return `${relationLabel(p.relation)}${p.deathDate ? `（${p.deathDate.slice(0, 4)} 年没）` : ""}`;
}

/**
 * 施設の予約の申請者の名前を一部だけ伏せる（名前の最初の 1 文字だけを残す）。「佐藤 美咲」→「佐○ ○○ 様」。
 * 括弧の中（団体の名前など）は落とす。1 文字の姓は、姓がわかる（「林 太郎」→「林 ○○ 様」）
 */
export function maskName(name: string | null | undefined): string | null {
  const base = (name ?? "").replace(/[（(].*$/, "").trim();
  if (!base) return null;
  let first = true;
  const masked = [...base]
    .map((ch) => {
      if (/[\s　]/.test(ch)) return " ";
      if (first) {
        first = false;
        return ch;
      }
      return "○";
    })
    .join("")
    .replace(/ +/g, " ");
  return `${masked} 様`;
}
