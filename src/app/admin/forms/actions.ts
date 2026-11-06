"use server";

import { redirect } from "next/navigation";
import { isDomainError } from "@/domain/core";
import {
  addQuestion,
  createForm,
  deleteQuestion,
  isFormMode,
  isFormStatus,
  isQuestionType,
  issueHouseholdTokens,
  moveQuestion,
  setFormStatus,
  updateFormMeta,
  updateQuestion,
  type ItemFieldInput,
  type ProfileField,
  type QuestionInput,
} from "@/domain/forms";
import { getStaffActor } from "@/lib/staff-auth";

/** ドメイン層のエラーは、戻り先の画面に ?error= で表示する */
async function run(back: string, fn: () => Promise<string | void>): Promise<never> {
  let to = back;
  try {
    const next = await fn();
    if (next) to = next;
  } catch (e) {
    if (!isDomainError(e)) throw e;
    to = `${back}${back.includes("?") ? "&" : "?"}error=${encodeURIComponent(e.message)}`;
  }
  redirect(to);
}

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const lines = (s: string) => s.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);

export async function createDraftFormAction(fd: FormData) {
  const actor = await getStaffActor();
  const mode = str(fd, "mode");
  await run("/admin/forms", async () => {
    const form = await createForm(actor, {
      title: str(fd, "title"),
      mode: isFormMode(mode) ? mode : ("bad" as never),
      status: "draft",
      questions: [],
    });
    return `/admin/forms/${form.id}/edit`;
  });
}

export async function setStatusAction(formId: string, status: string, back: string) {
  const actor = await getStaffActor();
  await run(back, async () => {
    if (!isFormStatus(status)) return;
    await setFormStatus(actor, formId, status);
  });
}

export async function updateMetaAction(formId: string, fd: FormData) {
  const actor = await getStaffActor();
  const mode = str(fd, "mode");
  await run(`/admin/forms/${formId}/edit`, async () => {
    await updateFormMeta(actor, formId, {
      title: str(fd, "title"),
      description: str(fd, "description"),
      mode: isFormMode(mode) ? mode : ("bad" as never),
    });
  });
}

const DEFAULT_OPTIONS = ["選択肢 1", "選択肢 2"];
const DEFAULT_ITEM_FIELDS: ItemFieldInput[] = [
  { label: "氏名", type: "short", required: true, profileField: "name" },
  { label: "カナ", type: "short", profileField: "kana" },
];

/** ビルダーの 1 つの設問のフォームを読む */
function readQuestion(fd: FormData): QuestionInput {
  const type = str(fd, "type");
  const count = Number(fd.get("item_count") ?? 0);
  const itemFields: ItemFieldInput[] = [];
  for (let i = 0; i < count; i++) {
    const label = str(fd, `item_${i}_label`);
    if (!label) continue;
    const profile = str(fd, `item_${i}_profile`);
    itemFields.push({
      key: str(fd, `item_${i}_key`) || undefined,
      label,
      type: str(fd, `item_${i}_type`) as ItemFieldInput["type"],
      required: fd.get(`item_${i}_required`) === "on",
      options: lines(str(fd, `item_${i}_options`)),
      profileField: (profile || null) as ItemFieldInput["profileField"],
    });
  }
  const maxPersons = str(fd, "max_persons");
  // 種類を変えたばかりで選択肢や項目の欄がまだないときは、初期値を入れる（保存したあとで編集できる）
  const options = lines(str(fd, "options"));
  return {
    type: isQuestionType(type) ? type : ("bad" as never),
    label: str(fd, "label"),
    description: str(fd, "description"),
    required: fd.get("required") === "on",
    options: options.length === 0 && (type === "single" || type === "multi") ? DEFAULT_OPTIONS : options,
    profileField: (str(fd, "profile_field") || null) as ProfileField | null,
    maxPersons: maxPersons ? Number(maxPersons) : null,
    itemFields: itemFields.length === 0 && type === "person_list" ? DEFAULT_ITEM_FIELDS : itemFields,
  };
}

export async function addQuestionAction(formId: string, fd: FormData) {
  const actor = await getStaffActor();
  const type = str(fd, "type");
  await run(`/admin/forms/${formId}/edit`, async () => {
    // 種類に合わせた初期値で足し、細かいところはあとで編集する
    const input: QuestionInput = {
      type: isQuestionType(type) ? type : ("bad" as never),
      label: str(fd, "label"),
      options: type === "single" || type === "multi" ? DEFAULT_OPTIONS : null,
      itemFields: type === "person_list" ? DEFAULT_ITEM_FIELDS : null,
    };
    const id = await addQuestion(actor, formId, input);
    return `/admin/forms/${formId}/edit#q-${id}`;
  });
}

export async function updateQuestionAction(formId: string, questionId: string, fd: FormData) {
  const actor = await getStaffActor();
  await run(`/admin/forms/${formId}/edit`, async () => {
    await updateQuestion(actor, questionId, readQuestion(fd));
    return `/admin/forms/${formId}/edit#q-${questionId}`;
  });
}

export async function moveQuestionAction(formId: string, questionId: string, direction: "up" | "down") {
  const actor = await getStaffActor();
  await run(`/admin/forms/${formId}/edit`, async () => {
    await moveQuestion(actor, questionId, direction);
    return `/admin/forms/${formId}/edit#q-${questionId}`;
  });
}

export async function deleteQuestionAction(formId: string, questionId: string) {
  const actor = await getStaffActor();
  await run(`/admin/forms/${formId}/edit`, async () => {
    await deleteQuestion(actor, questionId);
  });
}

export async function issueTokensAction(formId: string) {
  const actor = await getStaffActor();
  await run(`/admin/forms/${formId}/links`, async () => {
    const n = await issueHouseholdTokens(actor, formId);
    return `/admin/forms/${formId}/links?issued=${n}`;
  });
}
