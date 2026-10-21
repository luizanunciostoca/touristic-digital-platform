import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pathOwned } from "./claim-guard.mjs";
import { canonicalJson, validateChangeSetV2 } from "../mdctl/changeset-v2.mjs";
import { parseAuthorityLedger } from "../mdctl/event-ledger.mjs";

const SHA = /^[0-9a-f]{40}$/u;
const CLAIM_ID = /^MD-[A-Z0-9-]+$/u;
const RETIREMENT_REASONS = new Set([
  "MERGED_PR",
  "EXPIRED",
  "ORPHANED",
  "VOLUNTARY",
]);

const VOLUNTARY_MODEL = "OWNER_ATTESTED_CLOSED_WRITER_INVENTORY";
const digest = (value) => createHash("sha256").update(value).digest("hex");
const objectDigest = (value) => digest(canonicalJson(value));
const HEX256 = /^[0-9a-f]{64}$/u;
const metadataPaths = (id) => [
  ".github/morro-control/claims.json",
  ".github/morro-control/events.ndjson",
  `.morro/changesets/${id}.json`,
];

function comparableOwnerComment(comment) {
  // GitHub's individual-comment endpoint may include pin:null while its
  // list endpoint omits pin. Preserve every other field and non-null pin.
  return Object.hasOwn(comment, "pin") ? comment : { ...comment, pin: null };
}

function closed(value, keys) {
  assert.ok(
    value && typeof value === "object" && !Array.isArray(value),
    "VOLUNTARY_OBJECT_INVALID",
  );
  assert.deepEqual(
    Object.keys(value).sort(),
    keys.split(" ").sort(),
    "VOLUNTARY_FIELDS_INVALID",
  );
}

function text(value) {
  assert.ok(
    typeof value === "string" &&
      value.trim().length > 0 &&
      !/[\x00-\x1f\x7f]/u.test(value),
    "VOLUNTARY_STRING_INVALID",
  );
}

function timestamp(value) {
  const time = Date.parse(value);
  assert.ok(
    typeof value === "string" &&
      Number.isFinite(time) &&
      new Date(time).toISOString() === value,
    "VOLUNTARY_TIME_INVALID",
  );
  return time;
}

function githubTimestamp(value) {
  assert.ok(
    typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value),
    "VOLUNTARY_PROVIDER_TIME_INVALID",
  );
  const normalized = value.includes(".") ? value : value.replace("Z", ".000Z");
  return timestamp(normalized);
}

function bounded(value, min, max) {
  assert.ok(
    Array.isArray(value) && value.length >= min && value.length <= max,
    "VOLUNTARY_ARRAY_INVALID",
  );
}

function unique(values) {
  assert.equal(new Set(values).size, values.length, "VOLUNTARY_DUPLICATE");
}

function relativePath(value) {
  text(value);
  assert.ok(
    !value.includes("\\") &&
      value.split("/").every((part) => part && part !== "." && part !== "..") &&
      !/^[A-Za-z]:/u.test(value),
    "VOLUNTARY_PATH_INVALID",
  );
}

export function validateVoluntaryReleaseRequest(
  request,
  {
    claimId,
    claim,
    canonicalManifest,
    expectedBaseSha,
    canonicalText,
    retirementBranch,
    now = Date.now(),
  },
) {
  closed(
    request,
    "schemaVersion reason requestedReason decisionNonce repository claimId canonicalOwner executorIdentity controllerIdentity exactBaseSha canonicalClaimDigest retirementBranch preservedMaterialState expectedPaths transitionKind writerInventory writerInventoryDigest stopAckReceipts stopAckReceiptsDigest wipInventory wipInventoryDigest backupRefs snapshotAt anchorAcquisitionPr holdWritersStoppedUntilCanonicalRelease completionClaimed authorityModel",
  );
  assert.ok(
    Buffer.byteLength(JSON.stringify(request), "utf8") <= 65536,
    "VOLUNTARY_REQUEST_TOO_LARGE",
  );
  const expected = {
    schemaVersion: 1,
    reason: "VOLUNTARY",
    requestedReason: "VOLUNTARY",
    claimId,
    canonicalOwner: claim.owner,
    retirementBranch,
    exactBaseSha: expectedBaseSha,
    canonicalClaimDigest: objectDigest(claim),
    preservedMaterialState: canonicalManifest?.state,
    expectedPaths: metadataPaths(claimId),
    transitionKind: "SINGLETON_RETIRE_NO_ACQUIRE",
    authorityModel: VOLUNTARY_MODEL,
    holdWritersStoppedUntilCanonicalRelease: true,
    completionClaimed: false,
  };
  for (const [field, value] of Object.entries(expected))
    assert.deepEqual(
      request[field],
      value,
      `VOLUNTARY_REQUEST_${field.toUpperCase()}_MISMATCH`,
    );
  assert.match(claimId, CLAIM_ID);
  for (const field of [
    "decisionNonce",
    "canonicalOwner",
    "executorIdentity",
    "controllerIdentity",
    "retirementBranch",
  ])
    text(request[field]);
  assert.match(request.repository, /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u);
  assert.match(request.exactBaseSha, SHA);
  assert.match(request.canonicalClaimDigest, HEX256);
  assert.equal(canonicalManifest?.id, claimId);
  assert.ok(
    ["IMPLEMENTING", "LOCAL_PROVEN"].includes(canonicalManifest.state),
    "VOLUNTARY_MATERIAL_STATE_INVALID",
  );
  assert.ok(
    Number.isSafeInteger(request.anchorAcquisitionPr) &&
      request.anchorAcquisitionPr > 0,
  );
  assert.ok(Number.isFinite(now));
  const snapshot = timestamp(request.snapshotAt);
  assert.ok(
    snapshot <= now && now - snapshot <= 3600000,
    "VOLUNTARY_SNAPSHOT_STALE",
  );
  bounded(request.writerInventory, 1, 32);
  bounded(request.stopAckReceipts, 1, 32);
  bounded(request.wipInventory, 1, 512);
  bounded(request.backupRefs, 1, 16);
  for (const key of ["writerInventory", "stopAckReceipts", "wipInventory"]) {
    assert.match(request[key + "Digest"], HEX256);
    assert.equal(
      request[key + "Digest"],
      objectDigest(request[key]),
      "VOLUNTARY_INVENTORY_DIGEST_MISMATCH",
    );
  }
  for (const writer of request.writerInventory) {
    closed(
      writer,
      "writerId executorIdentity controllerIdentity sessionId jobId commandIds branch headSha treeSha",
    );
    for (const key of [
      "writerId",
      "executorIdentity",
      "controllerIdentity",
      "sessionId",
      "branch",
    ])
      text(writer[key]);
    if (writer.jobId !== null) text(writer.jobId);
    bounded(writer.commandIds, 0, 512);
    writer.commandIds.forEach(text);
    unique(writer.commandIds);
    assert.match(writer.headSha, SHA);
    assert.match(writer.treeSha, SHA);
  }
  const writers = request.writerInventory.map((writer) => writer.writerId);
  unique(writers);
  unique(request.stopAckReceipts.map((receipt) => receipt.writerId));
  assert.deepEqual(
    request.stopAckReceipts.map((receipt) => receipt.writerId).sort(),
    [...writers].sort(),
    "VOLUNTARY_ACK_SET_MISMATCH",
  );
  for (const receipt of request.stopAckReceipts) {
    closed(
      receipt,
      "writerId requestedAt acknowledgedAt drainedAt terminalState pendingCommands pendingChildren receiptRef receiptSha256",
    );
    const requested = timestamp(receipt.requestedAt),
      acknowledged = timestamp(receipt.acknowledgedAt),
      drained = timestamp(receipt.drainedAt);
    assert.ok(
      requested <= acknowledged &&
        acknowledged <= drained &&
        drained <= snapshot &&
        now - drained <= 3600000,
      "VOLUNTARY_DRAIN_TIME_INVALID",
    );
    assert.equal(receipt.terminalState, "STOPPED");
    assert.equal(receipt.pendingCommands, 0);
    assert.equal(receipt.pendingChildren, 0);
    assert.match(receipt.receiptSha256, HEX256);
    const prefix = `https://api.github.com/repos/${request.repository}/git/blobs/`;
    assert.ok(
      typeof receipt.receiptRef === "string" &&
        receipt.receiptRef.startsWith(prefix) &&
        SHA.test(receipt.receiptRef.slice(prefix.length)),
      "VOLUNTARY_RECEIPT_REF_INVALID",
    );
  }
  unique(request.wipInventory.map((file) => file.path));
  for (const file of request.wipInventory) {
    closed(file, "path modeGit status blobSha sha256 bytes backupIndex");
    relativePath(file.path);
    assert.ok(["tracked", "untracked", "deleted"].includes(file.status));
    if (file.status === "deleted") {
      assert.equal(file.modeGit, null);
      assert.equal(file.blobSha, null);
      assert.equal(file.sha256, null);
      assert.equal(file.bytes, 0);
    } else {
      assert.ok(["100644", "100755", "120000"].includes(file.modeGit));
      assert.match(file.blobSha, SHA);
      assert.match(file.sha256, HEX256);
    }
    assert.ok(Number.isSafeInteger(file.bytes) && file.bytes >= 0);
    assert.ok(
      Number.isSafeInteger(file.backupIndex) &&
        file.backupIndex >= 0 &&
        file.backupIndex < request.backupRefs.length,
    );
    assert.ok(
      !file.path.split("/").includes("node_modules"),
      "VOLUNTARY_DEPENDENCY_BYTES_FORBIDDEN",
    );
  }
  unique(
    request.backupRefs.map((backup) => `${backup.repository}:${backup.ref}`),
  );
  for (const backup of request.backupRefs) {
    closed(backup, "repository ref commitSha treeSha writerId");
    assert.ok(
      writers.includes(backup.writerId),
      "VOLUNTARY_BACKUP_WRITER_UNKNOWN",
    );
    assert.equal(backup.repository, request.repository);
    assert.ok(
      typeof backup.ref === "string" &&
        /^refs\/(heads|tags)\//u.test(backup.ref) &&
        !/[\s~^:?*\[\\]|\.\.|@\{|\/\//u.test(backup.ref) &&
        !backup.ref.endsWith("/") &&
        !backup.ref.endsWith(".") &&
        backup.ref
          .split("/")
          .every(
            (part) => part && !part.startsWith(".") && !part.endsWith(".lock"),
          ),
      "VOLUNTARY_BACKUP_REF_INVALID",
    );
    assert.match(backup.commitSha, SHA);
    assert.match(backup.treeSha, SHA);
  }
  assert.deepEqual(
    [...new Set(request.backupRefs.map((backup) => backup.writerId))].sort(),
    [...writers].sort(),
    "VOLUNTARY_WRITER_BACKUP_MISSING",
  );
  assert.equal(
    request.writerInventory.some(
      (writer) =>
        writer.executorIdentity === request.executorIdentity &&
        writer.controllerIdentity === request.controllerIdentity,
    ),
    true,
    "VOLUNTARY_RELEASE_EXECUTOR_NOT_ENUMERATED",
  );
  for (const event of parseAuthorityLedger(canonicalText)) {
    assert.notEqual(
      event.payload?.decisionRequest?.decisionNonce,
      request.decisionNonce,
      "VOLUNTARY_NONCE_REPLAY",
    );
  }
  return request;
}

export function voluntaryRetirementPayload(evidence) {
  assert.equal(evidence?.reason, "VOLUNTARY");
  assert.equal(evidence.authorityModel, VOLUNTARY_MODEL);
  assert.equal(evidence.requestedReason, "VOLUNTARY");
  assert.equal(evidence.requestDigest, objectDigest(evidence.decisionRequest));
  const request = evidence.decisionRequest;
  assert.equal(
    evidence.ownerDecision.bodySha256,
    digest(
      `APPROVED_VOLUNTARY_RELEASE:${request.claimId}:${evidence.requestDigest}:${request.decisionNonce}:${request.exactBaseSha}`,
    ),
    "VOLUNTARY_OWNER_MARKER_MISMATCH",
  );
  return {
    reason: "VOLUNTARY",
    requestedReason: "VOLUNTARY",
    decisionRequest: evidence.decisionRequest,
    requestDigest: evidence.requestDigest,
    ownerDecision: evidence.ownerDecision,
    authorityModel: VOLUNTARY_MODEL,
  };
}

function assertRegistry(registry, code) {
  assert.equal(registry?.registryAuthority, "ORCHESTRATOR", code);
  assert.ok(
    registry.claims &&
      typeof registry.claims === "object" &&
      !Array.isArray(registry.claims),
    code,
  );
}

export function removedClaimIds(baseRegistry, candidateRegistry) {
  assertRegistry(baseRegistry, "BASE_REGISTRY_INVALID");
  assertRegistry(candidateRegistry, "CANDIDATE_REGISTRY_INVALID");
  return Object.keys(baseRegistry.claims)
    .filter((id) => !(id in candidateRegistry.claims))
    .sort();
}

export function addedClaimIds(baseRegistry, candidateRegistry) {
  assertRegistry(baseRegistry, "BASE_REGISTRY_INVALID");
  assertRegistry(candidateRegistry, "CANDIDATE_REGISTRY_INVALID");
  return Object.keys(candidateRegistry.claims)
    .filter((id) => !(id in baseRegistry.claims))
    .sort();
}

export function assertCanonicalRetirementTransition(
  baseRegistry,
  candidateRegistry,
) {
  const removed = removedClaimIds(baseRegistry, candidateRegistry);
  const added = addedClaimIds(baseRegistry, candidateRegistry);
  assert.equal(
    removed.length,
    1,
    "CLAIM_RETIREMENT_EXACTLY_ONE_REMOVAL_REQUIRED",
  );
  assert.equal(added.length, 0, "CLAIM_ADDITION_FORBIDDEN_DURING_RETIREMENT");
  return { removed, added };
}

export function validateCandidateRetirementManifest(
  manifest,
  { claimId, expectedBaseSha, canonicalManifest, evidence },
) {
  assert.ok(
    manifest && typeof manifest === "object" && !Array.isArray(manifest),
    "CLAIM_RETIREMENT_MANIFEST_INVALID",
  );
  assert.equal(manifest.id, claimId, "CLAIM_RETIREMENT_MANIFEST_ID_MISMATCH");
  assert.equal(
    canonicalManifest?.id,
    claimId,
    "CLAIM_RETIREMENT_CANONICAL_MANIFEST_INVALID",
  );
  assert.ok(
    RETIREMENT_REASONS.has(evidence?.reason),
    "CLAIM_RETIREMENT_REASON_INVALID",
  );
  assert.equal(
    manifest.state,
    evidence.reason === "MERGED_PR" ? "MERGED" : canonicalManifest.state,
    "CLAIM_RETIREMENT_IMPLEMENTATION_STATE_INVALID",
  );
  const envelope = ({ baseSha, branch, state, ...authority }) => authority;
  assert.deepEqual(
    envelope(manifest),
    envelope(canonicalManifest),
    "CLAIM_RETIREMENT_AUTHORITY_DIVERGED",
  );
  assert.equal(
    manifest.baseSha,
    expectedBaseSha,
    "CLAIM_RETIREMENT_MANIFEST_BASE_MISMATCH",
  );
  return manifest;
}

export function validateClaimRetirements({
  baseRegistry,
  candidateRegistry,
  evidenceById = {},
  now = Date.now(),
}) {
  assertRegistry(baseRegistry, "BASE_REGISTRY_INVALID");
  assertRegistry(candidateRegistry, "CANDIDATE_REGISTRY_INVALID");
  assert.ok(Number.isFinite(now), "CLAIM_RETIREMENT_NOW_INVALID");

  const { removed } = assertCanonicalRetirementTransition(
    baseRegistry,
    candidateRegistry,
  );

  for (const id of Object.keys(baseRegistry.claims)) {
    if (removed.includes(id)) continue;
    if (!(id in candidateRegistry.claims)) continue;
    assert.deepEqual(
      candidateRegistry.claims[id],
      baseRegistry.claims[id],
      "SURVIVING_CLAIM_MUTATION_FORBIDDEN_DURING_RETIREMENT",
    );
  }

  const retirements = removed.map((id) => {
    assert.match(id, CLAIM_ID, "CLAIM_RETIREMENT_ID_INVALID");
    const claim = baseRegistry.claims[id];
    const evidence = evidenceById[id];
    assert.ok(evidence, "CLAIM_RETIREMENT_EVIDENCE_MISSING");
    assert.equal(evidence.id, id, "CLAIM_RETIREMENT_EVIDENCE_ID_MISMATCH");
    assert.equal(
      evidence.branch,
      claim.branch,
      "CLAIM_RETIREMENT_BRANCH_MISMATCH",
    );
    assert.equal(
      evidence.baseSha,
      claim.baseSha,
      "CLAIM_RETIREMENT_BASE_MISMATCH",
    );
    assert.ok(
      RETIREMENT_REASONS.has(evidence.reason),
      "CLAIM_RETIREMENT_REASON_INVALID",
    );

    if (evidence.reason === "EXPIRED") {
      const expiresAt = Date.parse(claim.expiresAt);
      assert.ok(Number.isFinite(expiresAt), "CLAIM_RETIREMENT_EXPIRY_INVALID");
      assert.ok(expiresAt <= now, "CLAIM_RETIREMENT_NOT_EXPIRED");
    } else if (evidence.reason === "MERGED_PR") {
      assert.ok(
        Array.isArray(evidence.materialPaths) &&
          evidence.materialPaths.length > 0 &&
          evidence.materialPaths.every((path) =>
            isMaterialClaimPath(path, claim),
          ),
        "CLAIM_RETIREMENT_MATERIAL_IMPLEMENTATION_MISSING",
      );
      assert.ok(
        Number.isInteger(evidence.prNumber) && evidence.prNumber > 0,
        "CLAIM_RETIREMENT_PR_INVALID",
      );
      assert.match(
        evidence.mergeSha ?? "",
        SHA,
        "CLAIM_RETIREMENT_MERGE_SHA_INVALID",
      );
      assert.equal(
        evidence.mergeShaAncestorOfBase,
        true,
        "CLAIM_RETIREMENT_MERGE_NOT_ANCESTOR",
      );
      assert.equal(
        evidence.claimBaseAncestorOfMerge,
        true,
        "CLAIM_RETIREMENT_CLAIM_BASE_NOT_ANCESTOR",
      );
      assert.equal(
        evidence.historicalManifestMatches,
        true,
        "CLAIM_RETIREMENT_HISTORICAL_MANIFEST_MISMATCH",
      );
    } else if (evidence.reason === "VOLUNTARY") {
      assert.equal(
        evidence.requestedReason,
        "VOLUNTARY",
        "VOLUNTARY_EXPLICIT_REASON_REQUIRED",
      );
      assert.equal(evidence.authorityModel, VOLUNTARY_MODEL);
      assert.equal(
        evidence.requestDigest,
        objectDigest(evidence.decisionRequest),
      );
      assert.ok(
        evidence.ownerDecision && evidence.observedAt,
        "VOLUNTARY_LIVE_EVIDENCE_REQUIRED",
      );
      assert.equal(
        evidence.decisionRequest.canonicalClaimDigest,
        objectDigest(claim),
      );
    } else {
      assert.equal(
        evidence.branchExists,
        false,
        "CLAIM_RETIREMENT_ORPHAN_BRANCH_EXISTS",
      );
      assert.equal(
        evidence.pullRequestCount,
        0,
        "CLAIM_RETIREMENT_ORPHAN_PR_EXISTS",
      );
    }

    return evidence;
  });

  return {
    removedClaims: removed,
    retirements,
  };
}

export function validateRetirementEvents({
  canonicalText,
  candidateText,
  claimId,
  expectedBaseSha,
  evidence,
  requestedReason,
}) {
  assert.ok(
    RETIREMENT_REASONS.has(evidence?.reason),
    "CLAIM_RETIREMENT_REASON_INVALID",
  );
  assert.ok(
    candidateText.startsWith(canonicalText),
    "CLAIM_RETIREMENT_LEDGER_HISTORY_MUTATED",
  );
  const canonical = parseAuthorityLedger(canonicalText);
  const candidate = parseAuthorityLedger(candidateText);
  assert.deepEqual(
    candidate.slice(0, canonical.length),
    canonical,
    "CLAIM_RETIREMENT_LEDGER_HISTORY_MUTATED",
  );
  const appended = candidate.slice(canonical.length);
  if (requestedReason !== undefined) {
    if (requestedReason === "VOLUNTARY") {
      assert.equal(
        evidence.reason,
        "VOLUNTARY",
        "CLAIM_RETIREMENT_REQUEST_REASON_MISMATCH",
      );
      assert.equal(appended.length, 1, "VOLUNTARY_SINGLE_EVENT_REQUIRED");
      assert.equal(appended[0].payloadVersion, 1);
      assert.deepEqual(
        appended[0].payload,
        voluntaryRetirementPayload(evidence),
        "VOLUNTARY_EVENT_PAYLOAD_MISMATCH",
      );
      assert.ok(
        timestamp(evidence.ownerDecision.createdAt) <=
          timestamp(appended[0].observedAt),
        "VOLUNTARY_EVENT_BEFORE_CONSENT",
      );
    } else {
      assert.equal(
        requestedReason,
        "EXPIRED",
        "CLAIM_RETIREMENT_REQUEST_INVALID",
      );
      assert.equal(
        evidence.reason,
        "EXPIRED",
        "CLAIM_RETIREMENT_REQUEST_REASON_MISMATCH",
      );
      for (const event of appended) {
        assert.equal(
          event.payloadVersion,
          1,
          "CLAIM_RETIREMENT_REQUEST_VERSION_INVALID",
        );
        assert.deepEqual(
          event.payload,
          { reason: "EXPIRED", requestedReason: "EXPIRED" },
          "CLAIM_RETIREMENT_REQUEST_PAYLOAD_INVALID",
        );
      }
    }
  } else {
    assert.ok(
      appended.every(
        (event) => !Object.hasOwn(event.payload, "requestedReason"),
      ),
      "CLAIM_RETIREMENT_UNDECLARED_REQUEST",
    );
  }
  const material = evidence.reason === "MERGED_PR";
  assert.deepEqual(
    appended.map((event) => event.eventType),
    material ? ["MERGED", "CLAIM_RELEASED"] : ["CLAIM_RELEASED"],
    "CLAIM_RETIREMENT_EVENT_TYPES_INVALID",
  );
  for (const event of appended) {
    assert.equal(
      event.entity,
      claimId,
      "CLAIM_RETIREMENT_EVENT_ENTITY_INVALID",
    );
    assert.equal(
      event.actor,
      "ORCHESTRATOR",
      "CLAIM_RETIREMENT_EVENT_ACTOR_INVALID",
    );
    assert.equal(
      event.sourceSha,
      material ? evidence.mergeSha : expectedBaseSha,
      "CLAIM_RETIREMENT_EVENT_SOURCE_INVALID",
    );
    if (material) {
      assert.equal(
        event.payload.pullRequest,
        evidence.prNumber,
        "CLAIM_RETIREMENT_EVENT_PR_INVALID",
      );
      assert.equal(
        event.payload.mergeSha,
        evidence.mergeSha,
        "CLAIM_RETIREMENT_EVENT_MERGE_INVALID",
      );
    } else {
      assert.equal(
        event.payload.reason,
        evidence.reason,
        "CLAIM_RETIREMENT_EVENT_REASON_INVALID",
      );
    }
  }
  return appended;
}

export function validateExplicitRetirementTime({
  claim,
  observedAt,
  now = Date.now(),
}) {
  const expiry = Date.parse(claim?.expiresAt);
  assert.ok(
    typeof claim?.expiresAt === "string" && Number.isFinite(expiry),
    "CLAIM_RETIREMENT_EXPIRY_INVALID",
  );
  assert.ok(Number.isFinite(now), "CLAIM_RETIREMENT_NOW_INVALID");
  const observed = Date.parse(observedAt);
  assert.ok(
    typeof observedAt === "string" &&
      Number.isFinite(observed) &&
      new Date(observed).toISOString() === observedAt,
    "CLAIM_RETIREMENT_OBSERVATION_INVALID",
  );
  assert.ok(expiry <= observed, "CLAIM_RETIREMENT_EVENT_BEFORE_EXPIRY");
  assert.ok(observed <= now, "CLAIM_RETIREMENT_EVENT_IN_FUTURE");
}

export function deriveExplicitRetirementRequest({
  canonicalText,
  candidateText,
  claimId,
  expectedBaseSha,
  claim,
  now = Date.now(),
}) {
  assert.ok(
    candidateText.startsWith(canonicalText),
    "CLAIM_RETIREMENT_LEDGER_HISTORY_MUTATED",
  );
  const canonical = parseAuthorityLedger(canonicalText);
  const candidate = parseAuthorityLedger(candidateText);
  const appended = candidate.slice(canonical.length);
  if (
    !appended.some((event) => Object.hasOwn(event.payload, "requestedReason"))
  )
    return undefined;
  if (appended.some((event) => event.payload.requestedReason === "VOLUNTARY")) {
    assert.equal(appended.length, 1, "VOLUNTARY_SINGLE_EVENT_REQUIRED");
    const event = appended[0];
    const request = event.payload.decisionRequest;
    assert.equal(event.eventType, "CLAIM_RELEASED");
    assert.equal(event.entity, claimId);
    assert.equal(event.actor, "ORCHESTRATOR");
    assert.equal(event.sourceSha, expectedBaseSha);
    assert.equal(event.payload.reason, "VOLUNTARY");
    assert.equal(request?.claimId, claimId);
    assert.equal(request?.exactBaseSha, expectedBaseSha);
    assert.equal(
      event.payload.requestDigest,
      objectDigest(request),
      "VOLUNTARY_REQUEST_DIGEST_MISMATCH",
    );
    const observed = timestamp(event.observedAt);
    assert.ok(
      timestamp(request.snapshotAt) <= observed && observed <= now,
      "VOLUNTARY_EVENT_TIME_INVALID",
    );
    return "VOLUNTARY";
  }
  validateRetirementEvents({
    canonicalText,
    candidateText,
    claimId,
    expectedBaseSha,
    evidence: { reason: "EXPIRED" },
    requestedReason: "EXPIRED",
  });
  validateExplicitRetirementTime({
    claim,
    observedAt: appended[0].observedAt,
    now,
  });
  return "EXPIRED";
}

function git(root, args) {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
  }).trim();
}

function isAncestor(root, ancestor, descendant) {
  try {
    execFileSync(
      "git",
      ["-C", root, "merge-base", "--is-ancestor", ancestor, descendant],
      { stdio: "ignore" },
    );
    return true;
  } catch {
    return false;
  }
}

async function githubJson(path, { token, fetchImpl = fetch } = {}) {
  assert.ok(token, "GITHUB_TOKEN_REQUIRED");
  const response = await fetchImpl(`https://api.github.com${path}`, {
    redirect: "error",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal: AbortSignal.timeout(15_000),
  });
  assert.equal(response.ok, true, "GITHUB_EVIDENCE_REQUEST_FAILED");
  return response.json();
}

async function allPullRequests(repository, branch, options) {
  const [owner] = repository.split("/");
  const results = [];
  for (let page = 1; page <= 10; page += 1) {
    const query = new URLSearchParams({
      state: "all",
      head: `${owner}:${branch}`,
      per_page: "100",
      page: String(page),
    });
    const value = await githubJson(
      `/repos/${repository}/pulls?${query.toString()}`,
      options,
    );
    assert.ok(Array.isArray(value), "GITHUB_PULL_RESPONSE_INVALID");
    results.push(...value);
    if (value.length < 100) return results;
  }
  throw new Error("GITHUB_PULL_PAGINATION_LIMIT");
}

function isMaterialClaimPath(path, claim) {
  return (
    typeof path === "string" &&
    ![
      ".github/morro-control/claims.json",
      ".github/morro-control/events.ndjson",
    ].includes(path) &&
    !path.startsWith(".morro/changesets/") &&
    (claim.paths ?? []).some((pattern) => pathOwned(path, pattern))
  );
}

async function materialPathsForPull(repository, number, claim, options) {
  const paths = [];
  for (let page = 1; page <= 30; page += 1) {
    const files = await githubJson(
      "/repos/" +
        repository +
        "/pulls/" +
        number +
        "/files?per_page=100&page=" +
        page,
      options,
    );
    assert.ok(Array.isArray(files), "GITHUB_PULL_FILES_RESPONSE_INVALID");
    for (const file of files) {
      assert.equal(
        typeof file?.filename,
        "string",
        "GITHUB_PULL_FILE_PATH_INVALID",
      );
      for (const path of [file.filename, file.previous_filename].filter(
        Boolean,
      )) {
        if (isMaterialClaimPath(path, claim)) paths.push(path);
      }
    }
    if (files.length < 100) return [...new Set(paths)].sort();
  }
  throw new Error("GITHUB_PULL_FILES_PAGINATION_LIMIT");
}

async function mergedEvidence(claim, repository, expectedBaseSha, options) {
  const pulls = await allPullRequests(repository, claim.branch, options);
  const merged = pulls
    .filter(
      (pr) =>
        pr?.state === "closed" &&
        pr?.head?.ref === claim.branch &&
        pr?.head?.repo?.full_name === repository &&
        pr?.base?.ref === "main" &&
        pr?.base?.repo?.full_name === repository &&
        Number.isInteger(pr?.number) &&
        Number.isFinite(Date.parse(pr?.merged_at)) &&
        SHA.test(pr?.merge_commit_sha ?? ""),
    )
    .sort((a, b) => Date.parse(b.merged_at) - Date.parse(a.merged_at));

  for (const pr of merged) {
    const materialPaths = await materialPathsForPull(
      repository,
      pr.number,
      claim,
      options,
    );
    if (materialPaths.length === 0) continue;
    const mergeSha = pr.merge_commit_sha;
    let ancestor = mergeSha === expectedBaseSha;
    if (!ancestor) {
      const compare = await githubJson(
        "/repos/" +
          repository +
          "/compare/" +
          mergeSha +
          "..." +
          expectedBaseSha,
        options,
      );
      ancestor =
        ["ahead", "identical"].includes(compare?.status) &&
        compare?.base_commit?.sha === mergeSha &&
        compare?.merge_base_commit?.sha === mergeSha;
    }
    assert.equal(ancestor, true, "CLAIM_RETIREMENT_MERGE_NOT_ANCESTOR");
    return {
      pulls,
      evidence: {
        id: null,
        reason: "MERGED_PR",
        branch: claim.branch,
        baseSha: claim.baseSha,
        prNumber: pr.number,
        mergeSha,
        mergeShaAncestorOfBase: true,
        materialPaths,
      },
    };
  }
  return { pulls, evidence: null };
}

async function orphanEvidence(claim, repository, pulls, options) {
  if (pulls.length !== 0) return null;
  const refs = await githubJson(
    `/repos/${repository}/git/matching-refs/heads/${encodeURIComponent(
      claim.branch,
    )}`,
    options,
  );
  assert.ok(Array.isArray(refs), "GITHUB_REF_RESPONSE_INVALID");
  const exact = refs.filter((ref) => ref?.ref === `refs/heads/${claim.branch}`);
  if (exact.length !== 0) return null;
  return {
    id: null,
    reason: "ORPHANED",
    branch: claim.branch,
    baseSha: claim.baseSha,
    branchExists: false,
    pullRequestCount: 0,
  };
}

function immutable(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) immutable(child);
    Object.freeze(value);
  }
  return value;
}

function blobJson(bytes) {
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

function decodedBlob(value, expectedSha) {
  assert.equal(value?.encoding, "base64", "VOLUNTARY_BLOB_ENCODING_INVALID");
  assert.match(expectedSha, SHA);
  assert.equal(value.sha, expectedSha, "VOLUNTARY_BLOB_ID_MISMATCH");
  assert.ok(
    typeof value.content === "string" &&
      /^[A-Za-z0-9+/=\r\n]*$/u.test(value.content),
    "VOLUNTARY_BLOB_CONTENT_INVALID",
  );
  const encoded = value.content.replace(/[\r\n]/gu, "");
  const bytes = Buffer.from(encoded, "base64");
  assert.equal(
    bytes.toString("base64"),
    encoded,
    "VOLUNTARY_BLOB_ENCODING_INVALID",
  );
  assert.equal(value.size, bytes.length, "VOLUNTARY_BLOB_SIZE_MISMATCH");
  const sha = createHash("sha1")
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest("hex");
  assert.equal(sha, expectedSha, "VOLUNTARY_BLOB_HASH_MISMATCH");
  return bytes;
}

async function verifyVoluntaryBackups(request, claim, options) {
  const repoPath = `/repos/${request.repository}`;
  const commitTrees = new Map();
  const readCommitTree = async (sha, expectedTree) => {
    if (!commitTrees.has(sha)) {
      const commit = await githubJson(
        `${repoPath}/git/commits/${sha}`,
        options,
      );
      assert.equal(commit.sha, sha);
      assert.match(commit.tree?.sha, SHA);
      const tree = await githubJson(
        `${repoPath}/git/trees/${commit.tree.sha}?recursive=1`,
        options,
      );
      assert.equal(tree.sha, commit.tree.sha);
      assert.equal(tree.truncated, false, "VOLUNTARY_TREE_TRUNCATED");
      bounded(tree.tree, 0, 100000);
      unique(tree.tree.map((entry) => entry.path));
      for (const entry of tree.tree) relativePath(entry.path);
      commitTrees.set(sha, {
        treeSha: commit.tree.sha,
        entries: new Map(
          tree.tree
            .filter((entry) => entry.type !== "tree")
            .map((entry) => [entry.path, entry]),
        ),
      });
    }
    const tree = commitTrees.get(sha);
    if (expectedTree !== undefined)
      assert.equal(
        tree.treeSha,
        expectedTree,
        "VOLUNTARY_BACKUP_TREE_MISMATCH",
      );
    return tree.entries;
  };
  const canonicalTree = await readCommitTree(claim.baseSha);
  const owned = (path) =>
    path === `.morro/changesets/${request.claimId}.json` ||
    claim.paths.some((pattern) => pathOwned(path, pattern));
  const readRef = async (backup) => {
    const ref = await githubJson(
      `${repoPath}/git/ref/${backup.ref.slice(5).split("/").map(encodeURIComponent).join("/")}`,
      options,
    );
    assert.equal(ref.ref, backup.ref, "VOLUNTARY_BACKUP_REF_MISMATCH");
    assert.equal(ref.object?.type, "commit", "VOLUNTARY_BACKUP_NOT_COMMIT");
    assert.equal(
      ref.object?.sha,
      backup.commitSha,
      "VOLUNTARY_BACKUP_REF_MOVED",
    );
  };
  for (const [index, backup] of request.backupRefs.entries()) {
    await readRef(backup);
    const writer = request.writerInventory.find(
      (writer) => writer.writerId === backup.writerId,
    );
    const head = await readCommitTree(writer.headSha, writer.treeSha);
    const snapshot = await readCommitTree(backup.commitSha, backup.treeSha);
    if (writer.headSha !== backup.commitSha) {
      const ancestry = await githubJson(
        `${repoPath}/compare/${writer.headSha}...${backup.commitSha}`,
        options,
      );
      assert.ok(
        ["ahead", "identical"].includes(ancestry.status) &&
          ancestry.base_commit?.sha === writer.headSha &&
          ancestry.merge_base_commit?.sha === writer.headSha,
        "VOLUNTARY_BACKUP_NOT_DESCENDANT",
      );
    }

    const files = request.wipInventory.filter(
      (file) => file.backupIndex === index,
    );
    const covered = new Set(files.map((file) => file.path));
    const same = (a, b) =>
      a?.sha === b?.sha && a?.mode === b?.mode && a?.type === b?.type;
    for (const path of new Set([
      ...canonicalTree.keys(),
      ...head.keys(),
      ...snapshot.keys(),
    ])) {
      if (
        owned(path) &&
        (!same(canonicalTree.get(path), head.get(path)) ||
          !same(head.get(path), snapshot.get(path)))
      )
        assert.ok(covered.has(path), "VOLUNTARY_WIP_PATH_OMITTED");
    }
    for (const file of files) {
      if (file.status === "deleted") {
        assert.ok(
          canonicalTree.has(file.path) || head.has(file.path),
          "VOLUNTARY_DELETED_PATH_NOT_HISTORICAL",
        );
        assert.equal(
          snapshot.has(file.path),
          false,
          "VOLUNTARY_DELETED_PATH_PRESENT",
        );
        continue;
      }
      if (file.status === "untracked")
        assert.ok(
          !head.has(file.path) && !canonicalTree.has(file.path),
          "VOLUNTARY_UNTRACKED_PATH_HISTORICAL",
        );
      else
        assert.ok(
          head.has(file.path) || canonicalTree.has(file.path),
          "VOLUNTARY_TRACKED_PATH_NOT_HISTORICAL",
        );
      const entry = snapshot.get(file.path);
      assert.ok(entry, "VOLUNTARY_BACKUP_PATH_MISSING");
      assert.equal(entry.type, "blob");
      assert.equal(entry.mode, file.modeGit, "VOLUNTARY_BACKUP_MODE_MISMATCH");
      assert.equal(entry.sha, file.blobSha, "VOLUNTARY_BACKUP_BLOB_MISMATCH");
      const bytes = decodedBlob(
        await githubJson(`${repoPath}/git/blobs/${file.blobSha}`, options),
        file.blobSha,
      );
      assert.equal(bytes.length, file.bytes);
      assert.equal(
        digest(bytes),
        file.sha256,
        "VOLUNTARY_BACKUP_CONTENT_MISMATCH",
      );
    }
    await readRef(backup);
  }
  for (const receipt of request.stopAckReceipts) {
    const sha = receipt.receiptRef.slice(
      receipt.receiptRef.lastIndexOf("/") + 1,
    );
    assert.ok(
      request.wipInventory.some(
        (file) =>
          file.status !== "deleted" &&
          ["100644", "100755"].includes(file.modeGit) &&
          file.blobSha === sha &&
          file.sha256 === receipt.receiptSha256 &&
          request.backupRefs[file.backupIndex].writerId === receipt.writerId,
      ),
      "VOLUNTARY_RECEIPT_NOT_DURABLY_BACKED",
    );
    const bytes = decodedBlob(
      await githubJson(
        receipt.receiptRef.slice("https://api.github.com".length),
        options,
      ),
      sha,
    );
    assert.equal(
      digest(bytes),
      receipt.receiptSha256,
      "VOLUNTARY_RECEIPT_HASH_MISMATCH",
    );
    const material = blobJson(bytes);
    closed(material, "schemaVersion writer receipt");
    const { receiptRef, receiptSha256, ...facts } = receipt;
    assert.deepEqual(
      material,
      {
        schemaVersion: 1,
        writer: request.writerInventory.find(
          (writer) => writer.writerId === receipt.writerId,
        ),
        receipt: facts,
      },
      "VOLUNTARY_RECEIPT_FACTS_MISMATCH",
    );
  }
}

async function readOwnerDecision(request, claim, options) {
  const repoPath = `/repos/${request.repository}`;
  const repository = await githubJson(repoPath, options);
  const owner = repository.owner;
  assert.equal(repository.full_name, request.repository);
  assert.equal(owner?.type, "User", "VOLUNTARY_REPOSITORY_OWNER_INVALID");
  assert.ok(Number.isSafeInteger(owner.id) && owner.id > 0);
  assert.equal(owner.login, request.repository.split("/")[0]);
  const pull = await githubJson(
    `${repoPath}/pulls/${request.anchorAcquisitionPr}`,
    options,
  );
  assert.equal(pull.number, request.anchorAcquisitionPr);
  assert.equal(
    pull.head?.ref,
    claim.branch,
    "VOLUNTARY_ANCHOR_BRANCH_MISMATCH",
  );
  assert.equal(pull.head?.repo?.full_name, request.repository);
  assert.equal(pull.base?.ref, "main");
  assert.equal(pull.base?.repo?.full_name, request.repository);
  assert.ok(
    Number.isFinite(Date.parse(pull.merged_at)),
    "VOLUNTARY_ANCHOR_NOT_MERGED",
  );
  assert.match(pull.merge_commit_sha, SHA);
  const compare = await githubJson(
    `${repoPath}/compare/${pull.merge_commit_sha}...${request.exactBaseSha}`,
    options,
  );
  assert.ok(
    ["ahead", "identical"].includes(compare.status) &&
      compare.base_commit?.sha === pull.merge_commit_sha &&
      compare.merge_base_commit?.sha === pull.merge_commit_sha,
    "VOLUNTARY_ANCHOR_NOT_ANCESTOR",
  );
  for (const path of [
    ".github/morro-control/claims.json",
    `.morro/changesets/${request.claimId}.json`,
  ]) {
    const blob = await githubJson(
      `${repoPath}/contents/${path}?ref=${pull.merge_commit_sha}`,
      options,
    );
    const value = blobJson(decodedBlob(blob, blob.sha));
    const historical = path.endsWith("claims.json")
      ? value.claims?.[request.claimId]
      : value;
    assert.ok(historical, "VOLUNTARY_ANCHOR_CLAIM_MISSING");
    if (path.endsWith("claims.json"))
      assert.equal(value.registryAuthority, "ORCHESTRATOR");
    else assert.equal(historical.id, request.claimId);
    for (const key of path.endsWith("claims.json")
      ? ["owner", "branch", "baseSha"]
      : ["branch", "baseSha"])
      assert.equal(
        historical[key],
        claim[key],
        "VOLUNTARY_ANCHOR_IDENTITY_MISMATCH",
      );
  }
  const suffix = `${request.claimId}:${objectDigest(request)}:${request.decisionNonce}:${request.exactBaseSha}`;
  const approval = `APPROVED_VOLUNTARY_RELEASE:${suffix}`,
    revocation = `REVOKED_VOLUNTARY_RELEASE:${suffix}`;
  const validOwner = (comment) =>
    comment.user?.id === owner.id &&
    comment.user?.login === owner.login &&
    comment.user?.type === "User" &&
    comment.author_association === "OWNER" &&
    comment.performed_via_github_app === null;
  const listDecision = async () => {
    const approvals = [];
    for (let page = 1; page <= 10; page++) {
      const comments = await githubJson(
        `${repoPath}/issues/${request.anchorAcquisitionPr}/comments?per_page=100&page=${page}`,
        options,
      );
      bounded(comments, 0, 100);
      for (const comment of comments) {
        if (comment.body !== approval && comment.body !== revocation) continue;
        assert.equal(
          validOwner(comment),
          true,
          "VOLUNTARY_OWNER_COMMENT_INVALID",
        );
        assert.notEqual(comment.body, revocation, "VOLUNTARY_OWNER_REVOKED");
        assert.ok(Number.isSafeInteger(comment.id) && comment.id > 0);
        assert.equal(
          comment.created_at,
          comment.updated_at,
          "VOLUNTARY_OWNER_COMMENT_EDITED",
        );
        const created = githubTimestamp(comment.created_at);
        assert.ok(
          timestamp(request.snapshotAt) <= created &&
            created <= options.clock() &&
            options.clock() - created <= 1800000,
          "VOLUNTARY_CONSENT_TIME_INVALID",
        );
        approvals.push(comment);
      }
      if (comments.length < 100) {
        assert.equal(
          approvals.length,
          1,
          "VOLUNTARY_EXACTLY_ONE_APPROVAL_REQUIRED",
        );
        return approvals[0];
      }
    }
    throw new Error("VOLUNTARY_COMMENT_PAGINATION_LIMIT");
  };
  const selected = await listDecision();
  await verifyVoluntaryBackups(request, claim, options);
  const current = await githubJson(
    `${repoPath}/issues/comments/${selected.id}`,
    options,
  );
  assert.deepEqual(
    comparableOwnerComment(current),
    comparableOwnerComment(selected),
    "VOLUNTARY_OWNER_COMMENT_CHANGED",
  );
  assert.deepEqual(
    comparableOwnerComment(await listDecision()),
    comparableOwnerComment(selected),
    "VOLUNTARY_OWNER_COMMENT_CHANGED",
  );
  return {
    commentId: selected.id,
    ownerId: owner.id,
    ownerLogin: owner.login,
    createdAt: new Date(githubTimestamp(selected.created_at)).toISOString(),
    updatedAt: new Date(githubTimestamp(selected.updated_at)).toISOString(),
    bodySha256: digest(selected.body),
    anchorAcquisitionPr: request.anchorAcquisitionPr,
  };
}

// Verification only: this export does not authorize canonical claim retirement.
export async function verifyVoluntaryRelease(
  decisionRequest,
  {
    claimId,
    claim,
    canonicalManifest,
    expectedBaseSha,
    canonicalText,
    retirementBranch,
    repository,
    token,
    fetchImpl = fetch,
    clock = Date.now,
  },
) {
  ({ decisionRequest, claim, canonicalManifest } = immutable(
    structuredClone({ decisionRequest, claim, canonicalManifest }),
  ));
  assert.equal(
    decisionRequest?.repository,
    repository,
    "VOLUNTARY_REPOSITORY_MISMATCH",
  );
  const startedAt = clock();
  const context = {
    claimId,
    claim,
    canonicalManifest,
    expectedBaseSha,
    canonicalText,
    retirementBranch,
  };
  validateVoluntaryReleaseRequest(decisionRequest, {
    ...context,
    now: startedAt,
  });
  const assertLiveMain = async () => {
    const main = await githubJson(`/repos/${repository}/commits/main`, {
      token,
      fetchImpl,
    });
    assert.equal(main.sha, expectedBaseSha, "VOLUNTARY_MAIN_CHANGED");
  };
  await assertLiveMain();
  const ownerDecision = await readOwnerDecision(decisionRequest, claim, {
    token,
    fetchImpl,
    clock,
  });
  await assertLiveMain();
  const observed = clock();
  assert.ok(
    observed >= startedAt && observed - startedAt <= 60000,
    "VOLUNTARY_PROVIDER_OBSERVATION_STALE",
  );
  validateVoluntaryReleaseRequest(decisionRequest, {
    ...context,
    now: observed,
  });
  assert.ok(
    timestamp(ownerDecision.createdAt) <= observed &&
      observed - timestamp(ownerDecision.createdAt) <= 1800000,
    "VOLUNTARY_CONSENT_TIME_INVALID",
  );
  return immutable({
    id: claimId,
    reason: "VOLUNTARY",
    requestedReason: "VOLUNTARY",
    branch: claim.branch,
    baseSha: claim.baseSha,
    decisionRequest,
    requestDigest: objectDigest(decisionRequest),
    ownerDecision,
    authorityModel: VOLUNTARY_MODEL,
    observedAt: new Date(observed).toISOString(),
  });
}

export async function collectClaimRetirementEvidence(
  claimId,
  claim,
  {
    repository,
    expectedBaseSha,
    now = Date.now(),
    token,
    fetchImpl = fetch,
    requestedReason,
    decisionRequest,
    canonicalText,
    canonicalManifest,
    retirementBranch,
    clock = Date.now,
  },
) {
  assert.match(claimId, CLAIM_ID, "CLAIM_RETIREMENT_ID_INVALID");
  assert.match(expectedBaseSha ?? "", SHA, "EXPECTED_BASE_INVALID");
  assert.match(
    repository ?? "",
    /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u,
    "GITHUB_REPOSITORY_INVALID",
  );

  if (requestedReason !== undefined) {
    if (requestedReason === "VOLUNTARY")
      return verifyVoluntaryRelease(decisionRequest, {
        claimId,
        claim,
        canonicalManifest,
        expectedBaseSha,
        canonicalText,
        retirementBranch,
        repository,
        token,
        fetchImpl,
        clock,
      });
    assert.equal(
      decisionRequest,
      undefined,
      "VOLUNTARY_REQUEST_WITHOUT_REASON",
    );
    assert.equal(
      requestedReason,
      "EXPIRED",
      "CLAIM_RETIREMENT_REQUEST_INVALID",
    );
    const expiry = Date.parse(claim?.expiresAt);
    assert.ok(
      typeof claim?.expiresAt === "string" && Number.isFinite(expiry),
      "CLAIM_RETIREMENT_EXPIRY_INVALID",
    );
    assert.ok(Number.isFinite(now), "CLAIM_RETIREMENT_NOW_INVALID");
    assert.ok(expiry <= now, "CLAIM_RETIREMENT_NOT_EXPIRED");
    return {
      id: claimId,
      reason: "EXPIRED",
      branch: claim.branch,
      baseSha: claim.baseSha,
    };
  }
  assert.equal(decisionRequest, undefined, "VOLUNTARY_REQUEST_WITHOUT_REASON");
  const options = { token, fetchImpl };
  const merged = await mergedEvidence(
    claim,
    repository,
    expectedBaseSha,
    options,
  );
  if (merged.evidence) return { ...merged.evidence, id: claimId };

  const expiresAt = Date.parse(claim?.expiresAt);
  if (Number.isFinite(expiresAt) && expiresAt <= now) {
    return {
      id: claimId,
      reason: "EXPIRED",
      branch: claim.branch,
      baseSha: claim.baseSha,
    };
  }

  const orphan = await orphanEvidence(claim, repository, merged.pulls, options);
  if (orphan) return { ...orphan, id: claimId };

  throw new Error("CLAIM_RETIREMENT_NO_CANONICAL_EVIDENCE");
}

export async function buildClaimRetirementProof(
  trustedRoot,
  candidateRoot,
  env = process.env,
  { fetchImpl = fetch, now = Date.now(), clock = Date.now } = {},
) {
  const baseRoot = realpathSync(resolve(trustedRoot));
  const targetRoot = realpathSync(resolve(candidateRoot));
  const expectedBaseSha = env.EXPECTED_BASE_SHA ?? "";
  const expectedCandidateSha = env.EXPECTED_CANDIDATE_SHA ?? "";
  const repository = env.GITHUB_REPOSITORY ?? "";
  const token = env.GITHUB_TOKEN ?? env.GH_TOKEN ?? "";

  assert.match(expectedBaseSha, SHA, "EXPECTED_BASE_INVALID");
  assert.match(expectedCandidateSha, SHA, "EXPECTED_CANDIDATE_INVALID");
  assert.equal(git(baseRoot, ["rev-parse", "HEAD"]), expectedBaseSha);
  assert.equal(git(targetRoot, ["rev-parse", "HEAD"]), expectedCandidateSha);
  assert.ok(
    isAncestor(targetRoot, expectedBaseSha, expectedCandidateSha),
    "CURRENT_BASE_NOT_ANCESTOR",
  );
  assert.equal(
    git(targetRoot, ["status", "--porcelain", "--untracked-files=all"]),
    "",
    "DIRTY_CANDIDATE_WORKTREE",
  );

  const registryPath = ".github/morro-control/claims.json";
  const baseRegistry = JSON.parse(
    readFileSync(resolve(baseRoot, registryPath), "utf8"),
  );
  const candidateRegistry = JSON.parse(
    readFileSync(resolve(targetRoot, registryPath), "utf8"),
  );
  const { removed } = assertCanonicalRetirementTransition(
    baseRegistry,
    candidateRegistry,
  );
  const evidenceById = {};

  for (const id of removed) {
    const claim = baseRegistry.claims[id];
    const candidateManifest = JSON.parse(
      readFileSync(
        resolve(targetRoot, ".morro", "changesets", id + ".json"),
        "utf8",
      ),
    );
    const canonicalManifest = JSON.parse(
      readFileSync(
        resolve(baseRoot, ".morro", "changesets", id + ".json"),
        "utf8",
      ),
    );
    validateChangeSetV2(candidateManifest);
    validateChangeSetV2(canonicalManifest);
    const canonicalText = readFileSync(
      resolve(baseRoot, ".github/morro-control/events.ndjson"),
      "utf8",
    );
    const candidateText = readFileSync(
      resolve(targetRoot, ".github/morro-control/events.ndjson"),
      "utf8",
    );
    const requestedReason = deriveExplicitRetirementRequest({
      canonicalText,
      candidateText,
      claimId: id,
      expectedBaseSha,
      claim,
      now,
    });
    const evidence = await collectClaimRetirementEvidence(id, claim, {
      repository,
      expectedBaseSha,
      now,
      token,
      fetchImpl,
      requestedReason,
      decisionRequest:
        requestedReason === "VOLUNTARY"
          ? parseAuthorityLedger(candidateText).at(-1).payload.decisionRequest
          : undefined,
      canonicalText,
      canonicalManifest,
      retirementBranch: candidateManifest.branch,
      clock,
    });

    if (requestedReason === "VOLUNTARY") {
      const observed = timestamp(
        parseAuthorityLedger(candidateText).at(-1).observedAt,
      );
      assert.ok(observed <= clock(), "VOLUNTARY_EVENT_TIME_INVALID");
      assert.deepEqual(
        git(targetRoot, [
          "diff",
          "--name-only",
          expectedBaseSha,
          expectedCandidateSha,
        ])
          .split("\n")
          .filter(Boolean)
          .sort(),
        metadataPaths(id).sort(),
        "VOLUNTARY_EXACT_THREE_PATHS_REQUIRED",
      );
    }

    if (evidence.reason === "MERGED_PR") {
      assert.equal(
        isAncestor(targetRoot, claim.baseSha, evidence.mergeSha),
        true,
        "CLAIM_RETIREMENT_CLAIM_BASE_NOT_ANCESTOR",
      );
      const historical = JSON.parse(
        git(targetRoot, [
          "show",
          `${evidence.mergeSha}:.morro/changesets/${id}.json`,
        ]),
      );
      assert.equal(
        historical?.id,
        id,
        "CLAIM_RETIREMENT_HISTORICAL_MANIFEST_MISMATCH",
      );
      assert.equal(
        historical?.branch,
        claim.branch,
        "CLAIM_RETIREMENT_HISTORICAL_MANIFEST_MISMATCH",
      );
      assert.equal(
        historical?.baseSha,
        claim.baseSha,
        "CLAIM_RETIREMENT_HISTORICAL_MANIFEST_MISMATCH",
      );
      evidence.claimBaseAncestorOfMerge = true;
      evidence.historicalManifestMatches = true;
    }

    validateCandidateRetirementManifest(candidateManifest, {
      claimId: id,
      expectedBaseSha,
      canonicalManifest,
      evidence,
    });
    validateRetirementEvents({
      canonicalText,
      candidateText,
      claimId: id,
      expectedBaseSha,
      evidence,
      requestedReason,
    });
    evidenceById[id] = evidence;
  }

  const result = validateClaimRetirements({
    baseRegistry,
    candidateRegistry,
    evidenceById,
    now,
  });

  return {
    contract: "MORRO-CLAIM-RETIREMENT-PROOF",
    status: "pass",
    failClosed: true,
    exactHead: expectedCandidateSha,
    currentBaseSha: expectedBaseSha,
    ...result,
  };
}

function diagnosticCode(cause) {
  const message =
    cause &&
    typeof cause === "object" &&
    "message" in cause &&
    typeof cause.message === "string"
      ? cause.message
      : "";
  return (
    message.match(/[A-Z][A-Z0-9_:.-]{2,160}/u)?.[0] ??
    "UNEXPECTED_CLAIM_RETIREMENT_ERROR"
  );
}

const invokedDirectly =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  try {
    const [trustedRoot = "trusted", candidateRoot = "candidate"] =
      process.argv.slice(2);
    console.log(
      JSON.stringify(
        await buildClaimRetirementProof(trustedRoot, candidateRoot),
      ),
    );
  } catch (cause) {
    console.error(`MORRO_CLAIM_RETIREMENT_FAILED:${diagnosticCode(cause)}`);
    process.exitCode = 1;
  }
}
