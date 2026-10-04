import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import vm from "node:vm";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPOSITORY = "luizanunciostoca/touristic-digital-platform";
export const WORKFLOW_PATH =
  ".github/workflows/failure-learning-independent-proof.yml";
export const WORKFLOW_NAME = "Failure Learning Independent Proof";
export const JOB_NAME = "trusted-failure-learning-proof";
export const ASSERTION = "GUARD_PREVENTION_PROVEN";
export const ACTIVATION_PATH =
  ".github/morro-control/failures/guard-activations.json";
export const ANTI_RECURRENCE_PATH =
  ".github/morro-control/tdp-max/anti-recurrence.json";
const TRUSTED_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SHA = /^[0-9a-f]{40}$/u;
const RUN_ID = /^[1-9][0-9]*$/u;
const RUN_ATTEMPT = /^[1-9][0-9]*$/u;
const PROOF_FIELDS = [
  "guardId",
  "candidateSha",
  "candidateBinding",
  "regressionTest",
  "independentProof",
  "independentProofCandidateSha",
  "freshness",
  "freshnessSeconds",
  "observedAt",
  "expiresAt",
  "validatorRevision",
  "activatedAt",
  "repository",
  "runId",
  "runAttempt",
  "workflow",
  "job",
  "assertion",
];
const MUTATION_FIELDS = [...PROOF_FIELDS];
const SANDBOX_TIMEOUT_MS = 5000;
const SANDBOX_MAX_BUFFER = 1024 * 1024;
const CANDIDATE_SOURCE_MAX_BYTES = 128 * 1024;
const SENSITIVE_ENV_NAME =
  /(?:TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|AUTH|API[_-]?KEY|PRIVATE[_-]?KEY|GITHUB_|AWS_|GOOGLE_|AZURE_|RENDER_|DATABASE|MYSQL|MERCADO|STRIPE|META|FACEBOOK)/iu;

function gitChecked(root, ...args) {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    env: { PATH: process.env.PATH ?? "" },
  });
  assert.equal(result.error, undefined, "GIT_COMMAND_FAILED");
  assert.equal(result.status, 0, "GIT_COMMAND_FAILED");
  return result.stdout.trim();
}

function isAncestor(root, base, head) {
  const result = spawnSync(
    "git",
    ["-C", root, "merge-base", "--is-ancestor", base, head],
    { stdio: "ignore", env: { PATH: process.env.PATH ?? "" } },
  );
  return result.status === 0;
}

function digest(value) {
  return "sha256:" + createHash("sha256").update(value).digest("hex");
}

function readJson(root, path) {
  return JSON.parse(readFileSync(resolve(root, path), "utf8"));
}

function requireRegularFile(root, path, code) {
  const canonicalRoot = realpathSync(resolve(root));
  const target = resolve(canonicalRoot, path);
  assert.ok(lstatSync(target).isFile(), code + "_REGULAR_FILE_REQUIRED");
  assert.equal(realpathSync(target), target, code + "_PATH_ESCAPE");
  return target;
}

function canonicalTimestamp(value, code) {
  const timestamp = Date.parse(value ?? "");
  assert.ok(Number.isFinite(timestamp), code);
  assert.equal(new Date(timestamp).toISOString(), value, code + "_CANONICAL");
  return timestamp;
}

function errorCode(error) {
  const message =
    error && typeof error === "object" && typeof error.message === "string"
      ? error.message
      : "";
  return (
    message.match(/[A-Z][A-Z0-9_:.-]{2,160}/u)?.[0] ??
    "UNEXPECTED_FAILURE_LEARNING_PROOF_ERROR"
  );
}

export function trustedContext(env = process.env) {
  assert.equal(env.GITHUB_ACTIONS, "true", "TRUSTED_CONTEXT_ACTIONS_REQUIRED");
  assert.equal(
    env.GITHUB_EVENT_NAME,
    "workflow_run",
    "TRUSTED_CONTEXT_EVENT_INVALID",
  );
  assert.equal(
    env.GITHUB_REPOSITORY,
    REPOSITORY,
    "TRUSTED_CONTEXT_REPOSITORY_INVALID",
  );
  assert.equal(
    env.EXPECTED_REPOSITORY,
    env.GITHUB_REPOSITORY,
    "TRUSTED_CONTEXT_EXPECTED_REPOSITORY_MISMATCH",
  );
  assert.equal(
    env.EXPECTED_HEAD_REPOSITORY,
    REPOSITORY,
    "TRUSTED_CONTEXT_HEAD_REPOSITORY_INVALID",
  );
  assert.equal(
    env.EXPECTED_BASE_REPOSITORY,
    REPOSITORY,
    "TRUSTED_CONTEXT_BASE_REPOSITORY_INVALID",
  );
  assert.equal(
    env.GITHUB_WORKFLOW,
    WORKFLOW_NAME,
    "TRUSTED_CONTEXT_WORKFLOW_INVALID",
  );
  assert.equal(
    env.EXPECTED_WORKFLOW,
    env.GITHUB_WORKFLOW,
    "TRUSTED_CONTEXT_EXPECTED_WORKFLOW_MISMATCH",
  );
  assert.equal(env.GITHUB_JOB, JOB_NAME, "TRUSTED_CONTEXT_JOB_INVALID");
  assert.equal(
    env.EXPECTED_JOB,
    env.GITHUB_JOB,
    "TRUSTED_CONTEXT_EXPECTED_JOB_MISMATCH",
  );
  assert.match(
    env.GITHUB_RUN_ID ?? "",
    RUN_ID,
    "TRUSTED_CONTEXT_RUN_ID_INVALID",
  );
  assert.equal(
    env.EXPECTED_RUN_ID,
    env.GITHUB_RUN_ID,
    "TRUSTED_CONTEXT_EXPECTED_RUN_ID_MISMATCH",
  );
  assert.match(
    env.GITHUB_RUN_ATTEMPT ?? "",
    RUN_ATTEMPT,
    "TRUSTED_CONTEXT_RUN_ATTEMPT_INVALID",
  );
  assert.equal(
    env.EXPECTED_RUN_ATTEMPT,
    env.GITHUB_RUN_ATTEMPT,
    "TRUSTED_CONTEXT_EXPECTED_RUN_ATTEMPT_MISMATCH",
  );
  assert.equal(
    env.EXPECTED_BASE_BRANCH,
    "main",
    "TRUSTED_CONTEXT_BASE_BRANCH_INVALID",
  );
  assert.match(
    env.EXPECTED_BRANCH ?? "",
    /^[A-Za-z0-9._/-]+$/u,
    "TRUSTED_CONTEXT_BRANCH_INVALID",
  );
  assert.equal(
    env.GITHUB_REF,
    "refs/heads/main",
    "TRUSTED_CONTEXT_REF_INVALID",
  );
  const workflowRef =
    REPOSITORY +
    "/" +
    WORKFLOW_PATH +
    "@refs/heads/" +
    env.EXPECTED_BASE_BRANCH;
  assert.equal(
    env.GITHUB_WORKFLOW_REF,
    workflowRef,
    "TRUSTED_CONTEXT_WORKFLOW_REF_INVALID",
  );
  assert.equal(
    env.EXPECTED_WORKFLOW_REF,
    env.GITHUB_WORKFLOW_REF,
    "TRUSTED_CONTEXT_EXPECTED_WORKFLOW_REF_MISMATCH",
  );
  assert.match(
    env.EXPECTED_CANDIDATE_SHA ?? "",
    SHA,
    "TRUSTED_CONTEXT_CANDIDATE_INVALID",
  );
  assert.equal(
    env.EXPECTED_CANDIDATE_SHA,
    env.EVENT_CANDIDATE_SHA,
    "TRUSTED_CONTEXT_EVENT_CANDIDATE_MISMATCH",
  );
  assert.match(
    env.EXPECTED_BASE_SHA ?? "",
    SHA,
    "TRUSTED_CONTEXT_BASE_INVALID",
  );
  assert.equal(
    env.EXPECTED_BASE_SHA,
    env.EVENT_BASE_SHA,
    "TRUSTED_CONTEXT_EVENT_BASE_MISMATCH",
  );
  assert.match(
    env.TRUSTED_VALIDATOR_SHA ?? "",
    SHA,
    "TRUSTED_CONTEXT_VALIDATOR_SHA_INVALID",
  );
  assert.equal(
    env.GITHUB_SHA,
    env.TRUSTED_VALIDATOR_SHA,
    "TRUSTED_CONTEXT_GITHUB_SHA_MISMATCH",
  );
  assert.match(
    env.TRUSTED_VALIDATOR_TREE_SHA ?? "",
    SHA,
    "TRUSTED_CONTEXT_VALIDATOR_TREE_INVALID",
  );
  assert.equal(
    env.TRUSTED_VALIDATOR_SHA,
    env.EXPECTED_BASE_SHA,
    "TRUSTED_CONTEXT_VALIDATOR_BASE_MISMATCH",
  );
  assert.equal(
    env.EXPECTED_BRANCH,
    env.EVENT_BRANCH,
    "TRUSTED_CONTEXT_EVENT_BRANCH_MISMATCH",
  );
  assert.match(
    env.MANIFEST_PATH ?? "",
    /^\.morro\/changesets\/MD-[A-Z0-9-]+\.json$/u,
    "TRUSTED_CONTEXT_MANIFEST_INVALID",
  );
  return Object.freeze({
    repository: REPOSITORY,
    candidateSha: env.EXPECTED_CANDIDATE_SHA,
    baseSha: env.EXPECTED_BASE_SHA,
    branch: env.EXPECTED_BRANCH,
    baseBranch: env.EXPECTED_BASE_BRANCH,
    manifestPath: env.MANIFEST_PATH,
    validatorSha: env.TRUSTED_VALIDATOR_SHA,
    validatorTreeSha: env.TRUSTED_VALIDATOR_TREE_SHA,
    runId: env.GITHUB_RUN_ID,
    runAttempt: Number(env.GITHUB_RUN_ATTEMPT),
    workflow: WORKFLOW_PATH,
    job: JOB_NAME,
    assertion: ASSERTION,
  });
}

export function currentValidatorRevision() {
  return digest(readFileSync(fileURLToPath(import.meta.url)));
}

export function canonicalFreshnessSeconds(root = TRUSTED_ROOT) {
  const source = readFileSync(
    resolve(root, "tooling/tdp-max/tdp-max-v2.mjs"),
    "utf8",
  );
  const limits = [
    ...source.matchAll(/\bnow\s*-\s*generatedAt\s*<=\s*(\d+)\s*;/gu),
  ];
  assert.equal(limits.length, 1, "CANONICAL_FRESHNESS_SOURCE_AMBIGUOUS");
  const milliseconds = Number(limits[0][1]);
  assert.ok(
    Number.isSafeInteger(milliseconds) &&
      milliseconds > 0 &&
      milliseconds % 1000 === 0,
    "CANONICAL_FRESHNESS_SOURCE_INVALID",
  );
  return milliseconds / 1000;
}

export function assertFreshnessWindow(
  proof,
  freshnessSeconds,
  nowMs = Date.now(),
) {
  assert.equal(
    proof.freshnessSeconds,
    freshnessSeconds,
    "GUARD_FRESHNESS_SECONDS_INVALID",
  );
  const observedAt = canonicalTimestamp(
    proof.observedAt,
    "GUARD_OBSERVED_AT_INVALID",
  );
  const expiresAt = canonicalTimestamp(
    proof.expiresAt,
    "GUARD_EXPIRES_AT_INVALID",
  );
  const activatedAt = canonicalTimestamp(
    proof.activatedAt,
    "GUARD_ACTIVATED_AT_INVALID",
  );
  assert.equal(
    expiresAt,
    observedAt + freshnessSeconds * 1000,
    "GUARD_EXPIRY_ARITHMETIC_INVALID",
  );
  assert.ok(observedAt <= nowMs, "GUARD_OBSERVATION_IN_FUTURE");
  assert.ok(nowMs <= expiresAt, "GUARD_PROOF_EXPIRED");
  assert.ok(
    activatedAt >= observedAt && activatedAt <= nowMs,
    "GUARD_ACTIVATION_OUTSIDE_FRESHNESS_WINDOW",
  );
}

export function validateCandidateContract(root, context) {
  const candidateRoot = realpathSync(resolve(root));
  assert.equal(
    gitChecked(candidateRoot, "rev-parse", "HEAD"),
    context.candidateSha,
    "CANDIDATE_HEAD_MISMATCH",
  );
  assert.equal(
    gitChecked(candidateRoot, "status", "--porcelain", "--untracked-files=all"),
    "",
    "CANDIDATE_WORKTREE_DIRTY",
  );
  assert.ok(
    isAncestor(candidateRoot, context.baseSha, context.candidateSha),
    "CANDIDATE_BASE_NOT_ANCESTOR",
  );
  requireRegularFile(candidateRoot, context.manifestPath, "CANDIDATE_MANIFEST");
  const manifest = readJson(candidateRoot, context.manifestPath);
  assert.match(
    manifest.id ?? "",
    /^MD-TDP-LEARNING-001(?:-R[1-9][0-9]*)?$/u,
    "LEARNING_CHANGESET_REQUIRED",
  );
  assert.equal(
    context.manifestPath,
    ".morro/changesets/" + manifest.id + ".json",
    "LEARNING_CHANGESET_PATH_MISMATCH",
  );
  assert.equal(
    manifest.baseSha,
    context.baseSha,
    "LEARNING_CHANGESET_BASE_MISMATCH",
  );
  assert.equal(
    manifest.branch,
    context.branch,
    "LEARNING_CHANGESET_BRANCH_MISMATCH",
  );
  assert.ok(
    manifest.owns?.paths?.includes("tooling/failure-learning/**"),
    "LEARNING_ENGINE_OWNERSHIP_REQUIRED",
  );
  assert.ok(
    manifest.owns?.paths?.includes(".github/morro-control/failures/**"),
    "LEARNING_ACTIVATION_OWNERSHIP_REQUIRED",
  );
  for (const required of [
    "source-authentication",
    "guard-specific-semantic-proof",
    "canonical-activation",
    "automated-independent-proof",
    "exact-head-identity",
  ]) {
    assert.ok(
      manifest.requiredEvidence?.includes(required) ||
        manifest.proof?.requiredRemoteEvidence?.includes(required),
      "LEARNING_REMOTE_EVIDENCE_REQUIRED:" + required,
    );
  }
  for (const path of [
    "tooling/failure-learning/engine.mjs",
    "tooling/failure-learning/detectors.mjs",
    "tooling/failure-learning/engine.test.mjs",
    "tooling/failure-learning/activation-authority.mjs",
    ACTIVATION_PATH,
  ]) {
    requireRegularFile(candidateRoot, path, "LEARNING_CANDIDATE");
  }
  const activation = readJson(candidateRoot, ACTIVATION_PATH);
  assert.equal(
    activation.schemaVersion,
    1,
    "ACTIVATION_REGISTRY_SCHEMA_INVALID",
  );
  assert.equal(
    activation.authority,
    "ORCHESTRATOR",
    "ACTIVATION_REGISTRY_AUTHORITY_INVALID",
  );
  assert.ok(
    Array.isArray(activation.activations),
    "ACTIVATION_REGISTRY_ITEMS_INVALID",
  );
  assert.equal(
    activation.activations.length,
    0,
    "CANDIDATE_SELF_ACTIVATION_FORBIDDEN",
  );
  const trustedRegistry = readJson(TRUSTED_ROOT, ANTI_RECURRENCE_PATH);
  assert.equal(
    trustedRegistry.schemaVersion,
    1,
    "ANTI_RECURRENCE_SCHEMA_INVALID",
  );
  assert.ok(
    Array.isArray(trustedRegistry.failures) &&
      trustedRegistry.failures.some(
        (item) =>
          item.id === "AR-001" &&
          item.class === "STALE_HEAD" &&
          item.severity === "critical",
      ),
    "TRUSTED_AR_001_REQUIRED",
  );
  return { candidateRoot, manifest, trustedRegistry };
}

export function buildGuardProof(
  context,
  validatorRevision,
  freshnessSeconds = canonicalFreshnessSeconds(),
  nowMs = Date.now(),
) {
  assert.match(
    validatorRevision,
    /^sha256:[0-9a-f]{64}$/u,
    "VALIDATOR_REVISION_INVALID",
  );
  const observedAt = new Date(nowMs).toISOString();
  const proof = Object.freeze({
    guardId: "AR-001",
    candidateSha: context.candidateSha,
    regressionTest:
      "https://github.com/" +
      REPOSITORY +
      "/blob/" +
      context.candidateSha +
      "/tooling/failure-learning/engine.test.mjs",
    independentProof:
      "https://github.com/" + REPOSITORY + "/actions/runs/" + context.runId,
    independentProofCandidateSha: context.candidateSha,
    candidateBinding: context.candidateSha,
    freshness: "FRESH",
    freshnessSeconds,
    observedAt,
    expiresAt: new Date(nowMs + freshnessSeconds * 1000).toISOString(),
    validatorRevision,
    activatedAt: observedAt,
    repository: REPOSITORY,
    runId: context.runId,
    runAttempt: context.runAttempt,
    workflow: context.workflow,
    job: context.job,
    assertion: context.assertion,
  });
  assert.deepEqual(
    Object.keys(proof).sort(),
    [...PROOF_FIELDS].sort(),
    "GUARD_PROOF_FIELDS_INVALID",
  );
  assertFreshnessWindow(proof, freshnessSeconds, nowMs);
  return proof;
}

export function buildActivationRecord(proof) {
  return Object.freeze({
    guardId: proof.guardId,
    state: "ACTIVE_GUARD",
    candidateSha: proof.candidateSha,
    candidateBinding: proof.candidateBinding,
    regressionTest: proof.regressionTest,
    independentProof: proof.independentProof,
    independentProofCandidateSha: proof.independentProofCandidateSha,
    freshness: proof.freshness,
    freshnessSeconds: proof.freshnessSeconds,
    observedAt: proof.observedAt,
    expiresAt: proof.expiresAt,
    validatorRevision: proof.validatorRevision,
    activatedAt: proof.activatedAt,
    repository: proof.repository,
    runId: proof.runId,
    runAttempt: proof.runAttempt,
    workflow: proof.workflow,
    job: proof.job,
    assertion: proof.assertion,
  });
}

function candidateSources(candidateRoot) {
  const enginePath = requireRegularFile(
    candidateRoot,
    "tooling/failure-learning/engine.mjs",
    "LEARNING_CANDIDATE",
  );
  const detectorsPath = requireRegularFile(
    candidateRoot,
    "tooling/failure-learning/detectors.mjs",
    "LEARNING_CANDIDATE",
  );
  for (const path of [enginePath, detectorsPath]) {
    assert.ok(
      lstatSync(path).size <= CANDIDATE_SOURCE_MAX_BYTES,
      "LEARNING_CANDIDATE_SOURCE_TOO_LARGE",
    );
  }
  return {
    engine: readFileSync(enginePath, "utf8"),
    detectors: readFileSync(detectorsPath, "utf8"),
  };
}

function runSandbox(payload) {
  const scriptPath = fileURLToPath(import.meta.url);
  const input = JSON.stringify(payload) + "\n";
  assert.ok(
    Buffer.byteLength(input) <= SANDBOX_MAX_BUFFER,
    "SANDBOX_INPUT_TOO_LARGE",
  );
  const result = spawnSync(
    process.execPath,
    [
      "--no-warnings",
      "--experimental-vm-modules",
      scriptPath,
      "--sandbox-child",
    ],
    {
      input,
      encoding: "utf8",
      timeout: SANDBOX_TIMEOUT_MS,
      maxBuffer: SANDBOX_MAX_BUFFER,
      env: {},
    },
  );
  assert.equal(result.error, undefined, "SANDBOX_CHILD_EXECUTION_FAILED");
  assert.equal(
    result.status,
    0,
    result.stderr.trim() || "SANDBOX_CHILD_REJECTED_CANDIDATE",
  );
  assert.equal(result.signal, null, "SANDBOX_CHILD_INTERRUPTED");
  assert.equal(result.stderr, "", "SANDBOX_CHILD_STDERR_NOT_EMPTY");
  assert.match(result.stdout, /^\{[^\r\n]*\}\n$/u, "SANDBOX_OUTPUT_INVALID");
  const output = JSON.parse(result.stdout);
  assert.equal(
    JSON.stringify(output) + "\n",
    result.stdout,
    "SANDBOX_OUTPUT_NOT_CANONICAL_JSON",
  );
  return output;
}

export async function runTrustedSemanticProbe(
  candidateRoot,
  context,
  validatorRevision,
  trustedRegistry = readJson(TRUSTED_ROOT, ANTI_RECURRENCE_PATH),
) {
  const freshnessSeconds = canonicalFreshnessSeconds();
  const proof = buildGuardProof(context, validatorRevision, freshnessSeconds);
  const sources = candidateSources(candidateRoot);
  const emptyActivation = {
    schemaVersion: 1,
    authority: "ORCHESTRATOR",
    activations: [],
  };
  const emptyResult = runSandbox({
    mode: "empty-registry",
    ...sources,
    context,
    proof,
    activationRegistry: emptyActivation,
    trustedRegistry,
  });
  assert.deepEqual(
    emptyResult,
    {
      protocol: 1,
      firstOccurrence: "OBSERVED",
      guardMetadataAbsent: true,
      emptyRegistryPromotionRejected: true,
      exactHead: "PASS",
      staleHead: "BLOCK",
    },
    "CANDIDATE_EMPTY_REGISTRY_SEMANTICS_INVALID",
  );

  const activation = buildActivationRecord(proof);
  const populatedResult = runSandbox({
    mode: "populated-registry",
    ...sources,
    context,
    proof,
    activationRegistry: {
      schemaVersion: 1,
      authority: "ORCHESTRATOR",
      activations: [activation],
    },
    trustedRegistry,
  });
  assert.deepEqual(
    populatedResult,
    {
      protocol: 1,
      promotion: "ACTIVE_GUARD",
      rejectedMutations: MUTATION_FIELDS,
      persistedActivationMutationRejected: true,
    },
    "CANDIDATE_ACTIVATION_SEMANTICS_INVALID",
  );
  return {
    proof,
    activation,
    semanticChecks: {
      exactHead: emptyResult.exactHead,
      staleHead: emptyResult.staleHead,
      rejectedMutations: populatedResult.rejectedMutations,
      persistedActivationMutationRejected:
        populatedResult.persistedActivationMutationRejected,
    },
  };
}

export async function buildTrustedFailureLearningProof(
  candidateRoot,
  manifestPath,
  env = process.env,
) {
  const context = trustedContext({ ...env, MANIFEST_PATH: manifestPath });
  const contract = validateCandidateContract(candidateRoot, context);
  const validatorRevision = currentValidatorRevision();
  const semantic = await runTrustedSemanticProbe(
    contract.candidateRoot,
    context,
    validatorRevision,
    contract.trustedRegistry,
  );
  return {
    schemaVersion: 1,
    contract: "TDP_FAILURE_LEARNING_INDEPENDENT_PROOF",
    status: "pass",
    authority: "BASE_CONTROLLED_TRUSTED_VALIDATOR",
    repository: context.repository,
    candidateSha: context.candidateSha,
    candidateTreeSha: gitChecked(
      contract.candidateRoot,
      "rev-parse",
      "HEAD^{tree}",
    ),
    baseSha: context.baseSha,
    manifestPath: context.manifestPath,
    changeSetId: contract.manifest.id,
    validatorSha: context.validatorSha,
    validatorTreeSha: context.validatorTreeSha,
    validatorRevision,
    workflow: context.workflow,
    job: context.job,
    runId: context.runId,
    runAttempt: context.runAttempt,
    observedAt: semantic.proof.observedAt,
    freshnessSeconds: semantic.proof.freshnessSeconds,
    expiresAt: semantic.proof.expiresAt,
    assertions: {
      sourceAuthentication: "PASS",
      guardSpecificSemanticProof: "PASS",
      canonicalActivation: "PASS",
    },
    activationState: "PROVEN_NOT_ACTIVATED",
    activationTemplate: {
      ...semantic.activation,
      state: "PENDING_CANONICAL_ACTIVATION",
      activatedAt: null,
    },
  };
}

function parseSandboxInput(text) {
  assert.ok(text.length <= SANDBOX_MAX_BUFFER, "SANDBOX_INPUT_TOO_LARGE");
  assert.match(text, /^\{[^\r\n]*\}\n$/u, "SANDBOX_INPUT_INVALID");
  const payload = JSON.parse(text);
  assert.equal(
    JSON.stringify(payload) + "\n",
    text,
    "SANDBOX_INPUT_NOT_CANONICAL_JSON",
  );
  return payload;
}

async function sandboxChildMain() {
  const sensitiveEnvironmentNames = Object.keys(process.env).filter((name) =>
    SENSITIVE_ENV_NAME.test(name),
  );
  assert.deepEqual(
    sensitiveEnvironmentNames,
    [],
    "SANDBOX_CHILD_SENSITIVE_ENV_PRESENT",
  );
  let input = "";
  let inputBytes = 0;
  for await (const chunk of process.stdin) {
    inputBytes += chunk.length;
    assert.ok(inputBytes <= SANDBOX_MAX_BUFFER, "SANDBOX_INPUT_TOO_LARGE");
    input += chunk;
  }
  const payload = parseSandboxInput(input);
  assert.ok(
    ["empty-registry", "populated-registry"].includes(payload.mode),
    "SANDBOX_MODE_INVALID",
  );
  assert.equal(typeof payload.engine, "string", "SANDBOX_ENGINE_REQUIRED");
  assert.equal(
    typeof payload.detectors,
    "string",
    "SANDBOX_DETECTORS_REQUIRED",
  );
  assert.ok(
    Buffer.byteLength(payload.engine) + Buffer.byteLength(payload.detectors) <
      SANDBOX_MAX_BUFFER / 2,
    "SANDBOX_CANDIDATE_SOURCE_TOO_LARGE",
  );

  let activationRegistryText = JSON.stringify(payload.activationRegistry);
  const trustedRegistryText = JSON.stringify(payload.trustedRegistry);
  const { context, safeModuleExports } = await createSandboxContext({
    getActivationRegistry: () => activationRegistryText,
    trustedRegistryText,
  });
  assert.deepEqual(
    vm.runInContext(
      "[typeof process, typeof console, typeof require, typeof fs, typeof fetch, typeof setTimeout].join(',')",
      context,
    ),
    "undefined,undefined,undefined,undefined,undefined,undefined",
    "SANDBOX_GLOBAL_CAPABILITY_PRESENT",
  );
  const modules = new Map();
  const engineIdentifier =
    "file:///candidate/tooling/failure-learning/engine.mjs";
  const detectorsIdentifier =
    "file:///candidate/tooling/failure-learning/detectors.mjs";
  const engineModule = new vm.SourceTextModule(payload.engine, {
    context,
    identifier: engineIdentifier,
    initializeImportMeta(meta) {
      meta.url = engineIdentifier;
    },
  });
  const detectorsModule = new vm.SourceTextModule(payload.detectors, {
    context,
    identifier: detectorsIdentifier,
    initializeImportMeta(meta) {
      meta.url = detectorsIdentifier;
    },
  });
  modules.set("./detectors.mjs", detectorsModule);
  const linker = (specifier, referencingModule) => {
    if (specifier === "./detectors.mjs") {
      assert.equal(
        referencingModule.identifier,
        engineIdentifier,
        "SANDBOX_RELATIVE_IMPORT_INVALID",
      );
      return detectorsModule;
    }
    if (
      specifier === "node:crypto" ||
      specifier === "node:util" ||
      specifier === "node:fs"
    ) {
      if (!modules.has(specifier)) {
        modules.set(
          specifier,
          new vm.SyntheticModule(
            specifier === "node:crypto"
              ? ["createHash", "default"]
              : specifier === "node:util"
                ? ["isDeepStrictEqual"]
                : ["readFileSync"],
            function initialize() {
              if (specifier === "node:crypto") {
                this.setExport("createHash", safeModuleExports.createHash);
                this.setExport("default", safeModuleExports.crypto);
              } else if (specifier === "node:util") {
                this.setExport(
                  "isDeepStrictEqual",
                  safeModuleExports.isDeepStrictEqual,
                );
              } else {
                this.setExport("readFileSync", safeModuleExports.readFileSync);
              }
            },
            { context, identifier: specifier },
          ),
        );
      }
      return modules.get(specifier);
    }
    throw new Error("SANDBOX_IMPORT_FORBIDDEN");
  };

  await engineModule.link(linker);
  await engineModule.evaluate({ timeout: 1500 });
  const engine = engineModule.namespace;
  assert.deepEqual(
    JSON.parse(
      safeModuleExports.readFileSync(
        new context.URL(
          "../../.github/morro-control/failures/guard-activations.json",
          engineIdentifier,
        ),
        "utf8",
      ),
    ),
    payload.activationRegistry,
    "SANDBOX_ACTIVATION_SHIM_INVALID",
  );
  for (const name of ["recordOccurrence", "evaluateGuards", "promoteGuard"]) {
    assert.equal(
      typeof engine[name],
      "function",
      "SANDBOX_ENGINE_EXPORT_MISSING",
    );
  }

  const occurrence = {
    incidentId: "TRUSTED-PROOF-INCIDENT",
    occurrenceId: "trusted-occurrence-1",
    failureClass: "STALE_HEAD",
    severity: "critical",
    domain: "ci-release",
    environment: "github-actions",
    operation: "merge",
    expected: "current exact head",
    observed: "stale head",
    observedAt: payload.proof.observedAt,
  };
  const first = engine.recordOccurrence(null, occurrence);
  assert.equal(first?.state, "OBSERVED", "FIRST_OCCURRENCE_SELF_ACTIVATED");
  const forbiddenMetadata = [
    "guardId",
    "guardActivationAt",
    "guardRevision",
    "proofReference",
    "candidateBinding",
    "regressionTestReference",
  ];
  assert.ok(
    forbiddenMetadata.every((key) => !Object.hasOwn(first, key)) &&
      first.recurrenceAfterGuard !== true,
    "FIRST_OCCURRENCE_HAS_GUARD_METADATA",
  );

  const runEvaluation = (observedHead) => {
    const results = engine.evaluateGuards({
      operation: "merge",
      domain: "ci-release",
      registry: payload.trustedRegistry.failures,
      observation: {
        expectedHead: payload.context.candidateSha,
        observedHead,
      },
    });
    const ar001 = results?.find(
      (result) => result.id === "AR-001" && result.class === "STALE_HEAD",
    );
    return ar001?.result;
  };
  assert.equal(
    runEvaluation(payload.context.candidateSha),
    "PASS",
    "EXACT_HEAD_GUARD_RESULT_INVALID",
  );
  assert.equal(
    runEvaluation("f".repeat(40)),
    "BLOCK",
    "STALE_HEAD_GUARD_RESULT_INVALID",
  );
  if (payload.mode === "empty-registry") {
    let emptyRegistryPromotionRejected = false;
    try {
      engine.promoteGuard(
        {
          ...occurrence,
          state: "PREVENTION_PROVEN",
          rootCause: "stale evidence identity",
        },
        payload.proof,
      );
    } catch {
      emptyRegistryPromotionRejected = true;
    }
    assert.equal(
      emptyRegistryPromotionRejected,
      true,
      "EMPTY_REGISTRY_PROMOTED_GUARD",
    );
    process.stdout.write(
      JSON.stringify({
        protocol: 1,
        firstOccurrence: first.state,
        guardMetadataAbsent: true,
        emptyRegistryPromotionRejected,
        exactHead: "PASS",
        staleHead: "BLOCK",
      }) + "\n",
    );
    return;
  }

  const proof = payload.proof;
  const incident = {
    ...occurrence,
    state: "PREVENTION_PROVEN",
    rootCause: "stale evidence identity",
  };
  const active = engine.promoteGuard(incident, proof);
  assert.equal(active?.state, "ACTIVE_GUARD", "CANONICAL_PROMOTION_REQUIRED");
  const rejectedMutations = [];
  for (const field of MUTATION_FIELDS) {
    const altered = { ...proof };
    if (field === "runAttempt" || field === "freshnessSeconds") {
      altered[field]++;
    } else if (field === "observedAt" || field === "expiresAt") {
      altered[field] = new Date(Date.parse(proof[field]) + 1000).toISOString();
    } else if (field === "activatedAt") {
      altered[field] = new Date(Date.parse(proof[field]) - 1000).toISOString();
    } else {
      altered[field] = String(proof[field]) + "-mutated";
    }
    assert.throws(
      () => engine.promoteGuard(incident, altered),
      undefined,
      "MUTATED_PROMOTION_PROOF_ACCEPTED:" + field,
    );
    rejectedMutations.push(field);
  }

  const changedRegistry = JSON.parse(activationRegistryText);
  changedRegistry.activations[0].assertion += "-mutated";
  activationRegistryText = JSON.stringify(changedRegistry);
  assert.throws(
    () =>
      engine.recordOccurrence(active, {
        ...occurrence,
        occurrenceId: "trusted-occurrence-after-activation",
        observedAt: proof.activatedAt,
      }),
    undefined,
    "PERSISTED_ACTIVATION_MUTATION_ACCEPTED",
  );
  process.stdout.write(
    JSON.stringify({
      protocol: 1,
      promotion: active.state,
      rejectedMutations,
      persistedActivationMutationRejected: true,
    }) + "\n",
  );
}

async function createSandboxContext({
  getActivationRegistry,
  trustedRegistryText,
}) {
  const context = vm.createContext(
    {},
    { codeGeneration: { strings: false, wasm: false } },
  );
  const activationUrl =
    "file:///candidate/.github/morro-control/failures/guard-activations.json";
  const trustedUrl =
    "file:///candidate/.github/morro-control/tdp-max/anti-recurrence.json";
  context.__hostCreateHash = (algorithm) => {
    assert.equal(algorithm, "sha256", "SANDBOX_HASH_ALGORITHM_FORBIDDEN");
    return createHash(algorithm);
  };
  context.__hostEqualStrings = (left, right) => left === right;
  context.__hostRead = (url, encoding) => {
    assert.equal(encoding, "utf8", "SANDBOX_FILE_ENCODING_FORBIDDEN");
    if (url === activationUrl) return getActivationRegistry();
    if (url === trustedUrl) return trustedRegistryText;
    throw new Error("SANDBOX_FILE_READ_FORBIDDEN");
  };
  const exports = new vm.Script(
    `(() => {
      const hostCreateHash = globalThis.__hostCreateHash;
      const hostEqualStrings = globalThis.__hostEqualStrings;
      const hostRead = globalThis.__hostRead;
      class SafeURL {
        constructor(input, base) {
          const value = String(input);
          let path;
          if (value.startsWith("file:///")) {
            path = value.slice("file://".length);
          } else {
            if (typeof base !== "string" || !base.startsWith("file:///"))
              throw new TypeError("Unsupported URL base");
            const basePath = base.slice("file://".length);
            const slash = basePath.lastIndexOf("/");
            path = basePath.slice(0, slash + 1) + value;
          }
          const parts = [];
          for (const part of path.split("/")) {
            if (!part || part === ".") continue;
            if (part === "..") parts.pop();
            else parts.push(part);
          }
          this.href = "file:///" + parts.join("/");
          Object.freeze(this);
        }
        toString() { return this.href; }
      }
      const createHash = (algorithm) => {
        if (algorithm !== "sha256") throw new TypeError("Hash forbidden");
        const hash = hostCreateHash(algorithm);
        let done = false;
        const result = {
          update(value, encoding = "utf8") {
            if (done || typeof value !== "string" || encoding !== "utf8")
              throw new TypeError("Hash input forbidden");
            hash.update(value, encoding);
            return result;
          },
          digest(encoding) {
            if (done || encoding !== "hex")
              throw new TypeError("Hash digest forbidden");
            done = true;
            return hash.digest(encoding);
          }
        };
        return Object.freeze(result);
      };
      const readFileSync = (path, encoding) => {
        const url = typeof path === "string" ? path : String(path);
        return hostRead(url, encoding);
      };
      const isDeepStrictEqual = (left, right) => {
        const a = JSON.stringify(left);
        const b = JSON.stringify(right);
        return typeof a === "string" && typeof b === "string" &&
          hostEqualStrings(a, b);
      };
      const crypto = Object.freeze({ createHash });
      const jsonStringify = JSON.stringify;
      const jsonParse = JSON.parse;
      const structuredClone = (value) =>
        jsonParse(jsonStringify(value));
      const modules = Object.freeze({
        createHash,
        crypto,
        readFileSync,
        isDeepStrictEqual
      });
      Object.defineProperty(globalThis, "URL", {
        value: SafeURL, writable: false, configurable: false
      });
      Object.defineProperty(globalThis, "structuredClone", {
        value: structuredClone, writable: false, configurable: false
      });
      delete globalThis.console;
      delete globalThis.__hostCreateHash;
      delete globalThis.__hostEqualStrings;
      delete globalThis.__hostRead;
      return modules;
    })()`,
    { filename: "trusted-vm-bootstrap.mjs" },
  ).runInContext(context, { timeout: 1000 });
  return { context, safeModuleExports: exports };
}

const direct =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direct && process.argv[2] === "--sandbox-child") {
  try {
    await sandboxChildMain();
  } catch (error) {
    process.stderr.write(
      "TDP_FAILURE_LEARNING_SANDBOX_REJECTED:" + errorCode(error) + "\n",
    );
    process.exitCode = 1;
  }
} else if (direct) {
  try {
    const [candidateRoot = ".", manifestPath] = process.argv.slice(2);
    assert.ok(manifestPath, "MANIFEST_PATH_REQUIRED");
    const result = await buildTrustedFailureLearningProof(
      candidateRoot,
      manifestPath,
      process.env,
    );
    process.stdout.write(JSON.stringify(result) + "\n");
  } catch (error) {
    process.stderr.write(
      "TDP_FAILURE_LEARNING_TRUSTED_PROOF_FAILED:" + errorCode(error) + "\n",
    );
    process.exitCode = 1;
  }
}
