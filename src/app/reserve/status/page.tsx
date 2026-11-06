import Link from "next/link";
import { formatJst, jstTimeString } from "@/domain/core";
import { getPublicStatus } from "@/domain/facility";

const STATUS_STYLES: Record<string, string> = {
  pending: "border-amber-400 bg-amber-50 text-amber-900",
  confirmed: "border-sky-400 bg-sky-50 text-sky-900",
  rejected: "border-stone-400 bg-stone-100 text-stone-800",
  cancelled: "border-stone-400 bg-stone-100 text-stone-800",
};

const STATUS_NOTES: Record<string, string> = {
  pending: "お寺で確認しています。承認されると「確定」になります（仮押さえ中です）。",
  confirmed: "ご利用が確定しました。当日お待ちしております。",
  rejected: "申し訳ありませんが、今回はお受けできませんでした。",
  cancelled: "この予約は取り消されました。",
};

export default async function ReserveStatusPage({ searchParams }: PageProps<"/reserve/status">) {
  const sp = await searchParams;
  const code = typeof sp.code === "string" ? sp.code : "";
  const isNew = sp.new === "1";
  const s = code ? await getPublicStatus(code) : null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">申請の状況</h1>

      {isNew && s && (
        <div className="rounded border-2 border-emerald-600 bg-emerald-50 px-4 py-4">
          <p className="font-bold">申請を受け付けました。</p>
          <p className="mt-2">申請番号</p>
          <p className="font-mono text-4xl font-bold tracking-wider">{s.requestCode}</p>
          <p className="mt-2 text-base">
            この番号を控えてください。この画面で状況を確かめられます。お電話でお問い合わせのときも、この番号をお伝えください。
          </p>
        </div>
      )}

      {code && !s && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-3 text-red-800">
          申請番号「{code}」の申請が見つかりません。番号を確かめてください。
        </p>
      )}

      {s && (
        <section className={`rounded border-2 px-4 py-4 ${STATUS_STYLES[s.status] ?? ""}`}>
          <p className="text-base">状態</p>
          <p className="text-3xl font-bold">{s.statusLabel}</p>
          <p className="mt-2">{STATUS_NOTES[s.status]}</p>
          {s.status === "rejected" && s.rejectReason && (
            <div className="mt-3 rounded bg-white px-3 py-2">
              <p className="text-base text-stone-600">お寺からの理由</p>
              <p className="whitespace-pre-wrap">{s.rejectReason}</p>
            </div>
          )}
          <dl className="mt-4 space-y-1 text-base">
            <div>
              <dt className="inline text-stone-600">申請番号: </dt>
              <dd className="inline font-mono">{s.requestCode}</dd>
            </div>
            <div>
              <dt className="inline text-stone-600">施設: </dt>
              <dd className="inline">{s.facilityName}</dd>
            </div>
            <div>
              <dt className="inline text-stone-600">ご利用の種類: </dt>
              <dd className="inline">{s.kindLabel}</dd>
            </div>
            <div>
              <dt className="inline text-stone-600">日時: </dt>
              <dd className="inline">
                {formatJst(s.start)}〜{jstTimeString(s.end)}
              </dd>
            </div>
          </dl>
        </section>
      )}

      <form action="/reserve/status" method="get" className="space-y-3 rounded border border-stone-200 bg-white px-4 py-4">
        <label className="block">
          <span className="block font-bold">申請番号を入力してください</span>
          <input
            name="code"
            required
            defaultValue={isNew ? "" : code}
            placeholder="例: ABCD-2345"
            autoCapitalize="characters"
            autoComplete="off"
            className="mt-1 w-full rounded border border-stone-300 px-3 py-3 font-mono text-xl uppercase"
          />
        </label>
        <button type="submit" className="w-full rounded bg-stone-800 px-4 py-3 text-lg font-bold text-white">
          状況を確かめる
        </button>
      </form>

      <p>
        <Link href="/reserve" className="underline">
          空き状況を見る
        </Link>
      </p>
    </div>
  );
}
