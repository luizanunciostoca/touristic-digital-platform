import assert from "node:assert/strict";
import test from "node:test";

import { shouldApplyRuntimeSchema } from "./database-schema-mode.mjs";

test("schema mode defaults to apply outside production cutover", () => {
  assert.equal(shouldApplyRuntimeSchema({}), true);
  assert.equal(
    shouldApplyRuntimeSchema({ MORRO_DATABASE_SCHEMA_MODE: "apply" }),
    true,
  );
});

test("external mode disables runtime DDL and invalid modes fail closed", () => {
  assert.equal(
    shouldApplyRuntimeSchema({ MORRO_DATABASE_SCHEMA_MODE: "external" }),
    false,
  );
  assert.throws(
    () =>
      shouldApplyRuntimeSchema({
        MORRO_DATABASE_SCHEMA_MODE: "best-effort",
      }),
    /MORRO_DATABASE_SCHEMA_MODE_INVALID/u,
  );
});
