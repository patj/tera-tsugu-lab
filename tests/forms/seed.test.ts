// フォームのシード: 過去の花まつり（締め切り、一般の回答あり）
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { closeDb } from "@/db/client";
import { getFormForRespondent, getFormResults, listForms } from "@/domain/forms";
import { resetDb } from "../helpers/db";
import { jushokuActor } from "./helpers";

describe("フォームのシード", () => {
  after(async () => {
    await closeDb();
  });

  it("花まつりは締め切りで、一般の回答が入っている。ほうろく灸は入れない", async () => {
    const seed = await resetDb();
    const staff = await jushokuActor(seed);
    const r = await getFormResults(staff, seed.get("form:hanamatsuri"));
    assert.equal(r.form.status, "closed");
    assert.deepEqual(r.responses, { member: 0, public: 5, total: 5 });
    assert.deepEqual(r.persons, { member: 0, public: 9, total: 9 });
    assert.equal((await getFormForRespondent(r.form.id, { source: "public" }))?.availability, "closed");
    assert.ok((await listForms(staff)).every((f) => !f.title.includes("ほうろく灸")));
  });
});
