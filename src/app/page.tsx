import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-6 py-16">
      <h1 className="text-3xl font-bold">てらつぐ</h1>
      <p className="mt-2 text-stone-600">お寺の業務を支援する Web アプリ</p>
      <ul className="mt-10 space-y-4 text-lg">
        <li>
          <Link className="underline" href="/admin">
            管理画面（スタッフ）
          </Link>
        </li>
      </ul>
    </main>
  );
}
