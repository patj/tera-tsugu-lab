"use client";

// 法要の申し込みフォーム。年を選ぶと、選んだ故人の回忌を自動で提案する（手で直せる）
import { useState } from "react";
import type { MemorialApplyOptions } from "@/domain/portal";
import { PortalForm } from "../../../_components/portal-form";
import { inputClass } from "../../../_components/styles";

const radioClass = "flex items-center gap-3 rounded-lg border border-stone-300 bg-white px-4 py-3";

export function ApplyForm({ opts }: { opts: MemorialApplyOptions }) {
  const [year, setYear] = useState(opts.defaultYear);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [kaiki, setKaiki] = useState<Record<string, number>>({});
  const [seshu, setSeshu] = useState<string>(opts.selfPersonId);

  const suggestion = (personId: string, y = year) => opts.deceased.find((d) => d.id === personId)?.suggestions[y];
  const kaikiOf = (personId: string) => kaiki[personId] ?? suggestion(personId)?.kaiki ?? 1;

  const changeYear = (y: number) => {
    setYear(y);
    // 年を変えたら、回忌を新しい年の提案に戻す
    setKaiki({});
    setChecked((prev) => new Set([...prev].filter((id) => suggestion(id, y))));
  };
  const toggle = (id: string, on: boolean) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <PortalForm action="/portal/memorial/apply/submit" submitLabel="この内容で申し込む" pendingLabel="申し込んでいます…" className="space-y-8">
      <fieldset>
        <legend className="text-xl font-bold">1. 法要を営む年</legend>
        <select name="year" value={year} onChange={(e) => changeYear(Number(e.target.value))} className={inputClass}>
          {opts.years.map((y) => (
            <option key={y} value={y}>
              {y} 年
            </option>
          ))}
        </select>
      </fieldset>

      <fieldset>
        <legend className="text-xl font-bold">2. 供養する故人</legend>
        <p className="mt-1 text-base text-stone-600">
          複数の方を選ぶと、複数の故人をあわせて供養する法要になります。回忌は自動で入ります（直すこともできます）。
        </p>
        <ul className="mt-3 space-y-3">
          {opts.deceased.map((d) => {
            const s = suggestion(d.id);
            const on = checked.has(d.id);
            const k = kaikiOf(d.id);
            const choices = [...opts.kaikiChoices];
            if (s && !choices.some((c) => c.kaiki === s.kaiki)) choices.push({ kaiki: s.kaiki, kaikiName: s.kaikiName });
            if (!choices.some((c) => c.kaiki === k)) choices.push({ kaiki: k, kaikiName: `${k} 回忌` });
            choices.sort((a, b) => a.kaiki - b.kaiki);
            return (
              <li key={d.id} className={`rounded-xl border-2 px-4 py-3 ${on ? "border-stone-800 bg-white" : "border-stone-200 bg-white"}`}>
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    name="target"
                    value={d.id}
                    checked={on}
                    disabled={!s}
                    onChange={(e) => toggle(d.id, e.target.checked)}
                    className="mt-1 size-6"
                  />
                  <span>
                    <span className="block text-xl font-bold">
                      {d.relation ? `${d.relation}・` : ""}
                      {d.name}
                    </span>
                    <span className="block text-base text-stone-600">
                      {d.homyo ?? ""}
                      {d.deathDate && `（${Number(d.deathDate.slice(0, 4))} 年 没）`}
                    </span>
                    {s ? (
                      <span className={`mt-1 block text-base ${s.isMemorialKaiki ? "text-emerald-800" : "text-stone-600"}`}>
                        {year} 年は{s.kaikiName}にあたります{s.isMemorialKaiki ? "" : "（年忌の年ではありません）"}
                      </span>
                    ) : (
                      <span className="mt-1 block text-base text-stone-500">{year} 年には選べません</span>
                    )}
                  </span>
                </label>
                {on && (
                  <label className="mt-3 block">
                    <span className="text-base">回忌</span>
                    <select
                      name={`kaiki_${d.id}`}
                      value={k}
                      onChange={(e) => setKaiki((prev) => ({ ...prev, [d.id]: Number(e.target.value) }))}
                      className={inputClass}
                    >
                      {choices.map((c) => (
                        <option key={c.kaiki} value={c.kaiki}>
                          {c.kaikiName}
                        </option>
                      ))}
                    </select>
                    {s && k !== s.kaiki && (
                      <span className="mt-1 block text-base text-amber-800">
                        {year} 年は{s.kaikiName}にあたります。このままでよければ、お寺で確かめてご連絡します。
                      </span>
                    )}
                  </label>
                )}
              </li>
            );
          })}
        </ul>
      </fieldset>

      <fieldset>
        <legend className="text-xl font-bold">3. 施主</legend>
        <div className="mt-3 space-y-2">
          {opts.family.map((f) => (
            <label key={f.id} className={radioClass}>
              <input type="radio" name="seshu" value={f.id} checked={seshu === f.id} onChange={() => setSeshu(f.id)} className="size-5" />
              {f.name}
              {f.isSelf ? "（ご本人）" : f.relation ? `（${f.relation}）` : ""}
            </label>
          ))}
          <label className={radioClass}>
            <input type="radio" name="seshu" value="__name__" checked={seshu === "__name__"} onChange={() => setSeshu("__name__")} className="size-5" />
            ほかの方（お名前を入力）
          </label>
          {seshu === "__name__" && <input name="seshuName" required maxLength={50} placeholder="施主のお名前" className={inputClass} />}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-xl font-bold">4. ご希望の時期</legend>
        <p className="mt-1 text-base text-stone-600">第 1 希望は必ず入力してください。1 日だけなら、終わりの日は空けておいてかまいません。</p>
        {[1, 2, 3].map((i) => (
          <div key={i} className="mt-4 rounded-xl bg-white px-4 py-3">
            <p className="font-bold">第 {i} 希望{i === 1 && <span className="ml-2 rounded bg-red-700 px-1.5 py-0.5 text-sm text-white">必須</span>}</p>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-base">
                始まりの日
                <input type="date" name={`p${i}_from`} min={opts.minDate} required={i === 1} className={inputClass} />
              </label>
              <label className="block text-base">
                終わりの日
                <input type="date" name={`p${i}_to`} min={opts.minDate} className={inputClass} />
              </label>
            </div>
            <label className="mt-2 block text-base">
              補足（例: 土日を希望、午前中）
              <input name={`p${i}_note`} maxLength={100} className={inputClass} />
            </label>
          </div>
        ))}
      </fieldset>

      <fieldset>
        <legend className="text-xl font-bold">5. 場所</legend>
        <div className="mt-3 space-y-2">
          {(
            [
              ["temple", "お寺（本堂）"],
              ["home", "ご自宅"],
              ["grave", "お墓（墓前）"],
            ] as const
          ).map(([v, label]) => (
            <label key={v} className={radioClass}>
              <input type="radio" name="location" value={v} defaultChecked={v === "temple"} className="size-5" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-xl font-bold">6. そのほか</legend>
        <label className="block">
          参列の人数（おおよそ）
          <input type="number" name="attendees" min={1} max={200} inputMode="numeric" className={inputClass} />
        </label>
        <div>
          <p>お斎（会食）</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(
              [
                ["yes", "あり"],
                ["no", "なし"],
                ["", "未定"],
              ] as const
            ).map(([v, label]) => (
              <label key={v} className={radioClass}>
                <input type="radio" name="otoki" value={v} defaultChecked={v === ""} className="size-5" />
                {label}
              </label>
            ))}
          </div>
        </div>
        <label className="block">
          連絡事項
          <textarea name="notes" rows={3} maxLength={1000} className={inputClass} />
        </label>
      </fieldset>
    </PortalForm>
  );
}
