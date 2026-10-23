import { createHash } from "node:crypto";
import { parsers as yamlParsers } from "prettier/plugins/yaml";
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
  "tdp-max:check",
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
const scheduledSuites = JSON.parse(
  await text("tooling/ci/scheduled-suites.json"),
).suites;
const qualityRunnerCount = (quality.match(/^\s{4}runs-on:/gmu) ?? []).length;
if (qualityRunnerCount !== 2) {
  fail(
    `Quality Gate requires one core job and one fail-closed aggregator; found ${qualityRunnerCount}`,
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
  const scheduled = scheduledSuites.find(
    (suite) => suite.workflow === contract.file,
  );
  if (scheduled) {
    requireIncludes(source, `.github/workflows/${contract.file}`, [
      "workflow_call:",
      "workflow_dispatch:",
      "permissions:",
      "contents: read",
    ]);
    for (const marker of contract.markers.filter((marker) =>
      marker.includes("/"),
    )) {
      if (!scheduled.paths.includes(marker))
        fail(`${contract.file} lost trigger coverage: ${marker}`);
    }
  } else {
    requireIncludes(source, `.github/workflows/${contract.file}`, [
      ...contract.markers,
      "branches:",
      "main",
      "permissions:",
      "contents: read",
    ]);
  }
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
  'node tooling/ci/release-candidate.mjs "$EXPECTED_SHA"',
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
    'node tooling/ci/release-candidate.mjs "$EXPECTED_SHA"',
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
    "git/ref/tags/rc/",
    "...main",
    "latest_accepted_sha",
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
    'node tooling/ci/release-candidate.mjs "$EXPECTED_SHA"',
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
    'url.hostname !== "api.render.com"',
    "url.pathname.match(/^\\/deploy\\/(srv-[A-Za-z0-9]+)$/)",
    "pnpm --silent payments:render:smoke",
    "staging-deployment-evidence.json",
  ],
);
await validateStagingExecutableContract(stagingPromotion);
if (/^\s{2}(pull_request|push):/m.test(stagingPromotion)) {
  fail("staging Render promotion must remain explicit workflow_dispatch only");
}

// Required Quality validates merge groups. Full fan-out belongs exclusively to
// the explicit, frozen release candidate acceptance workflow.
if (
  workflowSources.has("merge-queue-full-regression.yml") ||
  workflowSources.has("control-center-final-qualification.yml")
) {
  fail(
    "duplicate full-regression dispatchers must remain consolidated into acceptance",
  );
}

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

{
  const file = "staging-oci-promotion.yml";
  const source = workflowSources.get(file);
  if (!source) fail(`${file} is missing`);
  requireIncludes(source, `.github/workflows/${file}`, [
    "workflow_dispatch:",
    "expected_sha:",
    "image_digest:",
    "image_run_id:",
    "confirm_deploy:",
    "MORRO_RELEASE_IMAGE_RUN_ID",
    "live_image_run_id",
    "imgURL=",
    "payments:render:smoke",
  ]);
  if (/^\s{2}(pull_request|push):/m.test(source)) {
    fail(`${file} must remain explicitly operator-triggered`);
  }
}

{
  const file = "production-oci-promotion.yml";
  const source = workflowSources.get(file);
  if (!source) fail(`${file} is missing`);
  requireIncludes(source, `.github/workflows/${file}`, [
    "workflow_dispatch:",
    "issue_comment:",
    "expected_sha:",
    "image_digest:",
    "confirm_deploy:",
    "actions: write",
    "/run-production-cutover ",
    "release-candidate-certification.yml",
    "quality.yml",
    "production-mysql-render-provision.yml",
    "production-mysql-canonical-bootstrap.yml",
    "production-mysql-backup-restore-proof.yml",
    "confirm_dr=BACKUP_RESTORE",
    "oci-release-promotion-gate.yml",
    "Reconfirm exact main and fresh DR immediately before mutation",
    "age_seconds",
    "production-canonical-db-cutover.mjs cutover",
    "production-canonical-db-cutover.mjs rollback",
    "payments:render:smoke",
  ]);
  if (source.includes("/run-production-oci-promotion")) {
    fail(
      `${file} must expose only the canonical /run-production-cutover command`,
    );
  }
  if (/^\s{2}(pull_request|push):/m.test(source)) {
    fail(`${file} must remain explicitly operator-triggered`);
  }
}

for (const [file, command] of [
  ["production-mysql-render-provision.yml", "/run-production-mysql-provision "],
  [
    "production-mysql-canonical-bootstrap.yml",
    "/run-production-mysql-bootstrap ",
  ],
]) {
  const source = workflowSources.get(file);
  if (!source) fail(`${file} is missing`);
  requireIncludes(source, `.github/workflows/${file}`, [
    "workflow_dispatch:",
    "issue_comment:",
    command,
    "github.actor == github.repository_owner",
  ]);
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
  "Quality topology valid: consolidated core, impact-selected suites and fail-closed quality aggregator.",
);
console.log(
  `Temporary/one-shot cleanup candidates: ${temporaryCandidates.length}.`,
);
for (const name of temporaryCandidates) console.log(`  - ${name}`);

// Parse executable YAML nodes: comments, duplicate keys, aliases and tags cannot
// supply release authority. Both supported topologies remain fail-closed.
function releaseYaml(source) {
  const ast = yamlParsers.yaml.parse(source);
  const decode = (node) => {
    if (!node) return null;
    if (node.anchor || node.tag)
      fail("release YAML aliases/tags are forbidden");
    if ("value" in node) return node.value;
    if (["mapping", "flowMapping"].includes(node.type)) {
      const value = Object.create(null);
      for (const item of node.children) {
        const key = decode(item.children[0]);
        if (typeof key !== "string" || Object.hasOwn(value, key))
          fail("release YAML duplicate/invalid key");
        value[key] = decode(item.children[1]);
      }
      return value;
    }
    if (["sequence", "flowSequence"].includes(node.type))
      return node.children.map(decode);
    if (node.type === "document")
      return decode(
        node.children.find((child) => child.type === "documentBody"),
      );
    if (node.type === "root" && node.children.length !== 1)
      fail("release YAML requires one document");
    if (!node.children || node.children.length > 1)
      fail("unsupported release YAML node: " + node.type);
    return decode(node.children[0]);
  };
  return decode(ast);
}

async function validateStagingExecutableContract(source) {
  const workflow = releaseYaml(source);
  const check = (condition, code) => {
    if (!condition) fail("staging executable contract: " + code);
  };
  const inputs = workflow.on?.workflow_dispatch?.inputs;
  check(inputs?.expected_sha?.required === "true", "EXPECTED_SHA_REQUIRED");
  const enabled = (item) =>
    item &&
    !Object.hasOwn(item, "if") &&
    (!Object.hasOwn(item, "continue-on-error") ||
      item["continue-on-error"] === "false");
  const command = (job, run) => {
    const matches = job.steps.filter((step) => step.run?.trim() === run);
    check(
      matches.length === 1 && enabled(matches[0]),
      "COMMAND_REQUIRED:" + run,
    );
    return matches[0];
  };
  const expected = "${{ inputs.expected_sha }}";
  const cli = "node tooling/ci/staging-node-exception.mjs ";
  const lock = "render-staging-srv-da4hb6c9v7es7386ttt0";
  const exactCheckout = (job) =>
    check(
      job.steps.some(
        (step) =>
          enabled(step) &&
          step.uses?.startsWith("actions/checkout@") &&
          step.with?.ref === expected,
      ),
      "EXACT_CHECKOUT_REQUIRED",
    );
  const smokeScript = [
    "set -euo pipefail",
    'output="$(pnpm --silent payments:render:smoke)"',
    "printf '%s\\n' \"$output\" > staging-node-smoke.json",
    'node --input-type=module -e \'import fs from "node:fs"; import assert from "node:assert/strict"; const output = JSON.parse(fs.readFileSync("staging-node-smoke.json", "utf8")); assert.equal(output.status, "pass"); assert.equal(output.releaseSha, process.env.EXPECTED_SHA);\'',
  ].join("\n");
  if (!Object.hasOwn(inputs, "operation")) {
    // Compatibility is limited to the existing executable legacy topology.
    check(
      Object.keys(workflow.jobs).sort().join() === "deploy,preflight",
      "LEGACY_TOPOLOGY",
    );
    const job = workflow.jobs.deploy;
    exactCheckout(job);
    const trigger = job.steps.find((step) => step.id === "render-deploy");
    const smoke = job.steps.find((step) => step.id === "live-staging");
    check(
      enabled(trigger) && trigger.env?.EXPECTED_SHA === expected,
      "LEGACY_SHA_BINDING",
    );
    check(
      trigger.run?.includes(
        'deploy_url="${RENDER_STAGING_DEPLOY_HOOK_URL}${separator}ref=${EXPECTED_SHA}"',
      ) && trigger.run.includes('"$deploy_url")"'),
      "LEGACY_EXACT_HOOK",
    );
    check(
      enabled(smoke) &&
        smoke.env?.EXPECTED_SHA === expected &&
        smoke.run?.includes("pnpm --silent payments:render:smoke") &&
        smoke.run.includes('[ "$release_sha" = "$EXPECTED_SHA" ]'),
      "LEGACY_SMOKE",
    );
    check(
      job.steps.indexOf(smoke) > job.steps.indexOf(trigger),
      "LEGACY_SMOKE_ORDER",
    );
    return;
  }
  check(
    inputs.operation.default === "dispatch" &&
      JSON.stringify(inputs.operation.options) === '["dispatch","verify-only"]',
    "OPERATION_CONTRACT",
  );
  check(
    Object.keys(workflow.jobs).sort().join() ===
      "deploy,intent,preflight,verify",
    "NODE_TOPOLOGY",
  );
  check(!workflow.concurrency, "PARENT_SERVICE_LOCK_FORBIDDEN");
  for (const name of ["deploy", "verify"]) {
    const job = workflow.jobs[name];
    check(
      job.concurrency?.group === lock &&
        job.concurrency?.["cancel-in-progress"] === "false",
      "SERVICE_LOCK",
    );
    check(!job["continue-on-error"], "JOB_MUST_FAIL_CLOSED");
    exactCheckout(job);
    const barrier = command(job, cli + "node-verification-barrier");
    const verify = command(job, cli + "node-verify");
    for (const step of [barrier, verify])
      check(step.env?.EXPECTED_SHA === expected, "VERIFIER_SHA_BINDING");
    const barrierUpload = job.steps.find(
      (step) => step.with?.path === "staging-node-verification-barrier.json",
    );
    check(
      enabled(barrierUpload) &&
        barrierUpload.uses?.startsWith("actions/upload-artifact@") &&
        barrierUpload.with["if-no-files-found"] === "error",
      "BARRIER_UPLOAD",
    );
    check(
      job.steps.indexOf(barrier) < job.steps.indexOf(barrierUpload) &&
        job.steps.indexOf(barrierUpload) < job.steps.indexOf(verify),
      "BARRIER_BEFORE_OBSERVATION",
    );
    const smoke = command(job, smokeScript);
    check(
      smoke.env?.EXPECTED_SHA === expected &&
        smoke.env?.MORRO_V2_BASE_URL === "${{ env.STAGING_URL }}" &&
        smoke.env?.EXPECTED_IMAGE_RUN_ID === "",
      "SMOKE_IDENTITY_BINDING",
    );
    check(
      job.steps.some(
        (step) =>
          enabled(step) &&
          step.uses?.startsWith("pnpm/action-setup@") &&
          step.with?.version === "${{ env.PNPM_VERSION }}" &&
          job.steps.indexOf(step) < job.steps.indexOf(barrier),
      ),
      "PNPM_BEFORE_BARRIER",
    );
    check(
      job.steps.indexOf(smoke) > job.steps.indexOf(verify),
      "SMOKE_AFTER_VERIFICATION",
    );
    const evidence = job.steps.filter(
      (step) => step.with?.path === "staging-deployment-evidence.json",
    );
    check(
      evidence.length === 1 &&
        enabled(evidence[0]) &&
        evidence[0].uses?.startsWith("actions/upload-artifact@") &&
        evidence[0].with["if-no-files-found"] === "error" &&
        job.steps.indexOf(evidence[0]) > job.steps.indexOf(smoke),
      "ACCEPTANCE_AFTER_SMOKE",
    );
    if (name === "deploy") {
      check(
        job.if ===
          "inputs.operation == 'dispatch' && inputs.confirm_staging == 'DEPLOY' && github.ref == format('refs/tags/rc/{0}', inputs.expected_sha)",
        "DISPATCH_CONDITION",
      );
      const dispatch = command(job, cli + "node-dispatch");
      check(
        dispatch.env?.EXPECTED_SHA === expected &&
          dispatch.env?.RENDER_STAGING_DEPLOY_HOOK_URL ===
            "${{ secrets.RENDER_STAGING_DEPLOY_HOOK_URL }}" &&
          job.steps.indexOf(dispatch) < job.steps.indexOf(barrier),
        "DISPATCH_BINDING",
      );
    } else {
      check(
        job.if === "always() && inputs.operation == 'verify-only'",
        "VERIFY_ONLY_CONDITION",
      );
      check(
        !job.environment &&
          !JSON.stringify(job).includes("secrets.") &&
          !job.steps.some((step) =>
            /node-dispatch|\bPOST\b/.test(step.run ?? ""),
          ),
        "VERIFY_ONLY_NO_MUTATION",
      );
    }
  }
  const oci = releaseYaml(workflowSources.get("staging-oci-promotion.yml"));
  check(
    Object.values(oci.jobs).some(
      (job) =>
        job.concurrency?.group === lock &&
        job.concurrency["cancel-in-progress"] === "false",
    ),
    "SHARED_OCI_LOCK",
  );
  const parent = releaseYaml(
    workflowSources.get("final-release-acceptance.yml"),
  );
  check(
    parent.concurrency?.group !== lock &&
      !Object.values(parent.jobs).some(
        (job) => job.concurrency?.group === lock,
      ),
    "NO_PARENT_DEADLOCK",
  );
  // This narrow exception uses the already reviewed adapter closure. Bind the
  // executable YAML invocation to those exact source bytes, including the CLI
  // route, reservation-before-POST, canonicalNodeHook and redirect:error. A code
  // change requires explicit review and updated integrity evidence, not a marker.
  // Governed updates: change this list only with the corresponding module diff,
  // fresh binding/mutation tests, exact-head certification and independent review.
  // Hash agreement alone never waives the executable workflow checks above.
  const reviewedModules = {
    "tooling/ci/staging-node-contracts.mjs":
      "ace1aac0128fb54af32a2b932553a32b9e56894cbe27f2940f82cb4e9155bddb",
    "tooling/ci/staging-node-receipts.mjs":
      "5cf81fe7d7bbff3d40e2d932096a70dcbc5018fbebebdf4d483a8a148697a33c",
    "tooling/ci/staging-node-barrier.mjs":
      "de82e8c25617d9714deb1dde2ba62555f750b811f3fa9b64d45b334ee604ddf2",
    "tooling/ci/staging-node-acceptance.mjs":
      "71fe522b5faecf43beb83b8d4dddf93ac188b5ef06c909c0fb532f8ff3ef1cf2",
    "tooling/ci/staging-node-runtime.mjs":
      "ffb310c38e32c72bf4909d7251f212b1c4f4d2c8887493c4475880f9b9b5730d",
    "tooling/ci/staging-node-exception.mjs":
      "eb0d72ba473a6626ef63ce9c9127ca1d71c76d5470ff0e2781dbcf2a12568d74",
    "tooling/ci/staging-node-dispatch.mjs":
      "17e3e731230dd0b57e20a0a163bb33bb0028836b04ced5d451c2388931807a71",
  };
  for (const [path, expectedDigest] of Object.entries(reviewedModules)) {
    const bytes = await readFile(resolve(root, path));
    check(
      createHash("sha256").update(bytes).digest("hex") === expectedDigest,
      "REVIEWED_ADAPTER_INTEGRITY:" + path,
    );
  }
}
