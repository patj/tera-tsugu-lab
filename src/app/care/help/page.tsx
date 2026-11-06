// 相談窓口（はじめていなくても見られる）
import { CRISIS_RESOURCES_AS_OF, CrisisResources } from "@/care-sdk";
import { PageTitle } from "../_components/ui";

export const metadata = { title: "相談窓口 | こころのよりどころ" };

export default function CareHelpPage() {
  return (
    <main>
      <PageTitle>相談窓口</PageTitle>
      <p className="mb-5">つらい気持ちを、ひとりで抱えこまないでください。名前を言わずに相談できる窓口があります。</p>
      <CrisisResources />
      <p className="mt-4 text-sm text-stone-500">厚生労働省「まもろうよ こころ」の情報をもとにしています（{CRISIS_RESOURCES_AS_OF} 時点）。</p>
    </main>
  );
}
