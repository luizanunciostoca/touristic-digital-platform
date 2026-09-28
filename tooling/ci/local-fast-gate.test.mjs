import assert from "node:assert/strict";
import test from "node:test";
import { affectedPackages, fastGatePlan } from "./local-fast-gate.mjs";
const packages = [
  { name: "@example/core", path: "packages/core", dependencies: [] },
  {
    name: "@example/runtime",
    path: "services/runtime",
    dependencies: ["@example/core"],
  },
  {
    name: "@example/web",
    path: "apps/web",
    dependencies: ["@example/runtime"],
  },
  { name: "@example/unrelated", path: "packages/unrelated", dependencies: [] },
];
test("affected selection includes transitive consumers without unrelated packages", () => {
  assert.deepEqual(affectedPackages(["packages/core/src/index.ts"], packages), [
    "@example/core",
    "@example/runtime",
    "@example/web",
  ]);
});
test("unknown, dependencies and non-package runtime changes use full local gate", () => {
  for (const files of [
    ["unexpected/file.ts"],
    ["package.json"],
    [
      "apps/morro-digital-platform/src/assistant/assistant-conversation-owner.ts",
    ],
  ])
    assert.equal(fastGatePlan(files, packages).full, true);
});
test("proven documentation changes avoid runtime work", () => {
  const plan = fastGatePlan(["docs/architecture/readme.md"], packages);
  assert.equal(plan.full, false);
  assert.equal(plan.impact.nonRuntime, true);
});
