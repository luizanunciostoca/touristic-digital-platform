import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { analyzeFiles } from "./impact-analyzer.mjs";
import { assertOwnershipCoverage } from "./local-fast-gate.mjs";
import { matchesOwnershipPath } from "../fabric/ownership-path.mjs";

const paths = [
  "apps/morro-digital-platform/src/ux/brand-v2-adoption.test.ts",
  "apps/morro-digital-platform/src/ux/premium-ux-mode.test.ts",
  "apps/morro-digital-platform/src/ux/profile-settings-row-visibility-contract.test.ts",
  "apps/morro-digital-platform/src/ux/css-cascade-contract.ts",
];
const suites = [
  "morro-performance-budget.yml",
  "morro-runtime-startup-performance.yml",
  "home-first-run-browser-regression.yml",
  "home-discover-manual-conformance.yml",
  "place-explore-v2-visual-regression.yml",
  "navigation-turn-by-turn-parity.yml",
  "navigation-accessibility-baseline.yml",
  "pwa-offline-browser-contract.yml",
].sort();
const impact = JSON.parse(
  readFileSync(new URL("./test-impact-manifest.json", import.meta.url), "utf8"),
);
const ownership = JSON.parse(
  readFileSync(new URL("../../.morro/ownership.json", import.meta.url), "utf8"),
);

for (const path of paths) {
  test("CSS cascade contract preserves complete runtime proof: " + path, () => {
    const report = analyzeFiles([path]);
    assert.equal(report.classificationBlocked, false);
    assert.equal(report.risk, "HIGH");
    assert.equal(report.qualityProfile, "UI_BUGFIX_FAST");
    assert.equal(report.nonRuntime, false);
    assert.equal(report.needsBrowser, true);
    assert.equal(report.needsVisual, true);
    assert.deepEqual(report.suites, suites);
    assert.deepEqual(report.unknownFiles, []);
    assert.equal(
      impact.domains["entry-css-runtime"].paths.filter((p) => p === path)
        .length,
      1,
    );
    assert.deepEqual(
      ownership.domains
        .filter((d) =>
          d.pathPrefixes.some((p) => matchesOwnershipPath(path, p)),
        )
        .map((d) => d.id),
      ["map"],
    );
    assert.deepEqual(assertOwnershipCoverage([path], ownership), {
      covered: 1,
    });
  });
}
test("unrelated UX paths remain unmapped and fail closed", () => {
  const unknown =
    "apps/morro-digital-platform/src/ux/unregistered-cascade-sentinel.ts";
  const report = analyzeFiles([...paths, unknown]);
  assert.equal(report.classificationBlocked, true);
  assert.equal(report.risk, "CRITICAL");
  assert.equal(report.qualityProfile, "CLASSIFICATION_BLOCK");
  assert.deepEqual(report.unknownFiles, [unknown]);
  assert.throws(
    () => assertOwnershipCoverage([unknown], ownership),
    /FAST_GATE_OWNERSHIP_UNCOVERED/,
  );
});
test("mixed governance and CSS paths cannot downgrade browser proof", () => {
  const report = analyzeFiles([
    ...paths,
    ".github/morro-control/claims.json",
    ".github/morro-control/events.ndjson",
    ".morro/changesets/MD-HOME-CSS-CONTRACT-TRANSITION-20261022.json",
    "tooling/ci/css-cascade-transition.test.mjs",
  ]);
  assert.equal(report.classificationBlocked, false);
  assert.equal(report.nonRuntime, false);
  assert.equal(report.needsBrowser, true);
  assert.equal(report.needsVisual, true);
  for (const suite of suites) assert.ok(report.suites.includes(suite), suite);
  assert.equal(report.serializedControlTransitionOnly, false);
});
