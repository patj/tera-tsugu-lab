// フォームのビルダー（題名と公開範囲、設問の追加、並べ替え、種類、選択肢、必須、profile_field、person_list の項目と人数）
import { notFound } from "next/navigation";
import { isDomainError } from "@/domain/core";
import {
  FORM_MODES,
  ITEM_FIELD_TYPES,
  ITEM_FIELD_TYPE_LABELS,
  MODE_LABELS,
  PERSON_PROFILE_FIELDS,
  PROFILE_FIELDS,
  PROFILE_FIELD_LABELS,
  QUESTION_TYPES,
  QUESTION_TYPE_LABELS,
  countResponses,
  getForm,
  type FormQuestion,
  type PersonListItemField,
} from "@/domain/forms";
import { getStaffActor } from "@/lib/staff-auth";
import {
  addQuestionAction,
  deleteQuestionAction,
  moveQuestionAction,
  updateMetaAction,
  updateQuestionAction,
} from "../../actions";
import { ErrorBanner, FormTabs, StatusBadge } from "../../ui";

const input = "mt-1 w-full rounded border border-stone-300 bg-white px-3 py-2";
const small = "rounded border border-stone-300 bg-white px-2 py-1";
/** person_list の項目の入力欄は、今の項目に加えて空の行を 2 つ出す */
const BLANK_ITEM_ROWS = 2;

function ItemRow({ i, f }: { i: number; f?: PersonListItemField }) {
  return (
    <tr className="border-b border-stone-200 align-top">
      <td className="px-2 py-2">
        {f && <input type="hidden" name={`item_${i}_key`} value={f.key} />}
        <input name={`item_${i}_label`} defaultValue={f?.label} className={`${small} w-36`} placeholder="項目の名前" />
      </td>
      <td className="px-2 py-2">
        <select name={`item_${i}_type`} defaultValue={f?.type ?? "short"} className={small}>
          {ITEM_FIELD_TYPES.map((t) => (
            <option key={t} value={t}>
              {ITEM_FIELD_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </td>
      <td className="px-2 py-2 text-center">
        <input type="checkbox" name={`item_${i}_required`} defaultChecked={f?.required} className="size-5" />
      </td>
      <td className="px-2 py-2">
        <select name={`item_${i}_profile`} defaultValue={f?.profileField ?? ""} className={small}>
          <option value="">（台帳にない）</option>
          {PERSON_PROFILE_FIELDS.map((p) => (
            <option key={p} value={p}>
              {PROFILE_FIELD_LABELS[p]}
            </option>
          ))}
        </select>
      </td>
      <td className="px-2 py-2">
        <textarea
          name={`item_${i}_options`}
          defaultValue={f?.options?.join("\n")}
          rows={2}
          className={`${small} w-32`}
          placeholder="単一選択のとき 1 行に 1 つ"
        />
      </td>
    </tr>
  );
}

function QuestionCard({ formId, q, index, total, locked }: { formId: string; q: FormQuestion; index: number; total: number; locked: boolean }) {
  const items = q.itemFields ?? [];
  const rowCount = items.length + BLANK_ITEM_ROWS;
  return (
    <li id={`q-${q.id}`} className="rounded border border-stone-300 bg-white px-4 py-4">
      <form action={updateQuestionAction.bind(null, formId, q.id)}>
        <fieldset disabled={locked} className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <span className="pb-2 font-bold text-stone-500">{index + 1}.</span>
            <label className="min-w-64 flex-1">
              <span className="block text-base">設問の文言</span>
              <input name="label" defaultValue={q.label} required className={input} />
            </label>
            <label>
              <span className="block text-base">種類</span>
              <select name="type" defaultValue={q.type} className={input}>
                {QUESTION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {QUESTION_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 pb-2">
              <input type="checkbox" name="required" defaultChecked={q.required} className="size-5" />
              必須
            </label>
          </div>
          <label className="block">
            <span className="block text-base">説明（任意）</span>
            <input name="description" defaultValue={q.description ?? ""} className={input} />
          </label>

          {q.type === "single" || q.type === "multi" ? (
            <label className="block">
              <span className="block text-base">選択肢（1 行に 1 つ）</span>
              <textarea name="options" defaultValue={q.options?.join("\n")} rows={Math.max(3, (q.options?.length ?? 0) + 1)} className={input} />
            </label>
          ) : null}

          {q.type === "person_list" ? (
            <div>
              <label className="block max-w-xs">
                <span className="block text-base">最大人数</span>
                <input type="number" name="max_persons" min={1} max={20} defaultValue={q.maxPersons ?? 5} className={input} />
              </label>
              <p className="mt-3 text-base">1 人分の項目（「台帳から」を選んだ項目は、檀家が家族を選ぶと自動で入ります。名前を空にすると消えます）</p>
              <input type="hidden" name="item_count" value={rowCount} />
              <div className="overflow-x-auto">
                <table className="mt-1 border-collapse text-base">
                  <thead>
                    <tr className="border-b border-stone-300 text-left text-stone-600">
                      <th className="px-2 py-1">名前</th>
                      <th className="px-2 py-1">種類</th>
                      <th className="px-2 py-1">必須</th>
                      <th className="px-2 py-1">台帳から</th>
                      <th className="px-2 py-1">選択肢</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: rowCount }, (_, i) => (
                      <ItemRow key={i} i={i} f={items[i]} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <label className="block max-w-md">
              <span className="block text-base">台帳で補う項目（個別リンクとポータルでは聞かない）</span>
              <select name="profile_field" defaultValue={q.profileField ?? ""} className={input}>
                <option value="">（なし。全員に聞く）</option>
                {PROFILE_FIELDS.map((p) => (
                  <option key={p} value={p}>
                    {PROFILE_FIELD_LABELS[p]}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            <button type="submit" className="rounded bg-stone-800 px-4 py-2 font-medium text-white">
              保存
            </button>
            <button
              type="submit"
              formAction={moveQuestionAction.bind(null, formId, q.id, "up")}
              disabled={index === 0}
              className="rounded border border-stone-400 px-3 py-2 disabled:opacity-40"
            >
              ↑ 上へ
            </button>
            <button
              type="submit"
              formAction={moveQuestionAction.bind(null, formId, q.id, "down")}
              disabled={index === total - 1}
              className="rounded border border-stone-400 px-3 py-2 disabled:opacity-40"
            >
              ↓ 下へ
            </button>
            <button
              type="submit"
              formAction={deleteQuestionAction.bind(null, formId, q.id)}
              className="ml-auto rounded border border-red-300 px-3 py-2 text-red-800"
            >
              消す
            </button>
          </div>
        </fieldset>
      </form>
    </li>
  );
}

export default async function FormEditPage({ params, searchParams }: PageProps<"/admin/forms/[formId]/edit">) {
  const { formId } = await params;
  const { error } = await searchParams;
  const actor = await getStaffActor();
  let form;
  try {
    form = await getForm(actor, formId);
  } catch (e) {
    if (isDomainError(e) && e.code === "not_found") notFound();
    throw e;
  }
  const locked = (await countResponses(form.id)) > 0;

  return (
    <div className="text-lg">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{form.title}</h1>
        <StatusBadge status={form.status} />
      </div>
      <FormTabs form={form} current="edit" />

      <div className="mt-6">
        <ErrorBanner error={error} />
      </div>

      <section className="max-w-3xl rounded border border-stone-200 bg-white px-5 py-5">
        <form action={updateMetaAction.bind(null, form.id)} className="space-y-4">
          <label className="block">
            <span className="block font-medium">題名</span>
            <input name="title" defaultValue={form.title} required className={input} />
          </label>
          <label className="block">
            <span className="block font-medium">説明（回答する人に見せる。日時、場所など）</span>
            <textarea name="description" defaultValue={form.description ?? ""} rows={3} className={input} />
          </label>
          <fieldset>
            <legend className="font-medium">公開範囲</legend>
            {FORM_MODES.map((m) => (
              <label key={m} className="mt-1 flex items-center gap-2">
                <input type="radio" name="mode" value={m} defaultChecked={form.mode === m} className="size-5" />
                {MODE_LABELS[m]}
              </label>
            ))}
          </fieldset>
          <button type="submit" className="rounded bg-stone-800 px-4 py-2 font-medium text-white">
            保存
          </button>
        </form>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-bold">設問</h2>
        {locked && (
          <p className="mt-2 rounded border border-amber-300 bg-amber-50 px-4 py-3">
            回答が届いているので、設問は変えられません（題名、説明、公開範囲、状態は変えられます）。
          </p>
        )}
        {form.questions.length === 0 && <p className="mt-2 text-stone-500">設問はまだありません。下から足してください。</p>}
        <ol className="mt-3 space-y-4">
          {form.questions.map((q, i) => (
            <QuestionCard key={q.id} formId={form.id} q={q} index={i} total={form.questions.length} locked={locked} />
          ))}
        </ol>

        {!locked && (
          <form action={addQuestionAction.bind(null, form.id)} className="mt-6 flex flex-wrap items-end gap-3 rounded border border-dashed border-stone-400 px-4 py-4">
            <label className="min-w-64 flex-1">
              <span className="block text-base">新しい設問の文言</span>
              <input name="label" required className={input} placeholder="例: 参加される人数" />
            </label>
            <label>
              <span className="block text-base">種類</span>
              <select name="type" defaultValue="short" className={input}>
                {QUESTION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {QUESTION_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="rounded bg-stone-800 px-4 py-2 font-medium text-white">
              ＋ 設問を足す
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
