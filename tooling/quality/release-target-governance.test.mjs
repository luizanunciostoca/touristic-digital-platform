import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const workflowsDir = resolve(root, ".github/workflows");

const CANONICAL_STAGING = {
  serviceId: "srv-da4hb6c9v7es7386ttt0",
  serviceName: "morro-digital-v2-staging",
  canonicalUrl: "https://morro-digital-v2-staging.onrender.com",
};

const FORBIDDEN_STAGING_TARGETS = [
  "srv-daqgk83ncjis739tghig",
  "https://morro-digital-v2.onrender.com",
  "srv-d9p0to6gekts73f0lh90",
  "https://morro-digital-staging.onrender.com",
];

async function workflowSources() {
  const files = (await readdir(workflowsDir))
    .filter((name) => /\.ya?ml$/u.test(name))
    .sort();
  return new Map(
    await Promise.all(
      files.map(async (name) => [
        name,
        await readFile(resolve(workflowsDir, name), "utf8"),
      ]),
    ),
  );
}

test("staging promotion is exclusively bound to canonical V2 staging", async () => {
  const workflows = await workflowSources();
  const staging = workflows.get("staging-render-promotion.yml");
  assert.ok(staging, "staging-render-promotion.yml must exist");

  for (const marker of [
    "RENDER_STAGING_API_KEY",
    "RENDER_STAGING_DEPLOY_HOOK_URL",
    "RENDER_STAGING_SERVICE_ID",
    "RENDER_STAGING_CANONICAL_URL",
    `EXPECTED_STAGING_SERVICE_ID: ${CANONICAL_STAGING.serviceId}`,
    `EXPECTED_STAGING_SERVICE_NAME: ${CANONICAL_STAGING.serviceName}`,
    `EXPECTED_STAGING_CANONICAL_URL: ${CANONICAL_STAGING.canonicalUrl}`,
    "https://api.render.com/v1/services/$RENDER_STAGING_SERVICE_ID",
    "staging-deployment-evidence.json",
  ]) {
    assert.ok(staging.includes(marker), `missing staging target proof marker: ${marker}`);
  }

  for (const forbidden of FORBIDDEN_STAGING_TARGETS) {
    assert.ok(!staging.includes(forbidden), `staging workflow references forbidden target: ${forbidden}`);
  }

  assert.ok(!/secrets\.RENDER_DEPLOY_HOOK_URL\b/u.test(staging));
  assert.ok(!/secrets\.RENDER_SERVICE_ID\b/u.test(staging));
  assert.ok(!/secrets\.RENDER_CANONICAL_URL\b/u.test(staging));
});

test("Final Release Acceptance consumes structured staging target evidence", async () => {
  const workflows = await workflowSources();
  const acceptance = workflows.get("final-release-acceptance.yml");
  assert.ok(acceptance, "final-release-acceptance.yml must exist");

  for (const marker of [
    "staging-deployment-evidence.json",
    `.serviceId == "${CANONICAL_STAGING.serviceId}"`,
    `.serviceName == "${CANONICAL_STAGING.serviceName}"`,
    `.canonicalUrl == "${CANONICAL_STAGING.canonicalUrl}"`,
    '.environment == "staging"',
    ".expectedSha == $sha",
    ".liveSha == $sha",
    ".deploymentId | length > 0",
  ]) {
    assert.ok(acceptance.includes(marker), `Final Release Acceptance missing target evidence marker: ${marker}`);
  }
});

test("active workflows cannot resurrect legacy staging targets or generic Render deploy secrets", async () => {
  const workflows = await workflowSources();
  const legacyOnly = [
    "srv-d9p0to6gekts73f0lh90",
    "https://morro-digital-staging.onrender.com",
  ];
  const genericSecrets = [
    /secrets\.RENDER_DEPLOY_HOOK_URL\b/u,
    /secrets\.RENDER_SERVICE_ID\b/u,
    /secrets\.RENDER_CANONICAL_URL\b/u,
  ];

  for (const [name, source] of workflows) {
    for (const forbidden of legacyOnly) {
      assert.ok(!source.includes(forbidden), `${name} references legacy Render target ${forbidden}`);
    }
    for (const pattern of genericSecrets) {
      assert.ok(!pattern.test(source), `${name} uses ambiguous Render secret ${pattern}`);
    }
  }
});
