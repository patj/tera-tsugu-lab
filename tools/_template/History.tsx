// 相談者が自分の記録をふりかえる画面。記録は本体が復号して props で渡す（新しい順）
import { CareEntryList, type CareEntryView, type CareHistoryProps } from "@/care-sdk";
import type { Entry } from "./schema";

export default function History({ manifest, entries }: CareHistoryProps<Entry>) {
  return <CareEntryList manifest={manifest} entries={entries as CareEntryView[]} />;
}
