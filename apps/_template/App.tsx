"use client";

// 利用者の画面。文書は useAppStorage で読み書きする（保存先は本体が用意し、暗号化して保存する）。
// ひな形: 1 行のメモを作る・直す・消すだけの最小の例。作るアプリに合わせて書き換える
import { useState } from "react";
import { useAppStorage, type AppProps } from "@/apps-sdk";
import type { Note } from "./types";

export default function App({ manifest }: AppProps) {
  const { docs, create, update, remove, pending, error } = useAppStorage<Note>();
  const [text, setText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  async function submit() {
    if (!text.trim()) return;
    const saved = editingId ? await update(editingId, { text }) : await create({ text });
    if (saved) {
      setText("");
      setEditingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <p>{manifest.description}</p>
      {error && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-red-800">
          {error}
        </p>
      )}
      <div className="space-y-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          className="block w-full rounded-lg border border-stone-300 bg-white px-4 py-3 text-lg"
        />
        <button
          type="button"
          onClick={submit}
          disabled={pending || !text.trim()}
          className="w-full rounded-xl bg-sky-700 px-5 py-4 text-xl font-bold text-white disabled:opacity-50"
        >
          {editingId ? "直す" : "保存する"}
        </button>
      </div>
      <ul className="space-y-3">
        {docs.map((d) => (
          <li key={d.id} className="rounded-xl border border-stone-200 bg-white px-5 py-4">
            <p className="text-base text-stone-500">{new Date(d.createdAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}</p>
            <p className="mt-1 whitespace-pre-wrap">{d.data.text}</p>
            <div className="mt-3 flex gap-4 text-base">
              <button
                type="button"
                className="underline"
                onClick={() => {
                  setEditingId(d.id);
                  setText(d.data.text);
                }}
              >
                直す
              </button>
              <button
                type="button"
                className="text-red-700 underline"
                onClick={() => {
                  if (confirm("消しますか？（元に戻せません）")) void remove(d.id);
                }}
              >
                消す
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
