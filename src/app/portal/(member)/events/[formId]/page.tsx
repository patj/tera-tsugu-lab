// 行事への申し込み（05 のフォームを source = portal で回答する。台帳でわかる設問は出さず、person_list は家族を選ぶだけ）
import { isDomainError } from "@/domain/core";
import { getPortalEventForm } from "@/domain/portal";
import { requirePortal } from "@/lib/portal-auth";
import { ErrorBox, PageTitle } from "../../../_components/ui";
import { EventForm } from "./event-form";

export const metadata = { title: "行事の申し込み | 檀家ポータル" };

export default async function EventFormPage({ params, searchParams }: PageProps<"/portal/events/[formId]">) {
  const { formId } = await params;
  const sp = await searchParams;
  const { actor, ctx } = await requirePortal();
  let form;
  try {
    form = await getPortalEventForm(actor, formId);
  } catch (e) {
    if (!isDomainError(e)) throw e;
    return (
      <main>
        <PageTitle back="/portal/events">行事の申し込み</PageTitle>
        <p>{e.message}</p>
      </main>
    );
  }

  return (
    <main>
      <PageTitle back="/portal/events">{form.title}</PageTitle>
      {form.description && <p className="mb-4 whitespace-pre-wrap text-stone-700">{form.description}</p>}
      {form.availability !== "ok" ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-4">{form.notice}</p>
      ) : (
        <>
          <p className="mb-5 rounded-lg bg-white px-4 py-3 text-base">
            {ctx.person.name} さんのお申し込みとして受け付けます。ご住所やお名前など、お寺でわかっている項目は入力いただかなくて大丈夫です。
          </p>
          <ErrorBox message={sp.error} />
          <EventForm form={form} />
        </>
      )}
    </main>
  );
}
