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
    "apps/morro-digital-platform/src/navigation/navigation-guidance-ui.ts",
    "map",
  ],
  [
    "apps/morro-digital-platform/src/navigation/navigation-guidance-ui.test.ts",
    "map",
  ],
  ["apps/morro-digital-platform/package.json", "ci-release"],
  [
    "apps/morro-digital-platform/src/navigation/navigation-dom-lifecycle.ts",
    "map",
  ],
  [
    "apps/morro-digital-platform/src/navigation/navigation-dom-lifecycle.test.ts",
    "map",
  ],
  [
    "apps/morro-digital-platform/src/onboarding/public-interactive-tour.ts",
    "map",
  ],
  [
    "apps/morro-digital-platform/src/onboarding/public-onboarding.test.ts",
    "map",
  ],
  [
    "apps/morro-digital-platform/src/accessibility/ux-p0-foundations.test.ts",
    "map",
  ],
  [
    "apps/morro-digital-platform/src/ux/assistant-modal-v2-contract.test.ts",
    "map",
  ],
  ["apps/morro-digital-platform/src/ux/home-shell-v2-contract.test.ts", "map"],
  [
    "apps/morro-digital-platform/src/ux/legacy-css-bundle-v2-contract.test.ts",
    "map",
  ],
  [
    "apps/morro-digital-platform/src/ux/stylelint-governance-v2-contract.test.ts",
    "map",
  ],
  ["apps/morro-digital-platform/src/onboarding/public-onboarding.ts", "map"],
  [
    "apps/morro-digital-platform/src/assistant/assistant-voice-settings.ts",
    "map",
  ],
  [
    "apps/morro-digital-platform/src/assistant/assistant-voice-settings.test.ts",
    "map",
  ],
];
const owners = (path) =>
  ownership.domains
    .filter((domain) =>
      domain.pathPrefixes.some((prefix) => matchesOwnershipPath(path, prefix)),
    )
    .map(({ id }) => id);
for (const [path, owner] of cases) {
  test(`initial CSS path has exactly one literal owner: ${path}`, () => {
    assert.deepEqual(owners(path), [owner]);
    for (const suffix of [".backup", "-old", "/child"])
      assert.deepEqual(
        owners(path + suffix),
        [],
        `overbroad mapping ${path}${suffix}`,
      );
  });
}
test("initial CSS build controls have explicit high risk floors", () => {
  for (const path of [
    "apps/morro-digital-platform/package.json",
    "tooling/ci/build-entry-css.mjs",
    "tooling/ci/build-entry-css.test.mjs",
    "tooling/ci/entry-css-manifest.json",
  ]) {
    assert.deepEqual(owners(path), ["ci-release"]);
    assert.ok(risk.highPaths.includes(path), path);
  }
});
test("runtime siblings remain unregistered while generated assets retain map ownership", () => {
  for (const path of [
    "apps/morro-digital-platform/src/onboarding/unregistered.ts",
    "apps/morro-digital-platform/src/navigation/unregistered.ts",
    "apps/morro-digital-platform/src/accessibility/unregistered.test.ts",
  ])
    assert.deepEqual(owners(path), []);
  assert.deepEqual(
    owners("apps/morro-digital-platform/public/entry-css/home.css"),
    ["map"],
  );
  assert.deepEqual(
    owners("apps/morro-digital-platform/src/map/feature-styles.ts"),
    ["map"],
  );
});

test("navigation guidance runtime and future isolated test have exact high risk floors", () => {
  for (const path of [
    "apps/morro-digital-platform/src/navigation/navigation-guidance-ui.ts",
    "apps/morro-digital-platform/src/navigation/navigation-guidance-ui.test.ts",
  ]) {
    assert.deepEqual(owners(path), ["map"]);
    assert.ok(risk.highPaths.includes(path), path);
    for (const suffix of [".backup", "-old", "/child"])
      assert.equal(risk.highPaths.includes(path + suffix), false);
  }
});
