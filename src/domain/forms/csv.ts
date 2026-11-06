// 回答と名簿の CSV。Excel で文字化けしないように、先頭に BOM をつけ、改行は CRLF にする
import { type DbOrTx, db } from "@/db/client";
import type { Actor } from "@/domain/core";
import { formatAnswer, personEntries } from "./format";
import { SOURCE_LABELS } from "./labels";
import { listResponses } from "./results";

const BOM = "﻿";

function cell(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return BOM + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

export type CsvFile = { filename: string; body: string };

/** 回答の CSV（1 回答 1 行。person_list は「N 人: 氏名、氏名」） */
export async function responsesCsv(actor: Actor, formId: string, conn: DbOrTx = db): Promise<CsvFile> {
  const { form, rows } = await listResponses(actor, formId, conn);
  const hasPersonList = form.questions.some((q) => q.type === "person_list");
  const header = ["受付日時", "区分", "入口", "世帯", "回答者", "連絡先", ...form.questions.map((q) => q.label)];
  if (hasPersonList) header.push("人数");
  const body = rows.map((r) => {
    const line: (string | number | null)[] = [
      r.createdAtLabel,
      r.kind,
      SOURCE_LABELS[r.source],
      r.householdName,
      r.respondentName,
      r.contact,
      ...form.questions.map((q) => formatAnswer(q, r.answers[q.id])),
    ];
    if (hasPersonList) line.push(r.personCount);
    return line;
  });
  return { filename: `${form.title}_回答.csv`, body: toCsv([header, ...body]) };
}

/** 名簿の CSV（person_list を 1 人 1 行に展開したもの。例: ほうろく灸の祈願者の名簿） */
export async function rosterCsv(actor: Actor, formId: string, conn: DbOrTx = db): Promise<CsvFile> {
  const { form, rows } = await listResponses(actor, formId, conn);
  const lists = form.questions.filter((q) => q.type === "person_list");
  const many = lists.length > 1;
  const columns = lists.flatMap((q) =>
    (q.itemFields ?? []).map((f) => ({ questionId: q.id, key: f.key, label: many ? `${q.label}: ${f.label}` : f.label })),
  );
  const header = ["番号", "受付日時", "区分", "世帯", "回答者", "連絡先", ...(many ? ["設問"] : []), "台帳から", ...columns.map((c) => c.label)];
  const body: (string | number | null)[][] = [];
  let n = 0;
  for (const r of rows) {
    for (const q of lists) {
      for (const entry of personEntries(r.answers[q.id])) {
        n += 1;
        body.push([
          n,
          r.createdAtLabel,
          r.kind,
          r.householdName,
          r.respondentName,
          r.contact,
          ...(many ? [q.label] : []),
          entry.personId ? "◯" : "",
          ...columns.map((c) => (c.questionId === q.id ? (entry.values[c.key] ?? "") : "")),
        ]);
      }
    }
  }
  return { filename: `${form.title}_名簿.csv`, body: toCsv([header, ...body]) };
}
