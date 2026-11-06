// 相談者が記録する画面。action は本体から受け取り、フォームに渡すだけにする（保存は本体が行う）
import { CareEntryForm, type CareEntryProps } from "@/care-sdk";

export default function Entry({ manifest, action }: CareEntryProps) {
  return (
    <CareEntryForm manifest={manifest} action={action}>
      <p>うまく書こうとしなくて大丈夫です。</p>
    </CareEntryForm>
  );
}
