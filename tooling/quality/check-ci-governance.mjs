import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const workflowsDir = resolve(root, ".github/workflows");

function fail(message) {
  throw new Error(`CI governance gate: ${message}`);
}

async function text(path) {
  return readFile(resolve(root, path), "utf8");
}

function requireIncludes(source, path, needles) {
  for (const needle of needles) {
    if (!source.includes(needle)) {
      fail(`${path} is missing required contract marker: ${needle}`);
    }
  }
}

const workflowFiles = (await readdir(workflowsDir))
  .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
  .sort();

if (!workflowFiles.length) fail("no versioned workflows were found");

const workflowSources = new Map(
  await Promise.all(
    workflowFiles.map(async (name) => [
      name,
      await text(`.github/workflows/${name}`),
    ]),
  ),
);

for (const [name, source] of workflowSources) {
  if (/BuildFailed/i.test(source) || /BuildFailed/i.test(name)) {
    fail(`stale BuildFailed reference remains in ${name}`);
  }
}

const packageJson = JSON.parse(await text("package.json"));
for (const scriptName of [
  "format:check",
  "architecture:check",
  "features:check",
  "environment:check",
  "release:readiness:check",
  "secret-patterns:check",
  "lint",
  "typecheck",
  "test",
  "build",
  "platform:contracts:check",
  "ci:governance:check",
  "release:target-governance:check",
  "migration:dry-run",
  "release:identity:smoke",
  "auth:smoke",
  "platform:smoke",
  "check",
]) {
  if (typeof packageJson.scripts?.[scriptName] !== "string") {
    fail(`package.json is missing script ${scriptName}`);
  }
}

const quality = workflowSources.get("quality.yml");
if (!quality) fail("quality.yml is missing");
requireIncludes(quality, ".github/workflows/quality.yml", [
  "name: Quality Gate",
  "pull_request:",
  "push:",
  "workflow_dispatch:",
  "branches: [main]",
  "name: quality",
  "pnpm format:check",
  "pnpm architecture:check",
  "pnpm features:check",
  "pnpm environment:check",
  "pnpm release:readiness:check",
  "pnpm secret-patterns:check",
  "pnpm ci:governance:check",
  "pnpm release:target-governance:check",
  "pnpm lint",
  "pnpm typecheck",
  "pnpm test",
  "pnpm build",
  "Validate canonical MySQL matrix",
  "Canonical MySQL matrix:",
]);
if (/\npull_request:\s*\n(?:.|\n)*?\n\s+paths(?:-ignore)?:/m.test(quality)) {
  fail("global Quality Gate must not use pull_request path filters");
}
if (quality.includes("name: quality /")) {
  fail(
    "Quality Gate must remain consolidated instead of multiplying setup jobs",
  );
}
const requiredQualityOrder = [
  "- name: Lint",
  "- name: Typecheck",
  "- name: Test",
  "- name: Build",
  "- name: Validate canonical MySQL matrix",
];
let previousQualityStage = -1;
for (const stage of requiredQualityOrder) {
  const stageIndex = quality.indexOf(stage);
  if (stageIndex <= previousQualityStage) {
    fail(
      `Quality Gate stage order diverged; expected ${requiredQualityOrder.join(" -> ")}`,
    );
  }
  previousQualityStage = stageIndex;
}
const qualityRunnerCount = (quality.match(/^\s{4}runs-on:/gmu) ?? []).length;
if (qualityRunnerCount !== 1) {
  fail(
    `Quality Gate must use exactly one provisioned job; found ${qualityRunnerCount}`,
  );
}

const domainContracts = [
  {
    file: "auth-integration-contract.yml",
    markers: ["pull_request:", "push:", "packages/auth/**", "services/auth/**"],
  },
  {
    file: "business-auth-integration-contract.yml",
    markers: [
      "pull_request:",
      "push:",
      "packages/business/**",
      "services/auth/**",
    ],
  },
  {
    file: "crm-equivalence-browser-contract.yml",
    markers: ["pull_request:", "push:", "packages/crm/**", "services/crm/**"],
  },
  {
    file: "payments-subscription-recurrence-contract.yml",
    markers: [
      "pull_request:",
      "push:",
      "packages/financial/**",
      "packages/ordering/**",
    ],
  },
  {
    file: "ticketing-m147-contract.yml",
    markers: [
      "pull_request:",
      "push:",
      "packages/ticketing/**",
      "services/ticketing/**",
    ],
  },
];

for (const contract of domainContracts) {
  const source = workflowSources.get(contract.file);
  if (!source) fail(`permanent domain contract ${contract.file} is missing`);
  requireIncludes(source, `.github/workflows/${contract.file}`, [
    ...contract.markers,
    "branches:",
    "main",
    "permissions:",
    "contents: read",
  ]);
}

const platformContracts = await text(
  "tooling/quality/check-platform-contracts.mjs",
);
requireIncludes(
  platformContracts,
  "tooling/quality/check-platform-contracts.mjs",
  [
    "PLATFORM-EVENT-ENVELOPE",
    "PLATFORM-OBSERVATION",
    "PLATFORM-HEALTH-SNAPSHOT",
  ],
);

const releaseGate = workflowSources.get("release-promotion-gate.yml");
if (!releaseGate) fail("release-promotion-gate.yml is missing");
requireIncludes(releaseGate, ".github/workflows/release-promotion-gate.yml", [
  "workflow_dispatch:",
  "expected_sha:",
  "name: release / smoke",
  "git ls-remote origin refs/heads/main",
  "pnpm platform:contracts:check",
  "pnpm build",
  "runtime-config.js",
]);
if (/^\s{2}(pull_request|push):/m.test(releaseGate)) {
  fail("release promotion gate must remain explicit workflow_dispatch only");
}

const productionPromotion = workflowSources.get(
  "production-render-promotion.yml",
);
if (!productionPromotion) {
  fail("production-render-promotion.yml is missing");
}
requireIncludes(
  productionPromotion,
  ".github/workflows/production-render-promotion.yml",
  [
    "workflow_dispatch:",
    "expected_sha:",
    "confirm_production:",
    "name: production / preflight",
    "git ls-remote origin refs/heads/main",
    "pnpm platform:contracts:check",
    "pnpm migration:dry-run",
    "pnpm release:readiness:check",
    "pnpm secret-patterns:check",
    "pnpm ci:governance:check",
    "pnpm ci:supply-chain:strict",
    "name: production",
    "RENDER_PRODUCTION_DEPLOY_HOOK_URL",
    "ref=${EXPECTED_SHA}",
    "pnpm --silent payments:render:smoke",
    "production-deployment-evidence.txt",
  ],
);
if (/^\s{2}(pull_request|push):/m.test(productionPromotion)) {
  fail(
    "production Render promotion must remain explicit workflow_dispatch only",
  );
}

const pagesAfterFinalAcceptance = workflowSources.get(
  "pages-after-final-acceptance.yml",
);
if (!pagesAfterFinalAcceptance) {
  fail("pages-after-final-acceptance.yml is missing");
}
requireIncludes(
  pagesAfterFinalAcceptance,
  ".github/workflows/pages-after-final-acceptance.yml",
  [
    "workflow_run:",
    "Final Release Acceptance",
    "github.event.workflow_run.conclusion == 'success'",
    "github.event.workflow_run.head_branch == 'main'",
    "github.event.workflow_run.head_sha",
    "actions/jekyll-build-pages@44a6e6beabd48582f863aeeb6cb2151cc1716697",
    "actions/upload-pages-artifact@56afc609e74202658d3ffba0e8f6dda462b719fa",
    "actions/deploy-pages@368f82528645a54fb793d4d04e342629a3f51346",
    "repos/$GITHUB_REPOSITORY/pages",
    ".build_type // empty",
    'test "$pages_build_type" = "workflow"',
    "git/ref/heads/main",
    'test "$acceptance_state" = "success"',
    "pages / deploy certified SHA",
  ],
);
if (/^\s{2}(pull_request|push):/m.test(pagesAfterFinalAcceptance)) {
  fail(
    "Pages deployment must never publish directly from push/pull_request; it must follow Final Release Acceptance",
  );
}

const pagesSourceGovernance = workflowSources.get(
  "pages-source-governance.yml",
);
if (!pagesSourceGovernance) {
  fail("pages-source-governance.yml is missing");
}
requireIncludes(
  pagesSourceGovernance,
  ".github/workflows/pages-source-governance.yml",
  [
    "name: Pages Source Governance",
    "pages: read",
    "repos/$GITHUB_REPOSITORY/pages",
    ".build_type // empty",
    'if [ "$build_type" != "workflow" ]',
    "Branch-based Pages can publish before Final Release Acceptance",
  ],
);

const productionRollback = workflowSources.get(
  "production-render-rollback.yml",
);
if (!productionRollback) {
  fail("production-render-rollback.yml is missing");
}
requireIncludes(
  productionRollback,
  ".github/workflows/production-render-rollback.yml",
  [
    "workflow_dispatch:",
    "expected_sha:",
    "target_deploy_id:",
    "confirm_rollback:",
    "name: production / rollback",
    "name: production",
    "RENDER_PRODUCTION_API_KEY",
    "RENDER_PRODUCTION_SERVICE_ID",
    "autoDeploy == false",
    "/rollback",
    "pnpm --silent release:identity:smoke",
  ],
);
if (/^\s{2}(pull_request|push):/m.test(productionRollback)) {
  fail(
    "production Render rollback must remain explicit workflow_dispatch only",
  );
}

const stagingPromotion = workflowSources.get("staging-render-promotion.yml");
if (!stagingPromotion) {
  fail("staging-render-promotion.yml is missing");
}
requireIncludes(
  stagingPromotion,
  ".github/workflows/staging-render-promotion.yml",
  [
    "workflow_dispatch:",
    "expected_sha:",
    "confirm_staging:",
    "name: staging / preflight",
    "git ls-remote origin refs/heads/main",
    "pnpm platform:contracts:check",
    "pnpm migration:dry-run",
    "pnpm release:readiness:check",
    "pnpm secret-patterns:check",
    "pnpm ci:governance:check",
    "pnpm ci:supply-chain:strict",
    "name: main - morro-digital-v2-staging",
    "RENDER_STAGING_DEPLOY_HOOK_URL",
    "EXPECTED_STAGING_SERVICE_ID: srv-da4hb6c9v7es7386ttt0",
    "EXPECTED_STAGING_SERVICE_NAME: morro-digital-v2-staging",
    "ref=${EXPECTED_SHA}",
    'url.hostname !== "api.render.com"',
    "url.pathname.match(/^\\\\/deploy\\\\/(srv-[A-Za-z0-9]+)$/)",
    "pnpm --silent payments:render:smoke",
    "staging-deployment-evidence.json",
  ],
);
if (/^\s{2}(pull_request|push):/m.test(stagingPromotion)) {
  fail("staging Render promotion must remain explicit workflow_dispatch only");
}

const mergeQueue = workflowSources.get("merge-queue-full-regression.yml");
if (!mergeQueue) fail("merge-queue-full-regression.yml is missing");
requireIncludes(
  mergeQueue,
  ".github/workflows/merge-queue-full-regression.yml",
  [
    "merge_group:",
    "merge-queue-full-regression",
    "release-acceptance-manifest.json",
    "gh workflow run",
    "headSha",
  ],
);

const releaseImage = workflowSources.get("release-oci-image.yml");
if (!releaseImage) fail("release-oci-image.yml is missing");
requireIncludes(releaseImage, ".github/workflows/release-oci-image.yml", [
  "workflow_dispatch:",
  "expected_sha:",
  "packages: write",
  "docker build",
  "docker push",
  "MORRO_RELEASE_SHA",
  "release-provenance.json",
]);

const ociPromotion = workflowSources.get("oci-release-promotion-gate.yml");
if (!ociPromotion) fail("oci-release-promotion-gate.yml is missing");
requireIncludes(
  ociPromotion,
  ".github/workflows/oci-release-promotion-gate.yml",
  [
    "workflow_dispatch:",
    "expected_sha:",
    "image_digest:",
    "release-oci-image.yml",
    "final-release-acceptance.yml",
    "docker pull",
    "MORRO_RELEASE_SHA",
  ],
);

for (const file of [
  "staging-oci-promotion.yml",
  "production-oci-promotion.yml",
]) {
  const source = workflowSources.get(file);
  if (!source) fail(`${file} is missing`);
  requireIncludes(source, `.github/workflows/${file}`, [
    "workflow_dispatch:",
    "expected_sha:",
    "image_digest:",
    "confirm_deploy:",
    "imgURL=",
    "payments:render:smoke",
  ]);
  if (/^\s{2}(pull_request|push):/m.test(source)) {
    fail(`${file} must remain explicit workflow_dispatch only`);
  }
}

const codeowners = await text(".github/CODEOWNERS");
requireIncludes(codeowners, ".github/CODEOWNERS", [
  "* @luizanunciostoca",
  "/.github/ @luizanunciostoca",
  "/package.json @luizanunciostoca",
  "/pnpm-lock.yaml @luizanunciostoca",
]);

const temporaryPattern =
  /(^|[-_])(once|one-shot|temp|temporary|formatter|format|fix|prepare|probe|reconcile|diagnose)([-_.]|$)/i;
const temporaryCandidates = workflowFiles.filter(
  (name) => temporaryPattern.test(name) || name === "placeholder-invalid.yml",
);

console.log(
  `CI governance valid: ${workflowFiles.length} versioned workflows inspected.`,
);
console.log(
  "Quality topology valid: one consolidated provisioned job named quality.",
);
console.log(
  `Temporary/one-shot cleanup candidates: ${temporaryCandidates.length}.`,
);
for (const name of temporaryCandidates) console.log(`  - ${name}`);
