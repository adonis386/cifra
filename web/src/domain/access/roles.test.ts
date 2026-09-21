import assert from "node:assert/strict";
import test from "node:test";
import { isCompanyAdmin, paymentAdminActions } from "./roles";

test("solo owner y admin editan cobros", () => {
  assert.equal(isCompanyAdmin("owner"), true);
  assert.equal(isCompanyAdmin("admin"), true);
  assert.equal(isCompanyAdmin("accountant"), false);
  assert.equal(isCompanyAdmin("viewer"), false);
});

test("confirmed vuelve a borrador; draft se edita y confirma", () => {
  assert.deepEqual(paymentAdminActions("confirmed"), {
    canReset: true,
    canEdit: false,
    canConfirm: false,
  });
  assert.deepEqual(paymentAdminActions("draft"), {
    canReset: false,
    canEdit: true,
    canConfirm: true,
  });
});
