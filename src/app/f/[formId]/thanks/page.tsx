import { findFormRow } from "@/domain/forms";

export const metadata = { title: "送信しました" };

export default async function ThanksPage({ params }: PageProps<"/f/[formId]/thanks">) {
  const { formId } = await params;
  const form = await findFormRow(formId);
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-5 py-12 text-lg">
      {form && <p className="text-stone-600">{form.title}</p>}
      <h1 className="mt-2 text-2xl font-bold">送信しました</h1>
      <p className="mt-6">お申し込みいただき、ありがとうございました。内容はお寺に届いています。</p>
      <p className="mt-4 text-stone-600">内容を変えたいときや取り消したいときは、お手数ですがお寺までお電話ください。</p>
    </main>
  );
}
