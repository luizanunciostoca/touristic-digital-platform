import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  cpSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

export const REPOSITORY = "luizanunciostoca/touristic-digital-platform";
export const WORKFLOW_PATH =
  ".github/workflows/failure-learning-independent-proof.yml";
export const WORKFLOW_NAME = "Failure Learning Independent Proof";
export const JOB_NAME = "trusted-failure-learning-proof";
export const ASSERTION = "GUARD_PREVENTION_PROVEN";
export const ACTIVATION_PATH =
  ".github/morro-control/failures/guard-activations.json";
const SHA = /^[0-9a-f]{40}$/u;
const RUN_ID = /^[1-9][0-9]*$/u;
const RUN_ATTEMPT = /^[1-9][0-9]*$/u;

function git(root, ...args) {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
  }).trim();
}
function isAncestor(root, base, head) {
  try {
    execFileSync(
      "git",
      ["-C", root, "merge-base", "--is-ancestor", base, head],
      {
        stdio: "ignore",
      },
    );
    return true;
  } catch {
    return false;
  }
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
    "pull_request",
    "TRUSTED_CONTEXT_EVENT_INVALID",
  );
  assert.equal(
    env.GITHUB_REPOSITORY,
    REPOSITORY,
    "TRUSTED_CONTEXT_REPOSITORY_INVALID",
  );
  assert.equal(
    env.GITHUB_WORKFLOW,
    WORKFLOW_NAME,
    "TRUSTED_CONTEXT_WORKFLOW_INVALID",
  );
  assert.equal(env.GITHUB_JOB, JOB_NAME, "TRUSTED_CONTEXT_JOB_INVALID");
  assert.match(
    env.GITHUB_RUN_ID ?? "",
    RUN_ID,
    "TRUSTED_CONTEXT_RUN_ID_INVALID",
  );
  assert.match(
    env.GITHUB_RUN_ATTEMPT ?? "",
    RUN_ATTEMPT,
    "TRUSTED_CONTEXT_RUN_ATTEMPT_INVALID",
  );
  assert.ok(
    String(env.GITHUB_WORKFLOW_REF ?? "").startsWith(
      REPOSITORY + "/" + WORKFLOW_PATH + "@",
    ),
    "TRUSTED_CONTEXT_WORKFLOW_REF_INVALID",
  );
  assert.match(
    env.EXPECTED_CANDIDATE_SHA ?? "",
    SHA,
    "TRUSTED_CONTEXT_CANDIDATE_INVALID",
  );
  assert.match(
    env.EXPECTED_BASE_SHA ?? "",
    SHA,
    "TRUSTED_CONTEXT_BASE_INVALID",
  );
  assert.match(
    env.TRUSTED_VALIDATOR_SHA ?? "",
    SHA,
    "TRUSTED_CONTEXT_VALIDATOR_SHA_INVALID",
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
  assert.match(
    env.EXPECTED_BRANCH ?? "",
    /^[A-Za-z0-9._/-]+$/u,
    "TRUSTED_CONTEXT_BRANCH_INVALID",
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

export function validateCandidateContract(root, context) {
  const candidateRoot = realpathSync(resolve(root));
  assert.equal(
    git(candidateRoot, "rev-parse", "HEAD"),
    context.candidateSha,
    "CANDIDATE_HEAD_MISMATCH",
  );
  assert.equal(
    git(candidateRoot, "status", "--porcelain", "--untracked-files=all"),
    "",
    "CANDIDATE_WORKTREE_DIRTY",
  );
  assert.ok(
    isAncestor(candidateRoot, context.baseSha, context.candidateSha),
    "CANDIDATE_BASE_NOT_ANCESTOR",
  );
  const manifest = readJson(candidateRoot, context.manifestPath);
  assert.equal(
    manifest.id,
    "MD-TDP-LEARNING-001",
    "LEARNING_CHANGESET_REQUIRED",
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
  return { candidateRoot, manifest };
}

export function buildGuardProof(context, validatorRevision, activatedAt) {
  assert.match(
    validatorRevision,
    /^sha256:[0-9a-f]{64}$/u,
    "VALIDATOR_REVISION_INVALID",
  );
  return Object.freeze({
    guardId: "AR-001",
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
    validatorRevision,
    activatedAt,
    repository: REPOSITORY,
    runId: context.runId,
    runAttempt: context.runAttempt,
    workflow: context.workflow,
    job: context.job,
    assertion: context.assertion,
  });
}

export function buildActivationRecord(proof) {
  return Object.freeze({
    guardId: proof.guardId,
    state: "ACTIVE_GUARD",
    candidateSha: proof.candidateBinding,
    regressionTest: proof.regressionTest,
    independentProof: proof.independentProof,
    independentProofCandidateSha: proof.independentProofCandidateSha,
    freshness: proof.freshness,
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

async function loadEngine(root, nonce) {
  const path = resolve(root, "tooling/failure-learning/engine.mjs");
  return import(
    pathToFileURL(path).href + "?trusted=" + encodeURIComponent(nonce)
  );
}
function incidentFor(engine, observedAt = "2026-10-04T05:00:00Z") {
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
    observedAt,
  };
  return {
    occurrence,
    incident: {
      ...occurrence,
      state: "PREVENTION_PROVEN",
      rootCause: "stale evidence identity",
      fingerprint: engine.fingerprint(occurrence),
      occurrenceIds: [],
      occurrences: [],
      metrics: {
        occurrencesBeforeGuard: 0,
        occurrencesAfterGuard: 0,
        preventedCount: 0,
        falsePositiveCount: 0,
        guardEffectiveness: "UNKNOWN",
      },
    },
  };
}

export async function runTrustedSemanticProbe(
  candidateRoot,
  context,
  validatorRevision,
) {
  const proof = buildGuardProof(
    context,
    validatorRevision,
    "2026-10-04T05:01:00Z",
  );
  const engine = await loadEngine(
    candidateRoot,
    "negative-" + context.candidateSha,
  );
  const { occurrence, incident } = incidentFor(engine);

  assert.throws(
    () => engine.promoteGuard(incident, proof),
    /GUARD_PROOF_SOURCE_UNVERIFIED/u,
    "CALLER_PROOF_MUST_NOT_ACTIVATE_GUARD",
  );

  const first = engine.recordOccurrence(null, occurrence);
  const forged = {
    ...first,
    state: "ACTIVE_GUARD",
    guardId: proof.guardId,
    guardActivationAt: proof.activatedAt,
    guardRevision: proof.validatorRevision,
    proofReference: proof.independentProof,
    candidateBinding: proof.candidateBinding,
    regressionTestReference: proof.regressionTest,
  };
  assert.throws(
    () =>
      engine.recordOccurrence(forged, {
        ...occurrence,
        occurrenceId: "trusted-occurrence-forged",
        observedAt: "2026-10-04T05:02:00Z",
      }),
    /GUARD_ACTIVATION_NOT_CANONICAL/u,
    "UNREGISTERED_GUARD_MUST_NOT_ESTABLISH_RECURRENCE",
  );

  const fixture = mkdtempSync(resolve(tmpdir(), "tdp-learning-trusted-"));
  try {
    const sourceDir = resolve(candidateRoot, "tooling/failure-learning");
    const targetDir = resolve(fixture, "tooling/failure-learning");
    mkdirSync(dirname(targetDir), { recursive: true });
    cpSync(sourceDir, targetDir, { recursive: true });
    const activationFile = resolve(fixture, ACTIVATION_PATH);
    mkdirSync(dirname(activationFile), { recursive: true });
    writeFileSync(
      activationFile,
      JSON.stringify(
        {
          schemaVersion: 1,
          authority: "ORCHESTRATOR",
          activations: [buildActivationRecord(proof)],
        },
        null,
        2,
      ) + "\n",
    );

    const fixtureEngine = await loadEngine(
      fixture,
      "positive-" + context.candidateSha,
    );
    const positive = incidentFor(fixtureEngine);
    const active = fixtureEngine.promoteGuard(positive.incident, proof);
    assert.equal(active.state, "ACTIVE_GUARD", "CANONICAL_ACTIVATION_REQUIRED");
    const recurrent = fixtureEngine.recordOccurrence(active, {
      ...positive.occurrence,
      occurrenceId: "trusted-occurrence-after-activation",
      observedAt: "2026-10-04T05:02:00Z",
    });
    assert.equal(recurrent.state, "ROOT_CAUSE_CONFIRMED");
    assert.equal(recurrent.recurrenceAfterGuard, true);
    assert.equal(recurrent.metrics.guardEffectiveness, "INEFFECTIVE");
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
  return { proof, activation: buildActivationRecord(proof) };
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
  );
  return {
    schemaVersion: 1,
    contract: "TDP_FAILURE_LEARNING_INDEPENDENT_PROOF",
    status: "pass",
    authority: "BASE_CONTROLLED_TRUSTED_VALIDATOR",
    repository: context.repository,
    candidateSha: context.candidateSha,
    candidateTreeSha: git(contract.candidateRoot, "rev-parse", "HEAD^{tree}"),
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

const direct =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direct) {
  try {
    const [candidateRoot = ".", manifestPath] = process.argv.slice(2);
    assert.ok(manifestPath, "MANIFEST_PATH_REQUIRED");
    const result = await buildTrustedFailureLearningProof(
      candidateRoot,
      manifestPath,
      process.env,
    );
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(
      "TDP_FAILURE_LEARNING_TRUSTED_PROOF_FAILED:" + errorCode(error),
    );
    process.exitCode = 1;
  }
}
