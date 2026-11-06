// スタッフの画面（sharing が true か "perDoc" のときだけ使う）。共有されている文書を props で受け取り、表示するだけ（読むだけ。"perDoc" では、利用者が選んだ文書だけが届く）
import type { AppAdminProps } from "@/apps-sdk";
import type { Note } from "./types";

export default function Admin({ manifest, docs, nickname }: AppAdminProps<Note>) {
  return (
    <div>
      <p className="mb-4 text-stone-700">
        {nickname} さんが共有している「{manifest.name}」です（{docs.length} 件）。
      </p>
      <ul className="space-y-3">
        {docs.map((d) => (
          <li key={d.id} className="rounded border border-stone-200 bg-white px-4 py-3">
            <p className="text-sm text-stone-500">{new Date(d.createdAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}</p>
            <p className="mt-1 whitespace-pre-wrap">{d.data.text}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
