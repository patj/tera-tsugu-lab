// 共有の状態の札（サーバーとクライアントの両方の部品から使う。ドメイン層を import しない）
/** 共有の状態の表示。1 件ずつの共有のアプリ（perDoc）では「選んだものだけ」と添える */
export function sharedLabel(perDoc: boolean): string {
  return perDoc ? "お寺と共有中（選んだものだけ）" : "お寺と共有中";
}

export function SharedBadge({ shared, perDoc = false }: { shared: boolean; perDoc?: boolean }) {
  return shared ? (
    <span className="whitespace-nowrap rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-amber-900">{sharedLabel(perDoc)}</span>
  ) : (
    <span className="whitespace-nowrap rounded-full bg-stone-200 px-3 py-1 text-sm text-stone-700">自分だけ</span>
  );
}
