import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { matchesPath } from "./suite-scheduler.mjs";

const startupTest =
  "apps/morro-digital-platform/tooling/ticketing-api-startup.test.mjs";

// These governed workflows use literal quoted path lists. Unsupported forms
// fail this contract instead of silently inventing GitHub trigger coverage.
function eventPaths(workflow, event) {
  const lines = readFileSync(
    new URL("../../.github/workflows/" + workflow, import.meta.url),
    "utf8",
  ).split(/\r?\n/u);
  const start = lines.indexOf("  " + event + ":");
  assert.ok(start >= 0, workflow + ": missing event " + event);
  const block = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^(?:\S|  \S)/u.test(line)) break;
    block.push(line);
  }
  const paths = block.indexOf("    paths:");
  assert.ok(paths >= 0, workflow + ": missing path filters for " + event);
  const filters = [];
  for (const line of block.slice(paths + 1)) {
    if (/^\s*(?:#.*)?$/u.test(line)) continue;
    if (!line.startsWith("      - ")) break;
    const literal = line.slice(8).trim();
    if (literal.startsWith('"')) {
      filters.push(JSON.parse(literal));
    } else {
      assert.ok(literal.startsWith("'") && literal.endsWith("'"));
      filters.push(literal.slice(1, -1).replaceAll("''", "'"));
    }
  }
  assert.ok(filters.length > 0);
  return filters;
}

function isTriggered(filters, file) {
  let included = false;
  for (const pattern of filters) {
    const excluded = pattern.startsWith("!");
    if (matchesPath(file, excluded ? pattern.slice(1) : pattern)) {
      included = !excluded;
    }
  }
  return included;
}

for (const [workflow, event, runtimePath] of [
  [
    "payments-browser-checkout-contract.yml",
    "pull_request",
    "services/financial/src/mysql-verified-payment-result-feed.ts",
  ],
  [
    "payments-browser-checkout-contract.yml",
    "push",
    "services/financial/src/mysql-verified-payment-result-feed.ts",
  ],
  [
    "commerce-browser-regression.yml",
    "pull_request",
    "services/ticketing/src/verified-financial-result-processor.ts",
  ],
]) {
  test(
    workflow + " / " + event + " routes the exact Ticketing startup test",
    () => {
      const filters = eventPaths(workflow, event);
      assert.ok(
        filters.includes(startupTest),
        "exact startup test filter required",
      );
      assert.equal(isTriggered(filters, startupTest), true);
      assert.equal(isTriggered(filters, startupTest + ".unmapped"), false);
      assert.equal(isTriggered(filters, ".github/workflows/" + workflow), true);
      assert.equal(isTriggered(filters, runtimePath), true);
    },
  );
}
