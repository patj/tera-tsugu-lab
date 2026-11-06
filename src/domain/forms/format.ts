// 回答の値を、画面と CSV に出す文字にする
import type { Answers, FormQuestion, PersonEntry } from "./types";

export function personEntries(value: unknown): PersonEntry[] {
  return Array.isArray(value) ? (value as PersonEntry[]) : [];
}

/** person_list の 1 人分を表す名前（氏名の項目、なければ最初の項目） */
export function entryDisplayName(q: Pick<FormQuestion, "itemFields">, entry: PersonEntry): string {
  const fields = q.itemFields ?? [];
  const nameField = fields.find((f) => f.profileField === "name") ?? fields[0];
  return (nameField && entry.values[nameField.key]) || "（名前なし）";
}

/** 1 つの設問の回答を 1 行の文字にする */
export function formatAnswer(q: Pick<FormQuestion, "type" | "itemFields">, value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  switch (q.type) {
    case "multi":
      return Array.isArray(value) ? value.join("、") : String(value);
    case "person_list": {
      const entries = personEntries(value);
      if (entries.length === 0) return "";
      return `${entries.length} 人: ${entries.map((e) => entryDisplayName(q, e)).join("、")}`;
    }
    default:
      return String(value);
  }
}

/** 回答を、設問の順に「設問 → 値」の一覧にする（空の回答は省く） */
export function formatAnswers(questions: FormQuestion[], answers: Answers): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  for (const q of questions) {
    const value = formatAnswer(q, answers[q.id]);
    if (value) out.push({ label: q.label, value });
  }
  return out;
}

/** person_list に入力された人数 */
export function countPersons(questions: FormQuestion[], answers: Answers): number {
  return questions
    .filter((q) => q.type === "person_list")
    .reduce((sum, q) => sum + personEntries(answers[q.id]).length, 0);
}
