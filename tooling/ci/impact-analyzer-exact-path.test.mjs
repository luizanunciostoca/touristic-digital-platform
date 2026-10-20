import assert from "node:assert/strict";
import test from "node:test";
import { analyzeFiles } from "./impact-analyzer.mjs";

test("file-like literal rules are exact while directory and stem rules retain prefix semantics", () => {
  const exact = analyzeFiles([".gitignore"]);
  assert.ok(exact.domains.includes("ci-tooling"));
  assert.equal(exact.classificationBlocked, false);
  assert.equal(exact.qualityProfile, "NON_RUNTIME");

  const nearCollision = analyzeFiles([".gitignore.local"]);
  assert.equal(nearCollision.classificationBlocked, true);
  assert.deepEqual(nearCollision.unknownFiles, [".gitignore.local"]);
  assert.equal(nearCollision.qualityProfile, "CLASSIFICATION_BLOCK");

  const directoryPrefix = analyzeFiles(["tooling/ci/nested/example.mjs"]);
  assert.ok(directoryPrefix.domains.includes("ci-tooling"));
  assert.equal(directoryPrefix.classificationBlocked, false);

  const stemPrefix = analyzeFiles(["Dockerfile.production"]);
  assert.ok(stemPrefix.domains.includes("database"));
  assert.equal(stemPrefix.classificationBlocked, false);
});

test("ticketing financial API impact is CRITICAL and exact-path", () => {
  const path = "apps/morro-digital-platform/tooling/ticketing-api.mjs";
  const decision = analyzeFiles([path]);
  assert.equal(decision.classificationBlocked, false);
  assert.deepEqual(decision.unknownFiles, []);
  assert.ok(decision.domains.includes("payments"));
  assert.equal(decision.risk, "CRITICAL");
  assert.equal(decision.needsFullRegression, true);
  assert.equal(decision.qualityProfile, "DEEP_PROOF");
  assert.equal(decision.needsDatabase, true);
  assert.equal(decision.needsFullSecurity, true);
  assert.ok(decision.suites.includes("payments-browser-checkout-contract.yml"));
  const composed = analyzeFiles([path, ".github/morro-control/claims.json"]);
  assert.equal(composed.classificationBlocked, false);
  assert.ok(composed.domains.includes("governance"));
  assert.equal(composed.risk, "CRITICAL");
  for (const alias of [
    path + ".bak",
    path + "x",
    "apps/morro-digital-platform/tooling/ticketing-api-mock.mjs",
  ]) {
    const rejected = analyzeFiles([alias]);
    assert.equal(rejected.classificationBlocked, true);
    assert.ok(rejected.unknownFiles.includes(alias));
  }
});

import { readFileSync } from "node:fs";
import { matchesOwnershipPath } from "../fabric/ownership-path.mjs";

const ownershipAdditions = [
  "apps/morro-digital-platform/src/bootstrap/geospatial.test.ts",
  "apps/morro-digital-platform/src/bootstrap/geospatial.ts",
  "apps/morro-digital-platform/src/bootstrap/runtime.test.ts",
  "apps/morro-digital-platform/src/bootstrap/runtime.ts",
  "apps/morro-digital-platform/src/browser.ts",
  "apps/morro-digital-platform/src/destinations/destination-browser-entry.ts",
  "apps/morro-digital-platform/src/destinations/destination-page.test.ts",
  "apps/morro-digital-platform/src/destinations/destination-page.ts",
  "apps/morro-digital-platform/src/runtime/public-destination.test.ts",
  "apps/morro-digital-platform/src/runtime/public-destination.ts",
];
const impactAdditions = [
  "apps/morro-digital-platform/public/assets/brand/itacare-digital-micro-v2.svg",
  "apps/morro-digital-platform/public/assets/brand/itacare-digital-symbol-v2.svg",
  "apps/morro-digital-platform/public/destination.css",
  "apps/morro-digital-platform/public/destination.html",
  "apps/morro-digital-platform/src/bootstrap/geospatial.test.ts",
  "apps/morro-digital-platform/src/bootstrap/geospatial.ts",
  "apps/morro-digital-platform/src/bootstrap/runtime.test.ts",
  "apps/morro-digital-platform/src/bootstrap/runtime.ts",
  "apps/morro-digital-platform/src/browser.ts",
  "apps/morro-digital-platform/src/destinations/destination-browser-entry.ts",
  "apps/morro-digital-platform/src/destinations/destination-page.test.ts",
  "apps/morro-digital-platform/src/destinations/destination-page.ts",
  "apps/morro-digital-platform/src/runtime/public-destination.test.ts",
  "apps/morro-digital-platform/src/runtime/public-destination.ts",
];
const impactDomain = {
  paths: [
    "apps/morro-digital-platform/public/assets/brand/itacare-digital-micro-v2.svg",
    "apps/morro-digital-platform/public/assets/brand/itacare-digital-symbol-v2.svg",
    "apps/morro-digital-platform/public/destination.css",
    "apps/morro-digital-platform/public/destination.html",
    "apps/morro-digital-platform/src/bootstrap/geospatial.test.ts",
    "apps/morro-digital-platform/src/bootstrap/geospatial.ts",
    "apps/morro-digital-platform/src/bootstrap/runtime.test.ts",
    "apps/morro-digital-platform/src/bootstrap/runtime.ts",
    "apps/morro-digital-platform/src/browser.ts",
    "apps/morro-digital-platform/src/destinations/destination-browser-entry.ts",
    "apps/morro-digital-platform/src/destinations/destination-page.test.ts",
    "apps/morro-digital-platform/src/destinations/destination-page.ts",
    "apps/morro-digital-platform/src/runtime/public-destination.test.ts",
    "apps/morro-digital-platform/src/runtime/public-destination.ts",
  ],
  risk: "CRITICAL",
  dependsOn: ["auth", "business"],
  suites: ["itacare-product-candidate-proof.yml"],
  needsBrowser: true,
  needsVisual: true,
  needsDatabase: true,
  needsDependencyAudit: false,
  needsFullSecurity: true,
};

const nearCollisions = (path) => [
  `${path}.bak`,
  `${path}x`,
  `${path}/nested.ts`,
  `${path.slice(0, path.lastIndexOf("/") + 1)}unclaimed-${path.slice(path.lastIndexOf("/") + 1)}`,
];

test("Itacare public UI exact paths retain critical runtime proof and reject near collisions", () => {
  for (const path of impactAdditions) {
    const decision = analyzeFiles([path]);
    assert.equal(decision.classificationBlocked, false, path);
    assert.deepEqual(decision.unknownFiles, [], path);
    assert.ok(decision.domains.includes("destination-public-ui"), path);
    assert.equal(decision.risk, "CRITICAL", path);
    assert.equal(decision.qualityProfile, "DEEP_PROOF", path);
    assert.equal(decision.needsFullRegression, true, path);
    for (const key of [
      "needsBrowser",
      "needsVisual",
      "needsDatabase",
      "needsFullSecurity",
    ]) {
      assert.equal(decision[key], true, `${path}:${key}`);
    }
    assert.ok(
      decision.suites.includes("itacare-product-candidate-proof.yml"),
      path,
    );
    for (const alias of nearCollisions(path)) {
      const rejected = analyzeFiles([alias]);
      assert.equal(rejected.classificationBlocked, true, alias);
      assert.ok(rejected.unknownFiles.includes(alias), alias);
      assert.ok(!rejected.domains.includes("destination-public-ui"), alias);
    }
  }
  const classification = JSON.parse(
    readFileSync(
      new URL("./test-impact-manifest.json", import.meta.url),
      "utf8",
    ),
  );
  assert.deepEqual(
    classification.domains["destination-public-ui"],
    impactDomain,
  );
});

test("Itacare app ownership is exact and preserves trusted server ownership", () => {
  const ownership = JSON.parse(
    readFileSync(
      new URL("../../.morro/ownership.json", import.meta.url),
      "utf8",
    ),
  );
  const owners = (path) =>
    ownership.domains
      .filter((domain) =>
        domain.pathPrefixes.some((prefix) =>
          matchesOwnershipPath(path, prefix),
        ),
      )
      .map((domain) => domain.id);
  for (const path of ownershipAdditions) {
    assert.deepEqual(owners(path), ["map"], path);
    for (const alias of nearCollisions(path))
      assert.deepEqual(owners(alias), [], alias);
  }
  assert.deepEqual(
    owners("apps/morro-digital-platform/tooling/dev-server.mjs"),
    ["auth"],
  );
  assert.deepEqual(
    owners(
      "apps/morro-digital-platform/tooling/itacare-place-destination-http.mysql.mjs",
    ),
    ["business"],
  );
  const server = analyzeFiles([
    "apps/morro-digital-platform/tooling/dev-server.mjs",
  ]);
  assert.equal(server.risk, "CRITICAL");
  assert.ok(server.domains.includes("destination-host-isolation"));
  assert.ok(server.domains.includes("destination-scoped-public-place"));
});

test("Control Center activation UI has exact auth ownership and retains the authorization floor", () => {
  const ownership = JSON.parse(
    readFileSync(
      new URL("../../.morro/ownership.json", import.meta.url),
      "utf8",
    ),
  );
  const owners = (path) =>
    ownership.domains
      .filter((domain) =>
        domain.pathPrefixes.some((prefix) =>
          matchesOwnershipPath(path, prefix),
        ),
      )
      .map((domain) => domain.id);
  const path = "apps/control-center/public/control-center.js";
  assert.deepEqual(owners(path), ["auth"]);
  for (const alias of nearCollisions(path))
    assert.deepEqual(owners(alias), [], alias);
  assert.deepEqual(
    ownership.domains.find((domain) => domain.id === "auth").contracts,
    ["platform-authz"],
  );
  const risk = JSON.parse(
    readFileSync(
      new URL("../../.morro/risk-policy.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(risk.semanticRiskFloor["platform-authz"], "critical");
  const report = analyzeFiles([path]);
  assert.equal(report.classificationBlocked, false);
  assert.ok(report.domains.includes("control-center"));
  assert.equal(report.risk, "HIGH");
  for (const key of [
    "needsBrowser",
    "needsVisual",
    "needsDatabase",
    "needsFullSecurity",
  ])
    assert.equal(report[key], true, key);
  assert.deepEqual(
    owners(".github/workflows/control-center-destination-contract.yml"),
    ["ci-release"],
  );
});
