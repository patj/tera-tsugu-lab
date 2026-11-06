// MCP のツールの結果を LLM に返すときの決まり（spec.md §4「LLM に渡す情報」）。
//
// ツールの結果とプレビューは、Claude Desktop から LLM の事業者に送られる。会話を進めるのに必要な最小限だけを返し、
// 連絡先（住所の番地、電話、携帯、メール）、生年月日、自由記述（対応記録の本文、申し込みの連絡事項、施設の予約の内容）は返さない。
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
