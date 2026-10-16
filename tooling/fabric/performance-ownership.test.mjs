import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { matchesOwnershipPath } from "./ownership-path.mjs";

const read = (path) =>
  JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), "utf8"));
const ownership = read(".morro/ownership.json");
const risk = read(".morro/risk-policy.json");
const cases = [
  [
    "apps/morro-digital-platform/src/performance/browser-startup-performance.ts",
    "map",
  ],
  [
    "apps/morro-digital-platform/src/performance/browser-startup-performance.test.ts",
    "map",
  ],
  ["tooling/performance/check-morro-digital-budget.mjs", "ci-release"],
  ["tooling/performance/check-morro-digital-budget.test.mjs", "ci-release"],
];
const owners = (path) =>
  ownership.domains
    .filter((domain) =>
      domain.pathPrefixes.some((prefix) => matchesOwnershipPath(path, prefix)),
    )
    .map(({ id }) => id);

for (const [path, owner] of cases) {
  test(`performance path has one canonical owner: ${path}`, () => {
    assert.deepEqual(owners(path), [owner]);
    for (const suffix of [".backup", "-old", "/child"]) {
      assert.deepEqual(
        owners(path + suffix),
        [],
        `overbroad mapping: ${suffix}`,
      );
    }
  });
}

test("performance control tooling has explicit high risk floors", () => {
  for (const [path, owner] of cases) {
    if (owner === "ci-release") assert.ok(risk.highPaths.includes(path), path);
  }
  for (const path of [
    "tooling/performance/unregistered.mjs",
    "apps/morro-digital-platform/src/performance/unregistered.ts",
  ]) {
    assert.deepEqual(
      owners(path),
      [],
      "unregistered neighbors must stay closed",
    );
  }
});
