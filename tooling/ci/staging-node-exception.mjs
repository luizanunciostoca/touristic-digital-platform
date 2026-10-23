import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { validateExternalEvidenceBundle } from "../tdp-max/tdp-max-v2.mjs";

export const NODE_MODE = "staging-node-rebuild";
export const STAGING_SERVICE = "srv-da4hb6c9v7es7386ttt0";
export const STAGING_URL = "https://morro-digital-v2-staging.onrender.com";
const SHA = /^[a-f0-9]{40}$/u;
const integer = (v) => Number.isSafeInteger(v) && v > 0;
const time = (v) => {
  assert.equal(typeof v, "string", "TIMESTAMP_REQUIRED");
  const value = Date.parse(v);
  assert.ok(Number.isFinite(value), "TIMESTAMP_INVALID");
  return value;
};
const nonempty = (v) => typeof v === "string" && v.trim().length > 0;
function noOciIdentity(e) {
  for (const key of [
    "digest",
    "image",
    "imageDigest",
    "imageRunId",
    "image_run_id",
  ])
    assert.equal(Object.hasOwn(e, key), false, "NODE_OCI_IDENTITY_MIXED");
}

/**
 * Structural validation only. Connector observations are NOT authenticated by
 * accepting JSON, a URL, or a caller-supplied "verified" flag. The external
 * authority/transport adapter must be approved separately before publication.
 */
export function validateExternalNodeObservation(e, expected, { now } = {}) {
  const bundle = validateExternalEvidenceBundle(e?.externalEvidence, time(now));
  assert.deepEqual(bundle.unknowns, [], "NODE_EXTERNAL_UNKNOWNS");
  assert.deepEqual(bundle.conflicts, [], "NODE_EXTERNAL_CONFLICTS");
  assert.equal(bundle.items.length, 1, "NODE_EXTERNAL_AMBIGUOUS");
  const item = bundle.items[0];
  assert.equal(item.domain, "runtime", "NODE_EXTERNAL_DOMAIN");
  assert.equal(
    item.producer,
    "ORCHESTRATOR_CONNECTOR_READBACK",
    "NODE_EXTERNAL_PRODUCER",
  );
  assert.equal(item.status, "VERIFIED", "NODE_EXTERNAL_NOT_VERIFIED");
  assert.equal(item.source, e.origin?.reference, "NODE_EXTERNAL_SOURCE");
  assert.equal(
    item.identity,
    [STAGING_SERVICE, e.provider?.deploymentId, e.sourceSha].join(":"),
    "NODE_EXTERNAL_IDENTITY",
  );
  assert.equal(
    item.assertion,
    "render-node-deployment-live",
    "NODE_EXTERNAL_ASSERTION",
  );
  assert.equal(item.observedAt, e.origin?.observedAt, "NODE_EXTERNAL_TIME");
  assert.equal(e?.schemaVersion, 1, "NODE_EVIDENCE_VERSION");
  assert.equal(e.mode, NODE_MODE, "NODE_EVIDENCE_MODE");
  assert.equal(e.environment, "staging", "NODE_STAGING_ONLY");
  assert.equal(e.productionEligible, false, "NODE_PRODUCTION_FORBIDDEN");
  assert.equal(e.pagesEligible, false, "NODE_PAGES_FORBIDDEN");
  noOciIdentity(e);
  noOciIdentity(e.provider ?? {});
  assert.match(e.sourceSha ?? "", SHA, "NODE_SOURCE_REQUIRED");
  assert.match(e.treeSha ?? "", SHA, "NODE_TREE_REQUIRED");
  assert.equal(e.sourceSha, expected.sourceSha, "NODE_SOURCE_MISMATCH");
  assert.equal(e.treeSha, expected.treeSha, "NODE_TREE_MISMATCH");
  assert.equal(e.serviceId, STAGING_SERVICE, "NODE_SERVICE_MISMATCH");
  assert.equal(e.canonicalUrl, STAGING_URL, "NODE_URL_MISMATCH");
  assert.equal(
    e.origin?.kind,
    "authenticated-render-connector-observation",
    "NODE_ORIGIN_KIND",
  );
  assert.ok(nonempty(e.origin?.reference), "NODE_ORIGIN_REFERENCE_REQUIRED");
  assert.equal(
    e.origin?.verificationLocation,
    "external-to-github-actions",
    "NODE_ORIGIN_LOCATION",
  );
  assert.equal(e.origin?.verifiedByActions, false, "NODE_FALSE_CI_ATTESTATION");
  assert.equal(e.workflow?.event, "workflow_dispatch", "NODE_WORKFLOW_EVENT");
  assert.equal(
    e.workflow?.path,
    ".github/workflows/staging-render-promotion.yml",
    "NODE_WORKFLOW_PATH",
  );
  for (const key of [
    "runId",
    "runAttempt",
    "callerRunId",
    "callerRunAttempt",
  ]) {
    assert.ok(integer(e.workflow[key]), "NODE_RUN_IDENTITY_REQUIRED");
    assert.equal(
      e.workflow[key],
      expected.workflow[key],
      "NODE_RUN_IDENTITY_MISMATCH",
    );
  }
  assert.equal(e.workflow.headSha, e.sourceSha, "NODE_WORKFLOW_HEAD_MISMATCH");
  assert.equal(
    e.workflow.requestId,
    expected.workflow.requestId,
    "NODE_REQUEST_MISMATCH",
  );
  assert.ok(nonempty(e.workflow.requestId), "NODE_REQUEST_REQUIRED");
  assert.ok(nonempty(e.authorizationId), "NODE_AUTHORIZATION_REQUIRED");
  assert.equal(
    e.authorizationId,
    expected.authorizationId,
    "NODE_AUTHORIZATION_MISMATCH",
  );
  assert.equal(
    e.reservationId,
    expected.reservationId,
    "NODE_RESERVATION_MISMATCH",
  );
  assert.ok(nonempty(e.reservationId), "NODE_RESERVATION_REQUIRED");
  assert.equal(expected.reservationConsumed, false, "NODE_REPLAY_REJECTED");
  assert.ok(integer(e.artifact?.id), "NODE_ARTIFACT_ID_REQUIRED");
  assert.equal(e.artifact.id, expected.artifact.id, "NODE_ARTIFACT_MISMATCH");
  assert.equal(
    e.artifact.name,
    expected.artifact.name,
    "NODE_ARTIFACT_MISMATCH",
  );
  assert.equal(
    e.artifact.runId,
    e.workflow.runId,
    "NODE_ARTIFACT_RUN_MISMATCH",
  );
  assert.equal(
    e.artifact.runAttempt,
    e.workflow.runAttempt,
    "NODE_ARTIFACT_ATTEMPT_MISMATCH",
  );
  assert.equal(expected.artifactCount, 1, "NODE_ARTIFACT_AMBIGUOUS");
  assert.match(
    e.provider?.deploymentId ?? "",
    /^dep-[A-Za-z0-9]+$/u,
    "NODE_PROVIDER_ID_REQUIRED",
  );
  assert.equal(
    e.provider.deploymentId,
    expected.providerDeploymentId,
    "NODE_PROVIDER_ID_MISMATCH",
  );
  assert.equal(
    e.provider.serviceId,
    STAGING_SERVICE,
    "NODE_PROVIDER_SERVICE_MISMATCH",
  );
  assert.equal(
    e.provider.commitSha,
    e.sourceSha,
    "NODE_PROVIDER_COMMIT_MISMATCH",
  );
  assert.equal(e.provider.status, "live", "NODE_PROVIDER_NOT_LIVE");
  assert.equal(
    e.provider.latestDeploymentId,
    e.provider.deploymentId,
    "NODE_INTERVENING_DEPLOYMENT",
  );
  assert.equal(e.provider.runtime, "node", "NODE_PROVIDER_RUNTIME_MISMATCH");
  assert.equal(
    e.provider.configurationFingerprint,
    expected.configurationFingerprint,
    "NODE_CONFIGURATION_CHANGED",
  );
  assert.match(
    e.provider.configurationFingerprint ?? "",
    /^sha256:[a-f0-9]{64}$/u,
    "NODE_CONFIG_PROOF_REQUIRED",
  );
  assertObservationAfterBarrier(
    e,
    expected.receiptObservedAt,
    expected.verificationBarrier,
  );
  const dispatchAt = time(expected.dispatchAt);
  const createdAt = time(e.provider.createdAt);
  const liveAt = time(e.provider.liveAt);
  const observedAt = time(e.origin.observedAt);
  const nowMs = time(now);
  assert.ok(
    createdAt >= dispatchAt && liveAt >= createdAt && observedAt >= liveAt,
    "NODE_PROVIDER_TIME_ORDER",
  );
  assert.ok(
    observedAt <= nowMs && nowMs - observedAt <= 300_000,
    "NODE_OBSERVATION_STALE",
  );
  assert.equal(e.runtime?.releaseSha, e.sourceSha, "NODE_RUNTIME_SHA_MISMATCH");
  assert.equal(e.runtime?.healthy, true, "NODE_RUNTIME_UNHEALTHY");
  assert.equal(e.runtime?.ready, true, "NODE_RUNTIME_UNREADY");
  assert.equal(
    e.runtime?.identityKind,
    "application-runtime-identity",
    "NODE_RUNTIME_IDENTITY_KIND",
  );
  assert.ok(
    nonempty(e.runtime.identity) && e.runtime.identity !== "unknown",
    "NODE_RUNTIME_IDENTITY_REQUIRED",
  );
  assert.ok(
    time(e.runtime.observedAt) >= liveAt && time(e.runtime.observedAt) <= nowMs,
    "NODE_RUNTIME_TIME_ORDER",
  );
  assert.ok(
    nonempty(expected.previousRuntime?.identity),
    "NODE_BASELINE_REQUIRED",
  );
  assert.match(
    expected.previousRuntime?.releaseSha ?? "",
    SHA,
    "NODE_BASELINE_REQUIRED",
  );
  assert.ok(
    expected.previousRuntime.releaseSha !== e.sourceSha ||
      expected.previousRuntime.identity !== e.runtime.identity,
    "NODE_SAME_SHA_OLD_RUNTIME",
  );
  return Object.freeze({
    contractValid: true,
    originAuthenticated: false,
    publicationAuthorized: false,
    mode: NODE_MODE,
    sourceSha: e.sourceSha,
    providerDeploymentId: e.provider.deploymentId,
    runtimeIdentity: e.runtime.identity,
  });
}

export function requireOciAcceptance(evidence, consumer) {
  assert.ok(
    ["production", "pages", "oci"].includes(consumer),
    "ACCEPTANCE_CONSUMER_INVALID",
  );
  assert.equal(evidence?.mode, "oci-immutable", "OCI_ACCEPTANCE_REQUIRED");
  assert.equal(
    evidence?.[consumer === "pages" ? "pagesEligible" : "productionEligible"],
    true,
    "ACCEPTANCE_DESTINATION_FORBIDDEN",
  );
  assert.match(
    evidence?.imageDigest ?? "",
    /^sha256:[a-f0-9]{64}$/u,
    "OCI_DIGEST_REQUIRED",
  );
  assert.match(
    String(evidence?.imageRunId ?? ""),
    /^[1-9][0-9]*$/u,
    "OCI_RUN_REQUIRED",
  );
  return true;
}

export function requireNodePublicationAuthority() {
  throw new Error("EXTERNAL_EVIDENCE_AUTHORITY_NOT_CONFIGURED");
}

const RECEIPT_PREFIX = "TDP_STAGING_NODE_RECEIPT_V1\n";
export function receiptBody(payload) {
  return RECEIPT_PREFIX + JSON.stringify(payload);
}
export async function verifyConnectorReceipt(
  reference,
  { fetchComment, listComments, actor, expected, now },
) {
  assert.ok(integer(reference?.commentId), "RECEIPT_REFERENCE_REQUIRED");
  assert.match(
    reference?.sha256 ?? "",
    /^[a-f0-9]{64}$/u,
    "RECEIPT_DIGEST_REQUIRED",
  );
  assert.ok(
    integer(actor?.id) &&
      nonempty(actor?.login) &&
      Object.hasOwn(actor, "appId"),
    "RECEIPT_ACTOR_POLICY_REQUIRED",
  );
  const authorized = (comment) =>
    comment?.user?.id === actor.id &&
    comment.user.login === actor.login &&
    (comment.performed_via_github_app?.id ?? null) === actor.appId;
  const snapshot = (comment) =>
    JSON.stringify({
      id: comment.id,
      body: comment.body,
      createdAt: comment.created_at,
      updatedAt: comment.updated_at,
      user: comment.user,
      appId: comment.performed_via_github_app?.id ?? null,
      issueUrl: comment.issue_url,
    });
  const first = await fetchComment(reference.commentId);
  assert.equal(first.id, reference.commentId, "RECEIPT_ID_MISMATCH");
  assert.ok(authorized(first), "RECEIPT_ACTOR_MISMATCH");
  assert.equal(
    first.issue_url,
    "https://api.github.com/repos/luizanunciostoca/touristic-digital-platform/issues/1072",
    "RECEIPT_WRONG_CONTROL_TOWER",
  );
  assert.equal(first.created_at, first.updated_at, "RECEIPT_EDITED");
  assert.equal(
    createHash("sha256").update(first.body, "utf8").digest("hex"),
    reference.sha256,
    "RECEIPT_BYTES_MISMATCH",
  );
  assert.ok(first.body.startsWith(RECEIPT_PREFIX), "RECEIPT_FORMAT");
  const payload = JSON.parse(first.body.slice(RECEIPT_PREFIX.length));
  assert.equal(payload.schemaVersion, 1, "RECEIPT_SCHEMA");
  assert.equal(
    payload.producer,
    "ORCHESTRATOR_CONNECTOR_READBACK",
    "RECEIPT_PRODUCER",
  );
  assert.ok(
    ["pre-deploy", "post-deploy"].includes(payload.phase),
    "RECEIPT_PHASE",
  );
  for (const key of [
    "phase",
    "authorizationId",
    "requestId",
    "sourceSha",
    "treeSha",
    "runId",
    "runAttempt",
    "callerRunId",
    "callerRunAttempt",
  ])
    assert.equal(payload[key], expected[key], "RECEIPT_BINDING_MISMATCH");
  assert.match(payload.sourceSha ?? "", SHA, "RECEIPT_SOURCE_REQUIRED");
  assert.match(payload.treeSha ?? "", SHA, "RECEIPT_TREE_REQUIRED");
  assert.ok(
    nonempty(payload.authorizationId) && nonempty(payload.requestId),
    "RECEIPT_REQUEST_REQUIRED",
  );
  for (const key of ["runId", "runAttempt", "callerRunId", "callerRunAttempt"])
    assert.ok(integer(payload[key]), "RECEIPT_RUN_REQUIRED");
  assert.equal(payload.serviceId, STAGING_SERVICE, "RECEIPT_SERVICE_MISMATCH");
  assert.equal(payload.maximumDeployments, 1, "RECEIPT_USE_LIMIT");
  assert.equal(payload.mode, NODE_MODE, "RECEIPT_MODE");
  const observed = time(payload.observedAt),
    created = time(first.created_at),
    current = time(now);
  assert.ok(
    observed <= created && created <= current && current - observed <= 300_000,
    "RECEIPT_STALE_OR_FUTURE",
  );
  const listing = await listComments();
  assert.equal(listing?.complete, true, "RECEIPT_LIST_INCOMPLETE");
  assert.ok(Array.isArray(listing.comments), "RECEIPT_LIST_REQUIRED");
  const entries = listing.comments
    .filter(authorized)
    .filter((c) => c.body.startsWith(RECEIPT_PREFIX))
    .map((c) => ({
      comment: c,
      payload: JSON.parse(c.body.slice(RECEIPT_PREFIX.length)),
    }));
  assert.equal(
    entries.filter((x) => x.comment.id === reference.commentId).length,
    1,
    "RECEIPT_NOT_LISTED_ONCE",
  );
  assert.equal(
    snapshot(entries.find((x) => x.comment.id === reference.commentId).comment),
    snapshot(first),
    "RECEIPT_LIST_DRIFT",
  );
  assert.equal(
    entries.some(
      (x) =>
        x.payload.authorizationId === payload.authorizationId &&
        x.payload.phase === "revoked",
    ),
    false,
    "RECEIPT_REVOKED",
  );
  const samePhase = entries.filter(
    (x) =>
      x.payload.authorizationId === payload.authorizationId &&
      x.payload.phase === payload.phase,
  );
  if (payload.phase === "pre-deploy") {
    assert.equal(samePhase.length, 1, "RECEIPT_DUPLICATE_AUTHORIZATION");
  } else {
    assert.deepEqual(
      payload.verification,
      expected.verification,
      "RECEIPT_VERIFICATION_BINDING",
    );
    assert.deepEqual(
      payload.verificationBarrier,
      expected.verificationBarrier,
      "RECEIPT_VERIFICATION_BARRIER_BINDING",
    );
    assertObservationAfterBarrier(
      payload.observation,
      payload.observedAt,
      expected.verificationBarrier,
    );
    for (const key of [
      "runId",
      "runAttempt",
      "callerRunId",
      "callerRunAttempt",
    ])
      assert.ok(
        integer(payload.verification?.[key]),
        "RECEIPT_VERIFICATION_ID_REQUIRED",
      );
    assert.equal(
      payload.verificationId,
      `${payload.verification.runId}:${payload.verification.runAttempt}`,
      "RECEIPT_VERIFICATION_ID",
    );
    const ordered = samePhase.sort((a, b) => a.comment.id - b.comment.id);
    let previous = null;
    const seen = new Set();
    for (const entry of ordered) {
      const q = entry.payload;
      assert.equal(
        entry.comment.created_at,
        entry.comment.updated_at,
        "RECEIPT_CHAIN_EDITED",
      );
      assert.equal(
        entry.comment.issue_url,
        first.issue_url,
        "RECEIPT_CHAIN_LOCATION",
      );
      assert.equal(
        q.supersedesReceiptId,
        previous,
        "RECEIPT_SUPERSESSION_CONFLICT",
      );
      assert.ok(!seen.has(q.verificationId), "RECEIPT_VERIFICATION_DUPLICATE");
      for (const key of [
        "sourceSha",
        "treeSha",
        "runId",
        "runAttempt",
        "callerRunId",
        "callerRunAttempt",
        "requestId",
        "preReceiptId",
        "preReceiptSha256",
        "dispatchArtifactId",
        "dispatchSha256",
      ])
        assert.equal(q[key], payload[key], "RECEIPT_CHAIN_DISPATCH_DRIFT");
      seen.add(q.verificationId);
      previous = entry.comment.id;
    }
    assert.equal(previous, first.id, "RECEIPT_SUPERSEDED");
  }
  const last = await fetchComment(reference.commentId);
  assert.equal(snapshot(last), snapshot(first), "RECEIPT_REREAD_DRIFT");
  const receipt = freezeDeep({
    transport: "github-issue-comment",
    transportVerified: true,
    providerQueriedByCi: false,
    commentId: first.id,
    sha256: reference.sha256,
    payload: JSON.parse(JSON.stringify(payload)),
    publicationAuthorized: false,
  });
  connectorReceipts.add(receipt);
  return receipt;
}

export async function verifyOciAcceptanceRun({
  runId,
  sourceSha,
  consumer,
  readRun,
  listArtifacts,
  readEvidence,
}) {
  assert.ok(integer(runId), "OCI_ACCEPTANCE_RUN_REQUIRED");
  assert.match(sourceSha ?? "", SHA, "OCI_ACCEPTANCE_SHA_REQUIRED");
  const run = await readRun(runId);
  assert.equal(run.id, runId, "OCI_ACCEPTANCE_RUN_MISMATCH");
  assert.equal(run.head_sha, sourceSha, "OCI_ACCEPTANCE_HEAD_MISMATCH");
  assert.equal(
    run.path,
    ".github/workflows/final-release-acceptance.yml",
    "OCI_ACCEPTANCE_WORKFLOW",
  );
  assert.ok(
    ["workflow_dispatch", "issue_comment"].includes(run.event),
    "OCI_ACCEPTANCE_EVENT",
  );
  assert.equal(run.status, "completed", "OCI_ACCEPTANCE_NOT_COMPLETE");
  assert.equal(run.conclusion, "success", "OCI_ACCEPTANCE_NOT_SUCCESS");
  assert.ok(integer(run.run_attempt), "OCI_ACCEPTANCE_ATTEMPT");
  const artifacts = await listArtifacts(runId);
  assert.equal(artifacts.complete, true, "OCI_ARTIFACT_LIST_INCOMPLETE");
  const name =
    "final-release-acceptance-evidence-" + runId + "-" + run.run_attempt;
  const matches = artifacts.items.filter((a) => a.name === name);
  assert.equal(matches.length, 1, "OCI_ACCEPTANCE_ARTIFACT_AMBIGUOUS");
  assert.equal(matches[0].expired, false, "OCI_ACCEPTANCE_ARTIFACT_EXPIRED");
  const evidence = await readEvidence(runId, matches[0]);
  assert.equal(evidence.expectedSha, sourceSha, "OCI_ACCEPTANCE_EVIDENCE_SHA");
  assert.equal(
    evidence.acceptanceRunId,
    String(runId),
    "OCI_ACCEPTANCE_EVIDENCE_RUN",
  );
  assert.equal(
    evidence.acceptanceRunAttempt,
    String(run.run_attempt),
    "OCI_ACCEPTANCE_EVIDENCE_ATTEMPT",
  );
  requireOciAcceptance(evidence, consumer);
  const last = await readRun(runId);
  for (const field of [
    "id",
    "head_sha",
    "run_attempt",
    "status",
    "conclusion",
    "path",
  ])
    assert.equal(last[field], run[field], "OCI_ACCEPTANCE_REREAD_DRIFT");
  return Object.freeze({
    mode: "oci-immutable",
    sourceSha,
    runId,
    runAttempt: run.run_attempt,
    consumer,
  });
}

async function cli(args) {
  if (args[0] === "verify-node-run") {
    assert.equal(args.length, 3, "NODE_ACCEPTANCE_ARGUMENTS");
    return nodeAcceptanceCli(args[1], args[2]);
  }
  if (
    [
      "node-intent",
      "node-dispatch",
      "node-verification-barrier",
      "node-verify",
    ].includes(args[0])
  ) {
    assert.equal(args.length, 1, "NODE_COMMAND_ARGUMENTS");
    return nodeRuntime(args[0]);
  }
  assert.equal(args[0], "verify-oci-run", "NODE_EXCEPTION_COMMAND_DISABLED");
  assert.equal(args.length, 4, "OCI_ACCEPTANCE_ARGUMENTS");
  const [, id, sourceSha, consumer] = args,
    repo = process.env.GITHUB_REPOSITORY;
  assert.equal(
    repo,
    "luizanunciostoca/touristic-digital-platform",
    "ACCEPTANCE_REPOSITORY",
  );
  const { execFileSync } = await import("node:child_process");
  const { mkdtempSync, readFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const gh = (argv) =>
    execFileSync("gh", argv, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60000,
      maxBuffer: 8 * 1024 * 1024,
    });
  const api = (path) => JSON.parse(gh(["api", path]));
  const result = await verifyOciAcceptanceRun({
    runId: Number(id),
    sourceSha,
    consumer,
    readRun: async (runId) => api("repos/" + repo + "/actions/runs/" + runId),
    listArtifacts: async (runId) => ({
      complete: true,
      items: JSON.parse(
        gh([
          "api",
          "--paginate",
          "--slurp",
          "repos/" +
            repo +
            "/actions/runs/" +
            runId +
            "/artifacts?per_page=100",
        ]),
      ).flatMap((p) => p.artifacts),
    }),
    readEvidence: async (runId, artifact) => {
      const dir = mkdtempSync(join(tmpdir(), "tdp-oci-acceptance-"));
      try {
        gh([
          "run",
          "download",
          String(runId),
          "--repo",
          repo,
          "--name",
          artifact.name,
          "--dir",
          dir,
        ]);
        return JSON.parse(
          readFileSync(
            join(dir, "final-release-staging-target-evidence.json"),
            "utf8",
          ),
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  });
  console.log(JSON.stringify(result));
}
if (
  process.argv[1] &&
  import.meta.url === new URL("file:" + process.argv[1]).href
)
  cli(process.argv.slice(2)).catch(() => {
    console.error("ACCEPTANCE_MODE_GATE_FAILED");
    process.exitCode = 1;
  });

const connectorReceipts = new WeakSet();
function freezeDeep(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}
export function canonicalNodeHook(raw, sourceSha) {
  assert.match(sourceSha ?? "", SHA, "NODE_HOOK_SHA");
  const input = new URL(raw);
  assert.equal(input.origin, "https://api.render.com", "NODE_HOOK_ORIGIN");
  assert.equal(input.username + input.password, "", "NODE_HOOK_USERINFO");
  assert.equal(input.hash, "", "NODE_HOOK_FRAGMENT");
  assert.equal(
    input.pathname,
    "/deploy/" + STAGING_SERVICE,
    "NODE_HOOK_SERVICE",
  );
  const keys = [...input.searchParams.keys()];
  assert.deepEqual(keys, ["key"], "NODE_HOOK_QUERY");
  assert.ok(nonempty(input.searchParams.get("key")), "NODE_HOOK_KEY");
  const result = new URL("https://api.render.com/deploy/" + STAGING_SERVICE);
  result.searchParams.set("key", input.searchParams.get("key"));
  result.searchParams.set("ref", sourceSha);
  return result;
}

export async function dispatchNodeWithReservation({
  policy,
  receipt,
  expected,
  now,
  refStore,
  postHook,
}) {
  assert.equal(policy?.enabled, true, "NODE_DISPATCH_DISABLED");
  assert.ok(
    connectorReceipts.has(receipt),
    "NODE_AUTHENTICATED_RECEIPT_REQUIRED",
  );
  const p = receipt.payload,
    current = time(now);
  assert.equal(p.phase, "pre-deploy", "NODE_PREDEPLOY_RECEIPT_REQUIRED");
  assert.equal(
    p.authorizationId,
    policy.authorizationId,
    "NODE_POLICY_AUTHORIZATION",
  );
  assert.equal(p.runAttempt, 1, "NODE_DISPATCH_RERUN_FORBIDDEN");
  for (const key of [
    "runId",
    "runAttempt",
    "callerRunId",
    "callerRunAttempt",
    "requestId",
    "sourceSha",
    "treeSha",
  ])
    assert.equal(p[key], expected[key], "NODE_DISPATCH_IDENTITY");
  assert.ok(time(policy.expiresAt) > current, "NODE_AUTHORIZATION_EXPIRED");
  assert.ok(
    current - time(p.observedAt) <= 300000,
    "NODE_PREDEPLOY_RECEIPT_STALE",
  );
  assert.equal(p.maximumDeployments, 1, "NODE_SINGLE_PUBLICATION_REQUIRED");
  assert.equal(
    p.preflight?.configurationPreserved,
    true,
    "NODE_CONFIGURATION_NOT_PROVEN",
  );
  assert.equal(
    p.preflight?.recovery?.status,
    "PROVEN",
    "NODE_RECOVERY_NOT_PROVEN",
  );
  assert.equal(
    p.preflight.recovery.candidateSha,
    p.sourceSha,
    "NODE_RECOVERY_CANDIDATE",
  );
  for (const key of [
    "backupRef",
    "restoreRef",
    "rollbackRef",
    "mutationInventoryRef",
  ])
    assert.ok(
      nonempty(p.preflight.recovery[key]),
      "NODE_RECOVERY_REFERENCE_REQUIRED",
    );
  const ref =
    "refs/tags/staging-node-use/" +
    createHash("sha256").update(p.authorizationId).digest("hex");
  assert.equal(
    await refStore.getRef(ref),
    null,
    "NODE_PUBLICATION_ALREADY_RESERVED",
  );
  // GitHub create-ref is atomic. Never retry this operation after ambiguity.
  try {
    await refStore.createRef(ref, p.sourceSha);
  } catch {
    throw new Error("NODE_RESERVATION_UNCERTAIN_RECONCILE");
  }
  assert.equal(
    (await refStore.getRef(ref))?.sha,
    p.sourceSha,
    "NODE_RESERVATION_READBACK_FAILED",
  );
  let response;
  // Reservation precedes the only hook POST, including when POST times out.
  try {
    response = await postHook();
  } catch {
    throw new Error("NODE_HOOK_OUTCOME_UNCERTAIN_RECONCILE");
  }
  assert.match(
    response?.deploymentId ?? "",
    /^dep-[A-Za-z0-9]+$/u,
    "NODE_HOOK_ID_MISSING_RECONCILE",
  );
  return Object.freeze({
    mode: NODE_MODE,
    state: "DISPATCH_ACCEPTED_NOT_LIVE",
    reservationRef: ref,
    providerDeploymentId: response.deploymentId,
    sourceSha: p.sourceSha,
    requestId: p.requestId,
    runId: p.runId,
    runAttempt: p.runAttempt,
    preReceiptId: receipt.commentId,
    preReceiptSha256: receipt.sha256,
    productionEligible: false,
    pagesEligible: false,
  });
}

function stable(value) {
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + stable(value[k]))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
export function configurationFingerprint(snapshot) {
  return (
    "sha256:" + createHash("sha256").update(stable(snapshot)).digest("hex")
  );
}
export function validateNodePreflight(preflight, sourceSha) {
  const s = preflight?.serviceSnapshot;
  assert.equal(s?.serviceId, STAGING_SERVICE, "NODE_SNAPSHOT_SERVICE");
  assert.equal(s?.runtime, "node", "NODE_SNAPSHOT_RUNTIME");
  assert.equal(s?.url, STAGING_URL, "NODE_SNAPSHOT_URL");
  assert.equal(
    s?.repository,
    "https://github.com/luizanunciostoca/touristic-digital-platform",
    "NODE_SNAPSHOT_REPOSITORY",
  );
  assert.equal(s?.branch, "main", "NODE_SNAPSHOT_BRANCH");
  assert.equal(s?.autoDeploy, false, "NODE_AUTODEPLOY_FORBIDDEN");
  assert.equal(s?.diskId, "dsk-dbbd6stg1s2s738h3i4g", "NODE_DISK_CHANGED");
  assert.equal(s?.diskMountPath, "/var/data", "NODE_DISK_MOUNT_CHANGED");
  assert.equal(s?.diskSizeGB, 1, "NODE_DISK_SIZE_CHANGED");
  assert.equal(s?.plan, "starter", "NODE_PLAN_CHANGED");
  assert.equal(s?.region, "ohio", "NODE_REGION_CHANGED");
  assert.equal(s?.instances, 1, "NODE_INSTANCE_COUNT_CHANGED");
  assert.equal(s?.healthCheckPath, "/readyz", "NODE_HEALTH_PATH_CHANGED");
  assert.equal(
    s?.buildCommand,
    "corepack pnpm install --frozen-lockfile && corepack pnpm build",
    "NODE_BUILD_CHANGED",
  );
  assert.equal(
    s?.preDeployCommand,
    "node tooling/render/with-staging-mysql-env.mjs node apps/morro-digital-platform/tooling/staging-predeploy.mjs",
    "NODE_PREDEPLOY_CHANGED",
  );
  assert.equal(
    s?.startCommand,
    "node tooling/render/with-staging-mysql-env.mjs node apps/morro-digital-platform/tooling/dev-server.mjs",
    "NODE_START_CHANGED",
  );
  assert.equal(
    preflight.configurationFingerprint,
    configurationFingerprint(s),
    "NODE_SNAPSHOT_FINGERPRINT",
  );
  assert.match(
    preflight.previousProviderDeploymentId ?? "",
    /^dep-[A-Za-z0-9]+$/u,
    "NODE_PREVIOUS_DEPLOY_REQUIRED",
  );
  assert.match(
    preflight.previousRuntime?.releaseSha ?? "",
    SHA,
    "NODE_PREVIOUS_SHA_REQUIRED",
  );
  assert.ok(
    nonempty(preflight.previousRuntime?.identity),
    "NODE_PREVIOUS_RUNTIME_REQUIRED",
  );
  assert.equal(
    preflight.recovery?.status,
    "PROVEN",
    "NODE_RECOVERY_NOT_PROVEN",
  );
  assert.equal(
    preflight.recovery.candidateSha,
    sourceSha,
    "NODE_RECOVERY_CANDIDATE",
  );
  assert.equal(
    preflight.recovery.retainedBackup,
    true,
    "NODE_BACKUP_NOT_RETAINED",
  );
  assert.equal(
    preflight.recovery.wrapperAndPredeployCovered,
    true,
    "NODE_MUTATION_CLOSURE_REQUIRED",
  );
  assert.equal(
    preflight.recovery.codeRollbackDoesNotUndoData,
    true,
    "NODE_DATA_RECOVERY_REQUIRED",
  );
  for (const key of [
    "backupRef",
    "restoreRef",
    "rollbackRef",
    "mutationInventoryRef",
  ])
    assert.ok(
      nonempty(preflight.recovery[key]),
      "NODE_RECOVERY_REFERENCE_REQUIRED",
    );
  return preflight;
}

export async function nodeRuntime(command) {
  const { readFileSync, writeFileSync, mkdtempSync, rmSync } =
    await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { execFileSync } = await import("node:child_process");
  const env = process.env,
    repo = "luizanunciostoca/touristic-digital-platform";
  assert.equal(env.GITHUB_REPOSITORY, repo, "NODE_REPOSITORY");
  const policy = JSON.parse(
    readFileSync("tooling/ci/staging-node-exception.json", "utf8"),
  );
  assert.equal(policy.enabled, true, "NODE_DISPATCH_DISABLED");
  assert.ok(policy.receiptActor, "NODE_ACTOR_POLICY_REQUIRED");
  const api = async (path, { method = "GET", body } = {}) => {
    const response = await fetch(
      "https://api.github.com/repos/" + repo + "/" + path,
      {
        method,
        headers: {
          Authorization: "Bearer " + env.GH_TOKEN,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(30000),
      },
    );
    if (!response.ok) throw Error("GITHUB_API_HTTP_" + response.status);
    return response.json();
  };
  const pages = async (path, key) => {
    const items = [];
    for (let page = 1; page <= 100; page++) {
      const data = await api(
        path + (path.includes("?") ? "&" : "?") + "per_page=100&page=" + page,
      );
      const values = key ? data[key] : data;
      assert.ok(Array.isArray(values), "GITHUB_LIST_INVALID");
      items.push(...values);
      if (values.length < 100) return items;
    }
    throw Error("GITHUB_LIST_INCOMPLETE");
  };
  const fetchComment = (id) => api("issues/comments/" + id);
  const listComments = async () => ({
    complete: true,
    comments: await pages("issues/1072/comments"),
  });
  const treeSha = execFileSync("git", ["rev-parse", "HEAD^{tree}"], {
    encoding: "utf8",
  }).trim();
  const sourceSha = env.EXPECTED_SHA;
  assert.match(sourceSha ?? "", SHA, "NODE_EXPECTED_SHA");
  assert.equal(
    execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    sourceSha,
    "NODE_CHECKOUT_SHA",
  );
  const identity = {
    authorizationId: policy.authorizationId,
    requestId: env.REQUEST_ID,
    sourceSha,
    treeSha,
    runId: Number(env.GITHUB_RUN_ID),
    runAttempt: Number(env.GITHUB_RUN_ATTEMPT),
    callerRunId: Number(env.CALLER_RUN_ID),
    callerRunAttempt: Number(env.CALLER_RUN_ATTEMPT),
  };
  const readRun = async (id, path) => {
    const r = await api("actions/runs/" + id);
    assert.equal(r.id, id, "NODE_RUN_ID");
    assert.equal(r.path, path, "NODE_RUN_PATH");
    assert.equal(r.head_sha, sourceSha, "NODE_RUN_HEAD");
    assert.equal(r.event, "workflow_dispatch", "NODE_RUN_EVENT");
    return r;
  };
  const caller = await readRun(
    identity.callerRunId,
    ".github/workflows/final-release-acceptance.yml",
  );
  assert.equal(
    caller.run_attempt,
    identity.callerRunAttempt,
    "NODE_CALLER_ATTEMPT",
  );
  assert.equal(caller.head_branch, "main", "NODE_CALLER_BRANCH");
  const own = await readRun(
    identity.runId,
    ".github/workflows/staging-render-promotion.yml",
  );
  assert.equal(own.run_attempt, identity.runAttempt, "NODE_OWN_ATTEMPT");
  const now = () => new Date().toISOString();
  const currentCaller = async () => {
    const fresh = await readRun(
      identity.callerRunId,
      ".github/workflows/final-release-acceptance.yml",
    );
    assert.equal(
      fresh.run_attempt,
      identity.callerRunAttempt,
      "NODE_CALLER_ATTEMPT",
    );
    assert.equal(fresh.head_branch, "main", "NODE_CALLER_BRANCH");
    assert.equal(fresh.status, "in_progress", "NODE_CALLER_NOT_RUNNING");
    assert.equal(
      fresh.conclusion ?? null,
      null,
      "NODE_CALLER_ALREADY_FINISHED",
    );
    assert.equal((await api("commits/main")).sha, sourceSha, "NODE_MAIN_MOVED");
  };
  const poll = async (expected) => {
    for (let attempt = 0; attempt < 180; attempt++) {
      const listing = await listComments();
      const matches = listing.comments
        .filter(
          (c) =>
            c.user?.id === policy.receiptActor.id &&
            c.user?.login === policy.receiptActor.login &&
            (c.performed_via_github_app?.id ?? null) ===
              policy.receiptActor.appId &&
            c.body.startsWith(RECEIPT_PREFIX),
        )
        .map((c) => ({ c, p: JSON.parse(c.body.slice(RECEIPT_PREFIX.length)) }))
        .filter(
          (x) =>
            x.p.phase === expected.phase &&
            x.p.authorizationId === expected.authorizationId &&
            x.p.runId === expected.runId &&
            x.p.runAttempt === expected.runAttempt &&
            (expected.phase !== "post-deploy" ||
              x.p.verificationId ===
                `${expected.verification.runId}:${expected.verification.runAttempt}`),
        );
      assert.ok(matches.length <= 1, "NODE_RECEIPT_AMBIGUOUS");
      if (matches.length) {
        const c = matches[0].c,
          reference = {
            commentId: c.id,
            sha256: createHash("sha256").update(c.body, "utf8").digest("hex"),
          };
        return verifyConnectorReceipt(reference, {
          fetchComment,
          listComments,
          actor: policy.receiptActor,
          expected,
          now: now(),
        });
      }
      await new Promise((resolve) => setTimeout(resolve, 10000));
    }
    throw Error("NODE_RECEIPT_WAIT_TIMED_OUT");
  };
  if (command === "node-intent") {
    assert.equal(identity.runAttempt, 1, "NODE_DISPATCH_RERUN_FORBIDDEN");
    writeFileSync(
      "staging-node-intent.json",
      JSON.stringify(
        {
          ...identity,
          mode: NODE_MODE,
          serviceId: STAGING_SERVICE,
          createdAt: now(),
        },
        null,
        2,
      ),
    );
    return;
  }
  if (command === "node-verification-barrier") {
    await currentCaller();
    const jobKey = env.GITHUB_JOB;
    assert.ok(Object.hasOwn(VERIFICATION_JOBS, jobKey), "NODE_BARRIER_JOB_KEY");
    const jobs = await pages(
      `actions/runs/${identity.runId}/attempts/${identity.runAttempt}/jobs`,
      "jobs",
    );
    const matching = jobs.filter(
      (j) => j.name === VERIFICATION_JOBS[jobKey] && j.status === "in_progress",
    );
    assert.equal(matching.length, 1, "NODE_BARRIER_JOB_AMBIGUOUS");
    const job = await api("actions/jobs/" + matching[0].id);
    assert.equal(job.run_id, identity.runId, "NODE_BARRIER_JOB_RUN");
    if (Object.hasOwn(job, "run_attempt"))
      assert.equal(
        job.run_attempt,
        identity.runAttempt,
        "NODE_BARRIER_JOB_ATTEMPT",
      );
    assert.equal(job.head_sha, sourceSha, "NODE_BARRIER_JOB_HEAD");
    assert.equal(job.name, VERIFICATION_JOBS[jobKey], "NODE_BARRIER_JOB_NAME");
    assert.equal(job.status, "in_progress", "NODE_BARRIER_JOB_NOT_RUNNING");
    const recordedAt = now();
    assert.ok(
      time(job.started_at) <= time(recordedAt),
      "NODE_BARRIER_START_IN_FUTURE",
    );
    const marker = {
      schemaVersion: 1,
      kind: "STAGING_NODE_VERIFICATION_BARRIER",
      sourceSha,
      treeSha,
      authorizationId: identity.authorizationId,
      requestId: identity.requestId,
      verification: {
        runId: identity.runId,
        runAttempt: identity.runAttempt,
        callerRunId: identity.callerRunId,
        callerRunAttempt: identity.callerRunAttempt,
      },
      jobKey,
      jobName: job.name,
      jobId: job.id,
      jobStartedAt: job.started_at,
      recordedAt,
    };
    writeFileSync(
      "staging-node-verification-barrier.json",
      JSON.stringify(marker, null, 2),
      { flag: "wx" },
    );
    return;
  }
  if (command === "node-dispatch") {
    assert.equal(caller.status, "in_progress", "NODE_CALLER_NOT_RUNNING");
    assert.equal((await api("commits/main")).sha, sourceSha, "NODE_MAIN_MOVED");
    const receipt = await poll({ ...identity, phase: "pre-deploy" });
    validateNodePreflight(receipt.payload.preflight, sourceSha);
    assert.equal((await api("commits/main")).sha, sourceSha, "NODE_MAIN_MOVED");
    const url = canonicalNodeHook(
      env.RENDER_STAGING_DEPLOY_HOOK_URL,
      sourceSha,
    );
    const revalidateDispatch = async () => {
      await verifyConnectorReceipt(
        { commentId: receipt.commentId, sha256: receipt.sha256 },
        {
          fetchComment,
          listComments,
          actor: policy.receiptActor,
          expected: { ...identity, phase: "pre-deploy" },
          now: now(),
        },
      );
      await currentCaller();
    };
    await revalidateDispatch();
    const dispatchAt = now();
    const refStore = {
      getRef: async (ref) => {
        const response = await fetch(
          "https://api.github.com/repos/" + repo + "/git/ref/" + ref.slice(5),
          {
            headers: {
              Authorization: "Bearer " + env.GH_TOKEN,
              Accept: "application/vnd.github+json",
            },
            signal: AbortSignal.timeout(30000),
          },
        );
        if (response.status === 404) return null;
        if (!response.ok) throw Error("NODE_RESERVATION_READ_FAILED");
        const data = await response.json();
        return { sha: data.object.sha };
      },
      createRef: async (ref, sha) =>
        api("git/refs", { method: "POST", body: { ref, sha } }),
    };
    const intent = {
      ...identity,
      mode: NODE_MODE,
      dispatchAt,
      preReceiptId: receipt.commentId,
      preReceiptSha256: receipt.sha256,
      preflight: receipt.payload.preflight,
    };
    writeFileSync(
      "staging-node-dispatch.json",
      JSON.stringify({ ...intent, state: "NOT_SENT" }, null, 2),
    );
    try {
      const result = await dispatchNodeWithReservation({
        policy,
        receipt,
        expected: identity,
        now: dispatchAt,
        refStore,
        postHook: async () => {
          await revalidateDispatch();
          const r = await fetch(url, {
            method: "POST",
            redirect: "error",
            signal: AbortSignal.timeout(30000),
          });
          if (![200, 202].includes(r.status))
            throw Error("NODE_HOOK_REJECTED_OR_UNCERTAIN");
          const body = await r.json();
          return {
            deploymentId:
              body.deploy?.id ?? body.id ?? body.deployId ?? body.deploy_id,
          };
        },
      });
      writeFileSync(
        "staging-node-dispatch.json",
        JSON.stringify({ ...intent, ...result }, null, 2),
      );
    } catch {
      writeFileSync(
        "staging-node-dispatch.json",
        JSON.stringify(
          { ...intent, state: "OUTCOME_UNCERTAIN_RECONCILE" },
          null,
          2,
        ),
      );
      throw Error("NODE_DISPATCH_NOT_PROVEN_RECONCILE");
    }
    return;
  }
  if (command === "node-verify") {
    const runId = Number(env.DISPATCH_RUN_ID || identity.runId);
    const run = await readRun(
      runId,
      ".github/workflows/staging-render-promotion.yml",
    );
    const attempt = Number(env.DISPATCH_RUN_ATTEMPT || identity.runAttempt);
    assert.equal(run.run_attempt, attempt, "NODE_DISPATCH_RUN_ATTEMPT");
    const artifactName = "staging-node-dispatch-" + runId + "-" + attempt;
    const artifacts = (
      await pages("actions/runs/" + runId + "/artifacts", "artifacts")
    ).filter((a) => a.name === artifactName && !a.expired);
    assert.equal(artifacts.length, 1, "NODE_DISPATCH_ARTIFACT_AMBIGUOUS");
    const dir = mkdtempSync(join(tmpdir(), "node-dispatch-"));
    let dispatch, raw;
    try {
      execFileSync(
        "gh",
        [
          "run",
          "download",
          String(runId),
          "--repo",
          repo,
          "--name",
          artifactName,
          "--dir",
          dir,
        ],
        { stdio: ["ignore", "pipe", "pipe"], timeout: 60000 },
      );
      raw = readFileSync(join(dir, "staging-node-dispatch.json"));
      dispatch = JSON.parse(raw);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    assert.equal(
      dispatch.state,
      "DISPATCH_ACCEPTED_NOT_LIVE",
      "NODE_DISPATCH_UNCERTAIN_RECONCILE",
    );
    for (const key of ["sourceSha", "treeSha", "authorizationId", "requestId"])
      assert.equal(
        dispatch[key],
        identity[key],
        "NODE_DISPATCH_ARTIFACT_IDENTITY",
      );
    assert.equal(dispatch.runId, runId, "NODE_DISPATCH_RUN_ID");
    assert.equal(dispatch.runAttempt, attempt, "NODE_DISPATCH_ATTEMPT");
    const binding = {
      ...identity,
      runId,
      runAttempt: attempt,
      callerRunId: dispatch.callerRunId,
      callerRunAttempt: dispatch.callerRunAttempt,
    };
    const verification = {
      runId: identity.runId,
      runAttempt: identity.runAttempt,
      callerRunId: identity.callerRunId,
      callerRunAttempt: identity.callerRunAttempt,
    };
    await currentCaller();
    const barrierName = `staging-node-verification-barrier-${identity.runId}-${identity.runAttempt}`;
    const barrierArtifacts = (
      await pages("actions/runs/" + identity.runId + "/artifacts", "artifacts")
    ).filter((a) => a.name === barrierName);
    assert.equal(barrierArtifacts.length, 1, "NODE_BARRIER_ARTIFACT_AMBIGUOUS");
    const barrierDir = mkdtempSync(join(tmpdir(), "node-barrier-"));
    let barrierRaw;
    try {
      execFileSync(
        "gh",
        [
          "run",
          "download",
          String(identity.runId),
          "--repo",
          repo,
          "--name",
          barrierName,
          "--dir",
          barrierDir,
        ],
        { stdio: ["ignore", "pipe", "pipe"], timeout: 60000 },
      );
      barrierRaw = readFileSync(
        join(barrierDir, "staging-node-verification-barrier.json"),
      );
    } finally {
      rmSync(barrierDir, { recursive: true, force: true });
    }
    assert.equal(
      barrierRaw.toString(),
      readFileSync("staging-node-verification-barrier.json", "utf8"),
      "NODE_BARRIER_LOCAL_ARTIFACT_DRIFT",
    );
    const verificationBarrier = verificationBarrierBinding({
      raw: barrierRaw,
      artifact: barrierArtifacts[0],
      job: await api("actions/jobs/" + JSON.parse(barrierRaw).jobId),
      attemptJobs: await pages(
        `actions/runs/${identity.runId}/attempts/${identity.runAttempt}/jobs`,
        "jobs",
      ),
      expected: { ...identity, verification, jobKey: env.GITHUB_JOB },
      now: now(),
    });
    const post = await poll({
      ...binding,
      verification,
      verificationBarrier,
      phase: "post-deploy",
    });
    await currentCaller();
    const p = post.payload;
    assert.equal(
      p.preReceiptId,
      dispatch.preReceiptId,
      "NODE_POST_PRE_RECEIPT_ID",
    );
    assert.equal(
      p.preReceiptSha256,
      dispatch.preReceiptSha256,
      "NODE_POST_PRE_RECEIPT_DIGEST",
    );
    assert.equal(
      p.dispatchArtifactId,
      artifacts[0].id,
      "NODE_POST_ARTIFACT_ID",
    );
    assert.equal(
      p.dispatchSha256,
      createHash("sha256").update(raw).digest("hex"),
      "NODE_POST_DISPATCH_BYTES",
    );
    const pre = await verifyConnectorReceipt(
      { commentId: dispatch.preReceiptId, sha256: dispatch.preReceiptSha256 },
      {
        fetchComment,
        listComments,
        actor: policy.receiptActor,
        expected: { ...binding, phase: "pre-deploy" },
        now: dispatch.dispatchAt,
      },
    );
    validateNodePreflight(pre.payload.preflight, sourceSha);
    assert.equal(
      stable(pre.payload.preflight),
      stable(dispatch.preflight),
      "NODE_PREFLIGHT_ARTIFACT_DRIFT",
    );
    const observation = p.observation;
    validateExternalNodeObservation(
      observation,
      {
        ...binding,
        workflow: { ...binding, headSha: sourceSha },
        artifact: { id: artifacts[0].id, name: artifactName },
        artifactCount: 1,
        providerDeploymentId: dispatch.providerDeploymentId,
        reservationId: dispatch.reservationRef,
        reservationConsumed: false,
        configurationFingerprint:
          pre.payload.preflight.configurationFingerprint,
        dispatchAt: dispatch.dispatchAt,
        previousRuntime: pre.payload.preflight.previousRuntime,
        verificationBarrier,
        receiptObservedAt: p.observedAt,
      },
      { now: now() },
    );
    const reservation = await api(
      "git/ref/" + dispatch.reservationRef.slice(5),
    );
    assert.equal(reservation.object.sha, sourceSha, "NODE_RESERVATION_MOVED");
    await verifyConnectorReceipt(
      { commentId: post.commentId, sha256: post.sha256 },
      {
        fetchComment,
        listComments,
        actor: policy.receiptActor,
        expected: {
          ...binding,
          verification,
          verificationBarrier,
          phase: "post-deploy",
        },
        now: now(),
      },
    );
    await currentCaller();
    writeFileSync(
      "staging-deployment-evidence.json",
      JSON.stringify(
        {
          ...observation,
          evidenceStates: [
            "CI_VERIFIED",
            "CONNECTOR_OBSERVED",
            "RUNTIME_OBSERVED",
          ],
          postReceiptId: post.commentId,
          postReceiptSha256: post.sha256,
          preReceiptId: pre.commentId,
          preReceiptSha256: pre.sha256,
          dispatchArtifactId: artifacts[0].id,
          verification,
          verificationBarrier,
          verificationId: p.verificationId,
          verifiedAt: now(),
          verificationRunId: identity.runId,
          verificationRunAttempt: identity.runAttempt,
        },
        null,
        2,
      ),
    );
    return;
  }
  throw Error("NODE_RUNTIME_COMMAND_INVALID");
}
export async function verifyNodeAcceptanceRun({
  runId,
  sourceSha,
  treeSha,
  callerRunId,
  callerRunAttempt,
  readRun,
  listArtifacts,
  readEvidence,
  readBarrier,
  readJob,
  listJobs,
  fetchComment,
  listComments,
  actor,
  now,
  clock = () => now,
}) {
  assert.ok(integer(runId), "NODE_ACCEPTANCE_RUN_ID");
  const run = await readRun(runId);
  assert.equal(run.id, runId, "NODE_ACCEPTANCE_RUN_ID");
  assert.equal(
    run.path,
    ".github/workflows/staging-render-promotion.yml",
    "NODE_ACCEPTANCE_PATH",
  );
  assert.equal(run.event, "workflow_dispatch", "NODE_ACCEPTANCE_EVENT");
  assert.equal(run.head_sha, sourceSha, "NODE_ACCEPTANCE_SHA");
  assert.equal(run.status, "completed", "NODE_ACCEPTANCE_PENDING");
  assert.equal(run.conclusion, "success", "NODE_ACCEPTANCE_FAILED");
  const name = `staging-node-verified-${runId}-${run.run_attempt}`;
  const artifacts = await listArtifacts(runId);
  assert.equal(artifacts.complete, true, "NODE_ACCEPTANCE_ARTIFACT_LIST");
  const matches = artifacts.items.filter((a) => a.name === name);
  assert.equal(matches.length, 1, "NODE_ACCEPTANCE_ARTIFACT_AMBIGUOUS");
  assert.equal(matches[0].expired, false, "NODE_ACCEPTANCE_ARTIFACT_EXPIRED");
  const e = await readEvidence(runId, matches[0]);
  assert.equal(e.mode, NODE_MODE, "NODE_ACCEPTANCE_MODE");
  assert.equal(e.sourceSha, sourceSha, "NODE_ACCEPTANCE_SOURCE");
  assert.equal(e.treeSha, treeSha, "NODE_ACCEPTANCE_TREE");
  assert.equal(e.productionEligible, false, "NODE_ACCEPTANCE_PRODUCTION");
  assert.equal(e.pagesEligible, false, "NODE_ACCEPTANCE_PAGES");
  noOciIdentity(e);
  const verification = {
    runId,
    runAttempt: run.run_attempt,
    callerRunId,
    callerRunAttempt,
  };
  assert.deepEqual(
    e.verification,
    verification,
    "NODE_ACCEPTANCE_CURRENT_CALLER",
  );
  assert.equal(e.verificationRunId, runId, "NODE_ACCEPTANCE_VERIFIER");
  assert.equal(
    e.verificationRunAttempt,
    run.run_attempt,
    "NODE_ACCEPTANCE_VERIFIER_ATTEMPT",
  );
  assert.deepEqual(
    e.evidenceStates,
    ["CI_VERIFIED", "CONNECTOR_OBSERVED", "RUNTIME_OBSERVED"],
    "NODE_ACCEPTANCE_STATES",
  );
  const barrierName = `staging-node-verification-barrier-${runId}-${run.run_attempt}`;
  const barrierArtifacts = artifacts.items.filter(
    (a) => a.name === barrierName,
  );
  assert.equal(barrierArtifacts.length, 1, "NODE_BARRIER_ARTIFACT_AMBIGUOUS");
  const barrierRaw = await readBarrier(runId, barrierArtifacts[0]);
  const verificationBarrier = verificationBarrierBinding({
    raw: barrierRaw,
    artifact: barrierArtifacts[0],
    job: await readJob(JSON.parse(barrierRaw).jobId),
    attemptJobs: await listJobs(runId, run.run_attempt),
    expected: {
      sourceSha,
      treeSha,
      authorizationId: e.authorizationId,
      requestId: e.workflow.requestId,
      verification,
    },
    now: clock(),
  });
  assert.deepEqual(
    e.verificationBarrier,
    verificationBarrier,
    "NODE_ACCEPTANCE_BARRIER_DRIFT",
  );
  const expected = {
    verificationBarrier,
    phase: "post-deploy",
    authorizationId: e.authorizationId,
    requestId: e.workflow.requestId,
    sourceSha,
    treeSha,
    runId: e.workflow.runId,
    runAttempt: e.workflow.runAttempt,
    callerRunId: e.workflow.callerRunId,
    callerRunAttempt: e.workflow.callerRunAttempt,
    verification,
  };
  const post = await verifyConnectorReceipt(
    { commentId: e.postReceiptId, sha256: e.postReceiptSha256 },
    { fetchComment, listComments, actor, expected, now: clock() },
  );
  for (const [key, value] of Object.entries(post.payload.observation))
    assert.deepEqual(e[key], value, "NODE_ACCEPTANCE_OBSERVATION_DRIFT");
  for (const key of ["preReceiptId", "preReceiptSha256", "dispatchArtifactId"])
    assert.equal(e[key], post.payload[key], "NODE_ACCEPTANCE_RECEIPT_BINDING");
  assert.ok(
    time(now) - time(e.origin.observedAt) <= 300000 &&
      time(e.origin.observedAt) <= time(now),
    "NODE_ACCEPTANCE_STALE_PROVIDER",
  );
  assert.ok(
    time(now) - time(e.runtime.observedAt) <= 300000 &&
      time(e.runtime.observedAt) <= time(now),
    "NODE_ACCEPTANCE_STALE_RUNTIME",
  );
  const last = await readRun(runId);
  for (const key of [
    "id",
    "path",
    "event",
    "head_sha",
    "status",
    "conclusion",
    "run_attempt",
  ])
    assert.equal(last[key], run[key], "NODE_ACCEPTANCE_RUN_DRIFT");
  assert.ok(
    time(clock()) - time(post.payload.observedAt) <= 300000,
    "NODE_ACCEPTANCE_EXPIRED_DURING_READBACK",
  );
  for (const observed of [e.origin.observedAt, e.runtime.observedAt])
    assert.ok(
      time(clock()) - time(observed) <= 300000 &&
        time(observed) <= time(clock()),
      "NODE_ACCEPTANCE_OBSERVATION_EXPIRED_DURING_READBACK",
    );
  return {
    ...e,
    expectedSha: sourceSha,
    liveSha: e.runtime.releaseSha,
    acceptanceRunId: String(callerRunId),
    acceptanceRunAttempt: String(callerRunAttempt),
  };
}

async function nodeAcceptanceCli(id, sourceSha) {
  const { execFileSync } = await import("node:child_process");
  const { readFileSync, mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const repo = "luizanunciostoca/touristic-digital-platform";
  assert.equal(
    process.env.GITHUB_REPOSITORY,
    repo,
    "NODE_ACCEPTANCE_REPOSITORY",
  );
  const policy = JSON.parse(
    readFileSync("tooling/ci/staging-node-exception.json", "utf8"),
  );
  assert.equal(policy.enabled, true, "NODE_ACCEPTANCE_DISABLED");
  const gh = (args) =>
    execFileSync("gh", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60000,
      maxBuffer: 8 * 1024 * 1024,
    });
  const api = (path) => JSON.parse(gh(["api", "repos/" + repo + "/" + path]));
  const pages = (path) =>
    JSON.parse(
      gh(["api", "--paginate", "--slurp", "repos/" + repo + "/" + path]),
    );
  const result = await verifyNodeAcceptanceRun({
    runId: Number(id),
    sourceSha,
    treeSha: execFileSync("git", ["rev-parse", "HEAD^{tree}"], {
      encoding: "utf8",
    }).trim(),
    callerRunId: Number(process.env.GITHUB_RUN_ID),
    callerRunAttempt: Number(process.env.GITHUB_RUN_ATTEMPT),
    now: new Date().toISOString(),
    clock: () => new Date().toISOString(),
    actor: policy.receiptActor,
    readRun: async (id) => api("actions/runs/" + id),
    readJob: async (id) => api("actions/jobs/" + id),
    listJobs: async (id, attempt) =>
      pages(`actions/runs/${id}/attempts/${attempt}/jobs?per_page=100`).flatMap(
        (p) => p.jobs,
      ),
    readBarrier: async (id, artifact) => {
      const d = mkdtempSync(join(tmpdir(), "node-acceptance-barrier-"));
      try {
        gh([
          "run",
          "download",
          String(id),
          "--repo",
          repo,
          "--name",
          artifact.name,
          "--dir",
          d,
        ]);
        return readFileSync(join(d, "staging-node-verification-barrier.json"));
      } finally {
        rmSync(d, { recursive: true, force: true });
      }
    },
    fetchComment: async (id) => api("issues/comments/" + id),
    listComments: async () => ({
      complete: true,
      comments: pages("issues/1072/comments?per_page=100").flat(),
    }),
    listArtifacts: async (id) => ({
      complete: true,
      items: pages("actions/runs/" + id + "/artifacts?per_page=100").flatMap(
        (p) => p.artifacts,
      ),
    }),
    readEvidence: async (id, artifact) => {
      const d = mkdtempSync(join(tmpdir(), "node-current-acceptance-"));
      try {
        gh([
          "run",
          "download",
          String(id),
          "--repo",
          repo,
          "--name",
          artifact.name,
          "--dir",
          d,
        ]);
        return JSON.parse(
          readFileSync(join(d, "staging-deployment-evidence.json"), "utf8"),
        );
      } finally {
        rmSync(d, { recursive: true, force: true });
      }
    },
  });
  assert.equal(
    result.authorizationId,
    policy.authorizationId,
    "NODE_ACCEPTANCE_POLICY",
  );
  console.log(JSON.stringify(result));
}

const VERIFICATION_JOBS = Object.freeze({
  deploy: "staging / single authorized Node dispatch",
  verify: "staging / external provider and runtime verification",
});

export function verificationBarrierBinding({
  raw,
  artifact,
  job,
  attemptJobs,
  expected,
  now,
}) {
  const marker = JSON.parse(raw);
  assert.equal(marker.schemaVersion, 1, "NODE_BARRIER_SCHEMA");
  assert.equal(
    marker.kind,
    "STAGING_NODE_VERIFICATION_BARRIER",
    "NODE_BARRIER_KIND",
  );
  assert.equal(marker.sourceSha, expected.sourceSha, "NODE_BARRIER_SOURCE");
  assert.equal(marker.treeSha, expected.treeSha, "NODE_BARRIER_TREE");
  assert.equal(
    marker.authorizationId,
    expected.authorizationId,
    "NODE_BARRIER_AUTHORIZATION",
  );
  assert.equal(marker.requestId, expected.requestId, "NODE_BARRIER_REQUEST");
  assert.deepEqual(
    marker.verification,
    expected.verification,
    "NODE_BARRIER_VERIFICATION",
  );
  const v = marker.verification;
  for (const key of ["runId", "runAttempt", "callerRunId", "callerRunAttempt"])
    assert.ok(integer(v[key]), "NODE_BARRIER_RUN_IDENTITY");
  assert.ok(
    Object.hasOwn(VERIFICATION_JOBS, marker.jobKey),
    "NODE_BARRIER_JOB_KEY",
  );
  if (expected.jobKey)
    assert.equal(marker.jobKey, expected.jobKey, "NODE_BARRIER_CURRENT_JOB");
  assert.equal(
    marker.jobName,
    VERIFICATION_JOBS[marker.jobKey],
    "NODE_BARRIER_JOB_NAME",
  );
  assert.ok(integer(marker.jobId), "NODE_BARRIER_JOB_ID");
  assert.equal(job.id, marker.jobId, "NODE_BARRIER_JOB_ID");
  assert.equal(job.name, marker.jobName, "NODE_BARRIER_JOB_NAME");
  assert.equal(job.run_id, v.runId, "NODE_BARRIER_JOB_RUN");
  assert.ok(Array.isArray(attemptJobs), "NODE_BARRIER_ATTEMPT_JOBS_REQUIRED");
  const membership = attemptJobs.filter((j) => j.id === job.id);
  assert.equal(membership.length, 1, "NODE_BARRIER_ATTEMPT_MEMBERSHIP");
  for (const key of ["id", "run_id", "head_sha", "name", "started_at"])
    assert.equal(
      membership[0][key],
      job[key],
      "NODE_BARRIER_JOB_READBACK_DRIFT",
    );
  if (Object.hasOwn(job, "run_attempt"))
    assert.equal(job.run_attempt, v.runAttempt, "NODE_BARRIER_JOB_ATTEMPT");
  assert.equal(job.head_sha, marker.sourceSha, "NODE_BARRIER_JOB_HEAD");
  assert.equal(job.started_at, marker.jobStartedAt, "NODE_BARRIER_JOB_START");
  assert.ok(
    ["in_progress", "completed"].includes(job.status),
    "NODE_BARRIER_JOB_NOT_STARTED",
  );
  if (job.status === "completed")
    assert.equal(job.conclusion, "success", "NODE_BARRIER_JOB_FAILED");
  const recorded = time(marker.recordedAt);
  assert.ok(
    recorded >= time(job.started_at) && recorded <= time(now),
    "NODE_BARRIER_TIME_ORDER",
  );
  assert.ok(integer(artifact.id), "NODE_BARRIER_ARTIFACT_ID");
  assert.equal(
    artifact.name,
    `staging-node-verification-barrier-${v.runId}-${v.runAttempt}`,
    "NODE_BARRIER_ARTIFACT_NAME",
  );
  assert.equal(artifact.expired, false, "NODE_BARRIER_ARTIFACT_EXPIRED");
  assert.equal(artifact.workflow_run?.id, v.runId, "NODE_BARRIER_ARTIFACT_RUN");
  assert.equal(
    artifact.workflow_run?.head_sha,
    marker.sourceSha,
    "NODE_BARRIER_ARTIFACT_HEAD",
  );
  // GitHub artifact timestamps have second precision; marker clock has milliseconds.
  assert.ok(
    time(artifact.created_at) + 999 >= recorded,
    "NODE_BARRIER_ARTIFACT_PREDATES_MARKER",
  );
  return Object.freeze({
    artifactId: artifact.id,
    sha256: createHash("sha256").update(raw).digest("hex"),
    jobId: marker.jobId,
    recordedAt: marker.recordedAt,
  });
}

export function assertObservationAfterBarrier(
  observation,
  receiptObservedAt,
  barrier,
) {
  assert.ok(
    integer(barrier?.artifactId) && integer(barrier?.jobId),
    "NODE_VERIFICATION_BARRIER_REQUIRED",
  );
  assert.match(
    barrier?.sha256 ?? "",
    /^[a-f0-9]{64}$/u,
    "NODE_VERIFICATION_BARRIER_DIGEST",
  );
  const acquired = time(barrier.recordedAt);
  assert.ok(
    time(receiptObservedAt) >= acquired,
    "NODE_RECEIPT_PREDATES_VERIFICATION_BARRIER",
  );
  assert.ok(
    time(observation.origin.observedAt) >= acquired,
    "NODE_PROVIDER_OBSERVATION_PREDATES_VERIFICATION_BARRIER",
  );
  assert.ok(
    time(observation.runtime.observedAt) >= acquired,
    "NODE_RUNTIME_OBSERVATION_PREDATES_VERIFICATION_BARRIER",
  );
}
