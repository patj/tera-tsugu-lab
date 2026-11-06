// ホーム: 立場（窓口 / ご家族）と権限に合わせて、できることを並べる
import Link from "next/link";
import { requirePortal } from "@/lib/portal-auth";
import { DoneBox } from "../_components/ui";

type Item = { href: string; title: string; body: string };

export default async function PortalHomePage({ searchParams }: PageProps<"/portal">) {
  const sp = await searchParams;
  const { ctx } = await requirePortal();
  const can = ctx.can;

  const household: Item[] = [];
  if (can.viewHousehold) {
    household.push(
      { href: "/portal/memorial", title: "家の法要の予定", body: "確定した法要と、これからの年忌の目安" },
      { href: "/portal/tree", title: "家系図", body: "ご先祖さまと、いまのご家族" },
    );
  }
  if (can.applyMemorial) {
    household.push({ href: "/portal/memorial/apply", title: "法要を申し込む", body: "年忌法要のご希望をお寺にお送りします" });
  }
  household.push({
    href: "/portal/memorial/requests",
    title: "法要の申し込みの状況",
    body: can.viewHousehold ? "受付済み・確定・お断りを確かめる" : "ご自分の申し込みの状況を確かめる",
  });

  const common: Item[] = [
    { href: "/portal/events", title: "行事に申し込む", body: "花まつり、ほうろく灸などの行事と、申し込みの確認" },
    { href: "/portal/facility", title: "施設の空き状況", body: "本堂や客殿の空き（◯×）" },
  ];
  if (can.manageFamily) {
    common.push({ href: "/portal/family", title: "ご家族の権限", body: "ご家族ごとに、家の情報を見る・代わりに法要を申し込むを許可する" });
  }

  return (
    <main>
      {sp.welcome && (
        <DoneBox>
          {sp.welcome === "again" ? "メールアドレスを登録し直しました。" : "ご登録ありがとうございます。"}
          次回からは、ログインの画面でメールアドレス（{ctx.account.email}）を入力してください。
        </DoneBox>
      )}
      <h1 className="text-2xl font-bold">{ctx.person.name} さん、ようこそ</h1>
      <p className="mt-2 text-stone-700">
        {ctx.isContact
          ? `${ctx.household.name}の窓口として、家の法要の予定や申し込み、ご家族の権限の設定ができます。`
          : `${ctx.household.name}のご家族としてご利用いただけます。`}
      </p>
      {!ctx.isContact && !can.viewHousehold && (
        <p className="mt-3 rounded-lg bg-white px-4 py-3 text-base text-stone-700">
          家系図と家の法要の予定は、窓口の{ctx.contactName ? ` ${ctx.contactName} さん` : "方"}が許可すると見られるようになります。
        </p>
      )}

      <h2 className="mt-8 mb-3 text-xl font-bold">家のこと・法要</h2>
      <Menu items={household} />
      <h2 className="mt-8 mb-3 text-xl font-bold">行事・施設{can.manageFamily ? "・ご家族" : ""}</h2>
      <Menu items={common} />
    </main>
  );
}

function Menu({ items }: { items: Item[] }) {
  return (
    <ul className="space-y-3">
      {items.map((i) => (
        <li key={i.href}>
          <Link href={i.href} className="block rounded-xl border border-stone-200 bg-white px-5 py-4 shadow-sm active:bg-stone-100">
            <span className="block text-xl font-bold">{i.title} →</span>
            <span className="mt-1 block text-base text-stone-600">{i.body}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
