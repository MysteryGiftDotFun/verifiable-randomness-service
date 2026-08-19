import assert from "node:assert/strict";
import { test } from "node:test";
import { shouldRollbackClaimOnStatus } from "./payment-rollback.ts";

test("400 after successful claim → rollback", () => {
  assert.equal(shouldRollbackClaimOnStatus(400), true);
});

test("409 already used → do not rollback", () => {
  assert.equal(shouldRollbackClaimOnStatus(409), false);
});

test("5xx after successful claim → rollback", () => {
  assert.equal(shouldRollbackClaimOnStatus(500), true);
  assert.equal(shouldRollbackClaimOnStatus(503), true);
});

test("2xx success → do not rollback", () => {
  assert.equal(shouldRollbackClaimOnStatus(200), false);
});
