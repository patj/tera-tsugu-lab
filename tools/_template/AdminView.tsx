// 共有されている場合に、お寺の方が見る画面。記録は本体が復号して props で渡す（新しい順）
import { CareEntryList, type CareAdminViewProps, type CareEntryView } from "@/care-sdk";
import type { Entry } from "./schema";

export default function AdminView({ manifest, entries, nickname }: CareAdminViewProps<Entry>) {
  return (
    <div>
      <p className="mb-4 text-stone-700">
        {nickname} さんが共有している「{manifest.name}」の記録です。
      </p>
      <CareEntryList manifest={manifest} entries={entries as CareEntryView[]} showCrisis />
    </div>
  );
}
