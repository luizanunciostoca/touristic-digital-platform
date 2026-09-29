import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const runtimeFiles = [
  "apps/morro-digital-platform/tooling/payments-api.mjs",
  "apps/morro-digital-platform/tooling/payments-card-api.mjs",
  "apps/morro-digital-platform/tooling/payments-subscription-api.mjs",
  "apps/morro-digital-platform/tooling/ticketing-api.mjs",
  "apps/morro-digital-platform/tooling/commerce-api.mjs",
];

test("runtime collectors propagate MORRO_DATABASE_SCHEMA_MODE before schema policy evaluation", () => {
  for (const path of runtimeFiles) {
    const source = readFileSync(path, "utf8");
    assert.ok(
      source.includes("shouldApplyRuntimeSchema(environment)"),
      `${path} must evaluate schema policy from its collected environment`,
    );
    assert.ok(
      source.includes('"MORRO_DATABASE_SCHEMA_MODE"'),
      `${path} must collect MORRO_DATABASE_SCHEMA_MODE`,
    );

    const collectStart = source.indexOf("function collectEnvironment");
    const policyCall = source.indexOf("shouldApplyRuntimeSchema(environment)");
    assert.ok(collectStart >= 0, `${path} must define collectEnvironment`);
    assert.ok(
      policyCall > collectStart,
      `${path} must evaluate policy after collection`,
    );

    const collectedSection = source.slice(collectStart, policyCall);
    assert.ok(
      collectedSection.includes('"MORRO_DATABASE_SCHEMA_MODE"'),
      `${path} must propagate schema mode in the collected runtime environment`,
    );
  }
});
