// 世帯の入力欄（作成と編集で共通）
import { HOUSEHOLD_STATUS_LABELS, HOUSEHOLD_STATUSES, type HouseholdDetail } from "@/domain/ledger";
import { Field, inputClass } from "./ui";

export function HouseholdFields({ household }: { household?: HouseholdDetail }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="世帯の名前" hint="例: 山田家">
        <input name="name" required defaultValue={household?.name ?? ""} className={inputClass} />
      </Field>
      <Field label="カナ" hint="並べ替えに使う（例: やまだ）">
        <input name="kana" defaultValue={household?.kana ?? ""} className={inputClass} />
      </Field>
      <Field label="郵便番号">
        <input name="postalCode" defaultValue={household?.postalCode ?? ""} className={inputClass} />
      </Field>
      <Field label="固定電話">
        <input name="phone" defaultValue={household?.phone ?? ""} className={inputClass} />
      </Field>
      <div className="sm:col-span-2">
        <Field label="住所">
          <input name="address" defaultValue={household?.address ?? ""} className={inputClass} />
        </Field>
      </div>
      <Field label="状態" hint="離檀・転出も、ここで変える（台帳からは消さない）">
        <select name="status" defaultValue={household?.status ?? "active"} className={inputClass}>
          {HOUSEHOLD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {HOUSEHOLD_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="入檀日">
        <input name="joinedOn" type="date" defaultValue={household?.joinedOn ?? ""} className={inputClass} />
      </Field>
      <div className="sm:col-span-2">
        <Field label="備考">
          <textarea name="notes" rows={3} defaultValue={household?.notes ?? ""} className={inputClass} />
        </Field>
      </div>
    </div>
  );
}
