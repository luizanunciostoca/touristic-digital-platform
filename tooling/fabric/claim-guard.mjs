import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { validateChangeSetV2 } from "../mdctl/changeset-v2.mjs";
import { parseAuthorityLedger } from "../mdctl/event-ledger.mjs";

const ACTIVE_CLAIM_STATUSES = new Set([
  "CLAIMED",
  "IMPLEMENTING",
  "LOCAL_PROVEN",
  "REMOTE_PROVEN",
  "PROOF_ACCEPTED",
  "INTEGRATION_READY",
]);

const WRITE_LIFECYCLE_STATES = new Set([
  "IMPLEMENTING",
  "LOCAL_PROVEN",
  "REMOTE_PROVEN",
  "COMPOSITION_PROVEN",
  "POLICY_SATISFIED",
  "MERGE_READY",
]);

const AUTHORITY_STATES = new Map([
  ["WORKER", new Set(["IMPLEMENTING", "LOCAL_PROVEN", "REMOTE_PROVEN"])],
  [
    "INTEGRATOR",
    new Set(["COMPOSITION_PROVEN", "POLICY_SATISFIED", "MERGE_READY"]),
  ],
  ["ORCHESTRATOR", new Set(WRITE_LIFECYCLE_STATES)],
]);

const AUTHORITIES = new Set(AUTHORITY_STATES.keys());
const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const reanchorCertificates = new WeakMap();

// Registry maintenance is an orchestrator capability, not persistent worker
// ownership. Issue an in-process certificate only from an exact Git transition.
export function buildClaimReanchorProof(
  root,
  { baseSha, headSha, manifestPath },
) {
  assert.match(baseSha ?? "", SHA_PATTERN, "REANCHOR_BASE_INVALID");
  assert.match(headSha ?? "", SHA_PATTERN, "REANCHOR_HEAD_INVALID");
  assert.match(
    manifestPath ?? "",
    /^\.morro\/changesets\/MD-[A-Z0-9-]+\.json$/u,
    "REANCHOR_MANIFEST_PATH_INVALID",
  );
  assert.equal(
    git(root, ["rev-parse", "HEAD"]),
    headSha,
    "REANCHOR_HEAD_MISMATCH",
  );
  assert.equal(
    git(root, ["status", "--porcelain", "--untracked-files=all"]),
    "",
    "REANCHOR_DIRTY_WORKTREE",
  );
  assert.ok(
    isGitAncestor(root, baseSha, headSha),
    "REANCHOR_BASE_NOT_ANCESTOR",
  );
  const registryPath = ".github/morro-control/claims.json";
  const ledgerPath = ".github/morro-control/events.ndjson";
  const read = (sha, path) =>
    execFileSync("git", ["-C", root, "show", `${sha}:${path}`], {
      encoding: "utf8",
    });
  const canonical = JSON.parse(read(baseSha, registryPath));
  const candidate = JSON.parse(read(headSha, registryPath));
  const previous = JSON.parse(read(baseSha, manifestPath));
  const manifest = JSON.parse(read(headSha, manifestPath));
  validateChangeSetV2(previous);
  validateChangeSetV2(manifest);
  assert.equal(
    manifestPath,
    `.morro/changesets/${manifest.id}.json`,
    "REANCHOR_MANIFEST_ID_MISMATCH",
  );
  assert.equal(previous.id, manifest.id, "REANCHOR_ID_CHANGED");
  const claim = canonical.claims?.[manifest.id];
  assert.ok(claim, "REANCHOR_CANONICAL_CLAIM_REQUIRED");
  assert.equal(
    canonical.registryAuthority,
    "ORCHESTRATOR",
    "REANCHOR_AUTHORITY_INVALID",
  );
  assert.equal(
    claim.baseSha,
    previous.baseSha,
    "REANCHOR_CANONICAL_BASE_MISMATCH",
  );
  assert.equal(
    claim.branch,
    previous.branch,
    "REANCHOR_CANONICAL_BRANCH_MISMATCH",
  );
  assert.deepEqual(
    [...claim.paths].sort(),
    [...previous.owns.paths].sort(),
    "REANCHOR_CANONICAL_PATHS_MISMATCH",
  );
  assert.ok(
    isGitAncestor(root, claim.baseSha, baseSha),
    "REANCHOR_CANONICAL_BASE_NOT_ANCESTOR",
  );
  assert.notEqual(claim.baseSha, baseSha, "REANCHOR_BASE_UNCHANGED");
  assert.equal(manifest.baseSha, baseSha, "REANCHOR_EXACT_BASE_REQUIRED");
  assert.deepEqual(
    candidate,
    {
      ...canonical,
      claims: { ...canonical.claims, [manifest.id]: { ...claim, baseSha } },
    },
    "REANCHOR_ONLY_TARGET_BASE_MAY_CHANGE",
  );
  assert.deepEqual(
    { ...manifest, baseSha: previous.baseSha, state: previous.state },
    previous,
    "REANCHOR_MANIFEST_AUTHORITY_CHANGED",
  );
  for (const path of [registryPath, ledgerPath])
    assert.ok(
      !claim.paths.some((pattern) => pathOwned(path, pattern)),
      "REANCHOR_REQUIRES_PERSISTENT_ONLY_CLAIM",
    );
  for (const sha of [baseSha, headSha])
    for (const path of [registryPath, ledgerPath, manifestPath])
      assert.ok(
        git(root, ["ls-tree", sha, "--", path]).startsWith("100644 blob "),
        "REANCHOR_REGULAR_FILE_REQUIRED",
      );
  const oldLedger = read(baseSha, ledgerPath),
    ledger = read(headSha, ledgerPath);
  assert.ok(ledger.startsWith(oldLedger), "REANCHOR_LEDGER_BYTES_MUTATED");
  const oldEvents = parseAuthorityLedger(oldLedger),
    events = parseAuthorityLedger(ledger);
  assert.equal(
    events.length,
    oldEvents.length + 1,
    "REANCHOR_EVENT_COUNT_INVALID",
  );
  const event = events.at(-1);
  assert.equal(event.eventType, "CLAIM_RENEWED", "REANCHOR_EVENT_TYPE_INVALID");
  assert.equal(event.actor, "ORCHESTRATOR", "REANCHOR_EVENT_ACTOR_INVALID");
  assert.equal(event.entity, manifest.id, "REANCHOR_EVENT_ENTITY_INVALID");
  assert.equal(event.sourceSha, baseSha, "REANCHOR_EVENT_SOURCE_INVALID");
  assert.equal(
    event.payload.currentBaseSha,
    baseSha,
    "REANCHOR_EVENT_BASE_INVALID",
  );
  assert.equal(
    event.payload.currentBranch,
    manifest.branch,
    "REANCHOR_EVENT_BRANCH_INVALID",
  );
  assert.equal(
    event.payload.authorityScopeChanged,
    false,
    "REANCHOR_EVENT_SCOPE_INVALID",
  );
  const certificate = Object.freeze({
    claimId: manifest.id,
    baseSha,
    headSha,
    branch: manifest.branch,
  });
  reanchorCertificates.set(certificate, { registry: candidate, manifest });
  return certificate;
}

export function addedClaimIds(canonicalRegistry, candidateRegistry) {
  assert.equal(
    canonicalRegistry?.registryAuthority,
    "ORCHESTRATOR",
    "MERGE_GATE_ACQUISITION_CANONICAL_REGISTRY_INVALID",
  );
  assert.equal(
    candidateRegistry?.registryAuthority,
    "ORCHESTRATOR",
    "MERGE_GATE_ACQUISITION_CANDIDATE_REGISTRY_INVALID",
  );
  assert.ok(
    canonicalRegistry.claims &&
      typeof canonicalRegistry.claims === "object" &&
      !Array.isArray(canonicalRegistry.claims),
    "MERGE_GATE_ACQUISITION_CANONICAL_CLAIMS_INVALID",
  );
  assert.ok(
    candidateRegistry.claims &&
      typeof candidateRegistry.claims === "object" &&
      !Array.isArray(candidateRegistry.claims),
    "MERGE_GATE_ACQUISITION_CANDIDATE_CLAIMS_INVALID",
  );
  return Object.keys(candidateRegistry.claims)
    .filter((id) => !(id in canonicalRegistry.claims))
    .sort();
}

export function assertAcquisitionClaimKeyset(
  canonicalRegistry,
  candidateRegistry,
  claimId,
) {
  addedClaimIds(canonicalRegistry, candidateRegistry);
  assert.deepEqual(
    { ...candidateRegistry, claims: null },
    { ...canonicalRegistry, claims: null },
    "MERGE_GATE_ACQUISITION_REGISTRY_METADATA_MUTATED",
  );
  const canonicalIds = Object.keys(canonicalRegistry?.claims ?? {}).sort();
  const candidateIds = Object.keys(candidateRegistry?.claims ?? {}).sort();
  assert.equal(
    Object.hasOwn(canonicalRegistry?.claims ?? {}, claimId),
    false,
    "MERGE_GATE_ACQUISITION_CLAIM_ALREADY_CANONICAL",
  );
  assert.deepEqual(
    candidateIds,
    [...canonicalIds, claimId].sort(),
    "MERGE_GATE_ACQUISITION_CLAIM_KEYSET_INVALID",
  );
  for (const id of canonicalIds) {
    assert.deepEqual(
      candidateRegistry.claims[id],
      canonicalRegistry.claims[id],
      "MERGE_GATE_ACQUISITION_SURVIVING_CLAIM_MUTATION_FORBIDDEN",
    );
  }
}

export function validateClaimAcquisitionEvents({
  canonicalEvents,
  events,
  claimId,
  claim,
  manifest,
  branch,
  baseSha,
}) {
  assert.ok(
    Array.isArray(canonicalEvents),
    "MERGE_GATE_ACQUISITION_CANONICAL_EVENTS_INVALID",
  );
  assert.ok(Array.isArray(events), "MERGE_GATE_ACQUISITION_EVENTS_INVALID");
  assert.equal(
    events.length,
    canonicalEvents.length + 2,
    "MERGE_GATE_ACQUISITION_EVENT_COUNT_INVALID",
  );
  assert.deepEqual(
    events.slice(0, canonicalEvents.length),
    canonicalEvents,
    "MERGE_GATE_ACQUISITION_LEDGER_HISTORY_MUTATED",
  );

  const [created, acquired] = events.slice(canonicalEvents.length);
  assert.equal(
    created?.eventType,
    "CHANGESET_CREATED",
    "MERGE_GATE_ACQUISITION_CHANGESET_EVENT_INVALID",
  );
  assert.equal(
    acquired?.eventType,
    "CLAIM_ACQUIRED",
    "MERGE_GATE_ACQUISITION_CLAIM_EVENT_INVALID",
  );
  for (const event of [created, acquired]) {
    assert.equal(
      event?.entity,
      claimId,
      "MERGE_GATE_ACQUISITION_EVENT_ENTITY_MISMATCH",
    );
    assert.equal(
      event?.actor,
      "ORCHESTRATOR",
      "MERGE_GATE_ACQUISITION_EVENT_ACTOR_INVALID",
    );
    assert.equal(
      event?.sourceSha,
      baseSha,
      "MERGE_GATE_ACQUISITION_EVENT_BASE_MISMATCH",
    );
    assert.equal(
      event?.payload?.branch,
      branch,
      "MERGE_GATE_ACQUISITION_EVENT_BRANCH_MISMATCH",
    );
  }
  assert.equal(
    acquired?.payload?.expiresAt,
    claim.expiresAt,
    "MERGE_GATE_ACQUISITION_EVENT_EXPIRY_MISMATCH",
  );
  assert.equal(
    acquired?.payload?.risk,
    claim.risk,
    "MERGE_GATE_ACQUISITION_EVENT_RISK_MISMATCH",
  );
  assert.equal(
    created?.payload?.objective,
    manifest.objective,
    "MERGE_GATE_ACQUISITION_EVENT_OBJECTIVE_MISMATCH",
  );
  return { acquired, created };
}

export function validateClaimAcquisitionTransition({
  manifest,
  registry,
  canonicalRegistry,
  claimId,
  canonicalEvents,
  events,
  branch,
  baseSha,
  headSha,
  authorizationPaths,
  changedFileCount,
}) {
  validateChangeSetV2(manifest);
  assert.ok(manifest.objective, "MERGE_GATE_ACQUISITION_OBJECTIVE_REQUIRED");
  assert.match(
    manifest.objective,
    /^[a-z0-9][a-z0-9._/-]{2,159}$/u,
    "MERGE_GATE_ACQUISITION_OBJECTIVE_INVALID",
  );
  assert.equal(
    manifest.id,
    claimId,
    "MERGE_GATE_ACQUISITION_CHANGESET_ID_MISMATCH",
  );
  assert.equal(
    manifest.state,
    "IMPLEMENTING",
    "MERGE_GATE_ACQUISITION_STATE_INVALID",
  );
  assert.equal(
    manifest.baseSha,
    baseSha,
    "MERGE_GATE_ACQUISITION_BASE_MISMATCH",
  );
  assert.equal(
    manifest.branch,
    branch,
    "MERGE_GATE_ACQUISITION_BRANCH_MISMATCH",
  );
  assert.match(
    baseSha ?? "",
    SHA_PATTERN,
    "MERGE_GATE_ACQUISITION_BASE_INVALID",
  );
  assert.match(
    headSha ?? "",
    SHA_PATTERN,
    "MERGE_GATE_ACQUISITION_HEAD_INVALID",
  );

  assertAcquisitionClaimKeyset(canonicalRegistry, registry, claimId);
  const claim = registry.claims[claimId];
  assert.ok(claim, "MERGE_GATE_ACQUISITION_CLAIM_MISSING");
  assert.equal(
    claim.owner,
    "CHATGPT-PRO-CONTROL",
    "MERGE_GATE_ACQUISITION_OWNER_INVALID",
  );
  assert.equal(
    claim.reviewer,
    "AUTOMATED-INDEPENDENT-PROOF",
    "MERGE_GATE_ACQUISITION_REVIEWER_INVALID",
  );
  assert.equal(
    claim.status,
    "IMPLEMENTING",
    "MERGE_GATE_ACQUISITION_CLAIM_STATUS_INVALID",
  );
  assert.equal(
    claim.baseSha,
    baseSha,
    "MERGE_GATE_ACQUISITION_CLAIM_BASE_MISMATCH",
  );
  assert.equal(
    claim.branch,
    branch,
    "MERGE_GATE_ACQUISITION_CLAIM_BRANCH_MISMATCH",
  );
  assert.deepEqual(
    [...claim.paths].sort(),
    [...manifest.owns.paths].sort(),
    "MERGE_GATE_ACQUISITION_CLAIM_PATHS_MISMATCH",
  );

  for (const required of [
    "automated-independent-proof",
    "exact-head-identity",
  ]) {
    assert.ok(
      manifest.proof.requiredRemoteEvidence.includes(required),
      "MERGE_GATE_REMOTE_EVIDENCE_REQUIRED:" + required,
    );
  }

  validateClaimAcquisitionEvents({
    canonicalEvents,
    events,
    claimId,
    claim,
    manifest,
    branch,
    baseSha,
  });

  const manifestPath = ".morro/changesets/" + claimId + ".json";
  const expectedPaths = [
    ".github/morro-control/claims.json",
    ".github/morro-control/events.ndjson",
    manifestPath,
  ].sort();
  assert.deepEqual(
    [...authorizationPaths].sort(),
    expectedPaths,
    "MERGE_GATE_ACQUISITION_SCOPE_INVALID",
  );
  assert.equal(
    changedFileCount,
    expectedPaths.length,
    "MERGE_GATE_ACQUISITION_FILE_COUNT_INVALID",
  );

  // Existing canonical claims retain their authority. A new acquisition must
  // never reserve the shared bookkeeping files, including through an ancestor.
  for (const path of SERIALIZED_ACQUISITION_BOOKKEEPING_PATHS)
    assert.ok(
      !claim.paths.some((pattern) => pathOwned(path, pattern)),
      "ACQUISITION_PERSISTENT_BOOKKEEPING_FORBIDDEN",
    );

  return {
    claimId,
    manifestPath,
    transientOrchestratorPaths: [...SERIALIZED_ACQUISITION_BOOKKEEPING_PATHS],
  };
}

export function assertSupportedPattern(pattern) {
  assert.equal(typeof pattern, "string", "CLAIM_PATTERN_INVALID");
  assert.ok(pattern.length > 0, "CLAIM_PATTERN_EMPTY");

  if (pattern.endsWith("/**")) {
    assert.equal(
      pattern.slice(0, -3).includes("*"),
      false,
      "CLAIM_PATTERN_WILDCARD_UNSUPPORTED",
    );
    return;
  }

  assert.equal(
    pattern.includes("*"),
    false,
    "CLAIM_PATTERN_WILDCARD_UNSUPPORTED",
  );
}

export function pathOwned(path, pattern) {
  assert.equal(typeof path, "string", "CLAIM_PATH_INVALID");
  assertSupportedPattern(pattern);

  if (pattern.endsWith("/**")) {
    return path.startsWith(pattern.slice(0, -2));
  }

  return path === pattern;
}

export function patternsOverlap(left, right) {
  assertSupportedPattern(left);
  assertSupportedPattern(right);

  if (left === right) return true;

  const leftRecursive = left.endsWith("/**");
  const rightRecursive = right.endsWith("/**");

  if (leftRecursive && rightRecursive) {
    const leftPrefix = left.slice(0, -2);
    const rightPrefix = right.slice(0, -2);
    return (
      leftPrefix.startsWith(rightPrefix) || rightPrefix.startsWith(leftPrefix)
    );
  }

  if (leftRecursive) return pathOwned(right, left);
  if (rightRecursive) return pathOwned(left, right);

  return false;
}

function parseExpiry(value) {
  assert.equal(typeof value, "string", "CLAIM_EXPIRY_INVALID");
  const timestamp = Date.parse(value);
  assert.ok(Number.isFinite(timestamp), "CLAIM_EXPIRY_INVALID");
  return timestamp;
}

const SERIALIZED_ACQUISITION_BOOKKEEPING_PATHS = new Set([
  ".github/morro-control/claims.json",
  ".github/morro-control/events.ndjson",
]);

export function findClaimCollisions(
  registry,
  claimId,
  now = Date.now(),
  { allowSerializedAcquisitionBookkeeping = false, authority = "WORKER" } = {},
) {
  assert.equal(
    registry?.registryAuthority,
    "ORCHESTRATOR",
    "REGISTRY_AUTHORITY_INVALID",
  );
  assert.ok(
    registry.claims && typeof registry.claims === "object",
    "CLAIM_REGISTRY_INVALID",
  );

  const current = registry.claims[claimId];
  assert.ok(current, "ACTIVE_CLAIM_MISSING");

  if (allowSerializedAcquisitionBookkeeping) {
    assert.equal(
      authority,
      "ORCHESTRATOR",
      "CLAIM_COLLISION_EXEMPTION_REQUIRES_ORCHESTRATOR",
    );
  }
  const collisions = [];
  for (const [otherId, other] of Object.entries(registry.claims)) {
    if (otherId === claimId) continue;
    if (!ACTIVE_CLAIM_STATUSES.has(other.status)) continue;
    if (parseExpiry(other.expiresAt) <= now) continue;

    if (other.branch === current.branch) {
      collisions.push({ otherId, kind: "branch", value: current.branch });
    }

    for (const left of current.paths ?? []) {
      for (const right of other.paths ?? []) {
        if (
          patternsOverlap(left, right) &&
          !(
            allowSerializedAcquisitionBookkeeping &&
            left === right &&
            SERIALIZED_ACQUISITION_BOOKKEEPING_PATHS.has(left)
          )
        ) {
          collisions.push({
            otherId,
            kind: "path",
            value: `${left} <-> ${right}`,
          });
        }
      }
    }
  }

  return collisions;
}

export function validateClaimContext({
  registry,
  manifest,
  branch,
  currentBaseSha,
  branchHeadSha,
  changedFiles,
  now = Date.now(),
  authority = "WORKER",
  isAncestor = () => true,
  allowSerializedAcquisitionBookkeeping = false,
  reanchorProof,
}) {
  assert.equal(
    registry?.registryAuthority,
    "ORCHESTRATOR",
    "REGISTRY_AUTHORITY_INVALID",
  );
  assert.ok(
    registry.claims && typeof registry.claims === "object",
    "CLAIM_REGISTRY_INVALID",
  );
  assert.ok(manifest && typeof manifest === "object", "CHANGESET_REQUIRED");
  assert.match(manifest.id ?? "", /^MD-[A-Z0-9-]+$/u, "CHANGESET_ID_INVALID");
  assert.match(
    manifest.baseSha ?? "",
    SHA_PATTERN,
    "CHANGESET_BASE_SHA_INVALID",
  );
  assert.ok(
    WRITE_LIFECYCLE_STATES.has(manifest.state),
    "CHANGESET_NOT_WRITE_ACTIVE",
  );
  assert.ok(AUTHORITIES.has(authority), "CLAIM_GUARD_AUTHORITY_INVALID");
  assert.ok(
    AUTHORITY_STATES.get(authority).has(manifest.state),
    "CHANGESET_STATE_AUTHORITY_VIOLATION",
  );
  assert.equal(typeof branch, "string", "BRANCH_REQUIRED");
  assert.match(currentBaseSha ?? "", SHA_PATTERN, "CURRENT_BASE_SHA_INVALID");
  assert.match(branchHeadSha ?? "", SHA_PATTERN, "BRANCH_HEAD_SHA_INVALID");
  assert.ok(Array.isArray(changedFiles), "CHANGED_FILES_REQUIRED");

  const claim = registry.claims[manifest.id];
  assert.ok(claim, "ACTIVE_CLAIM_MISSING");
  assert.ok(ACTIVE_CLAIM_STATUSES.has(claim.status), "CLAIM_STATUS_INACTIVE");
  assert.equal(
    claim.reviewer,
    "AUTOMATED-INDEPENDENT-PROOF",
    "CLAIM_REVIEW_AUTHORITY_INVALID",
  );
  assert.equal(claim.branch, manifest.branch, "CLAIM_MANIFEST_BRANCH_MISMATCH");
  assert.equal(branch, manifest.branch, "CLAIM_RUNTIME_BRANCH_MISMATCH");
  assert.match(claim.baseSha ?? "", SHA_PATTERN, "CLAIM_BASE_SHA_INVALID");
  assert.equal(claim.baseSha, manifest.baseSha, "CLAIM_MANIFEST_BASE_MISMATCH");
  assert.ok(parseExpiry(claim.expiresAt) > now, "CLAIM_EXPIRED");

  assert.ok(
    Array.isArray(claim.paths) && claim.paths.length > 0,
    "CLAIM_PATHS_REQUIRED",
  );
  assert.ok(
    Array.isArray(manifest.owns?.paths) && manifest.owns.paths.length > 0,
    "CHANGESET_OWNERSHIP_REQUIRED",
  );

  for (const pattern of claim.paths) assertSupportedPattern(pattern);
  for (const pattern of manifest.owns.paths) assertSupportedPattern(pattern);

  assert.ok(
    isAncestor(manifest.baseSha, currentBaseSha),
    "CLAIM_BASE_NOT_ANCESTOR_OF_CURRENT_BASE",
  );
  assert.ok(
    isAncestor(currentBaseSha, branchHeadSha),
    "CURRENT_BASE_NOT_ANCESTOR_OF_BRANCH_HEAD",
  );

  // Acquisition authorizes two serialized writes, without reserving them in
  // the new claim. Include those writes only while checking this transition.
  if (reanchorProof !== undefined) {
    assert.ok(
      reanchorCertificates.has(reanchorProof),
      "REANCHOR_CERTIFICATE_UNVERIFIED",
    );
    assert.deepEqual(
      reanchorCertificates.get(reanchorProof),
      { registry, manifest },
      "REANCHOR_CERTIFICATE_CONTENT_MISMATCH",
    );
    assert.deepEqual(
      reanchorProof,
      {
        claimId: manifest.id,
        baseSha: currentBaseSha,
        headSha: branchHeadSha,
        branch,
      },
      "REANCHOR_CERTIFICATE_IDENTITY_MISMATCH",
    );
    assert.equal(authority, "ORCHESTRATOR", "REANCHOR_REQUIRES_ORCHESTRATOR");
  }
  const serializedBookkeeping =
    allowSerializedAcquisitionBookkeeping || reanchorProof !== undefined;
  const acquisitionPaths = serializedBookkeeping
    ? [...SERIALIZED_ACQUISITION_BOOKKEEPING_PATHS]
    : [];
  const collisionRegistry = {
    ...registry,
    claims: {
      ...registry.claims,
      [manifest.id]: { ...claim, paths: [...claim.paths, ...acquisitionPaths] },
    },
  };
  const collisions = findClaimCollisions(collisionRegistry, manifest.id, now, {
    allowSerializedAcquisitionBookkeeping: serializedBookkeeping,
    authority,
  });
  assert.deepEqual(collisions, [], "CLAIM_OVERLAP_DETECTED");

  // Registry maintenance is serialized by the orchestrator, not exclusively
  // claimed by workers. All other paths still require the active worker claim.
  const registryPath = ".github/morro-control/claims.json";
  const maintainsRegistry = changedFiles.includes(registryPath);
  if (maintainsRegistry) {
    assert.equal(
      authority,
      "ORCHESTRATOR",
      "WORKER_CLAIM_REGISTRY_MUTATION_FORBIDDEN",
    );
    assert.ok(
      acquisitionPaths.includes(registryPath) ||
        manifest.owns.paths.includes(registryPath),
      "ORCHESTRATOR_CLAIM_REGISTRY_OWNERSHIP_REQUIRED",
    );
  }

  const unauthorizedByClaim = changedFiles.filter(
    (path) =>
      !(maintainsRegistry && path === registryPath) &&
      !acquisitionPaths.includes(path) &&
      !claim.paths.some((pattern) => pathOwned(path, pattern)),
  );
  assert.deepEqual(unauthorizedByClaim, [], "CLAIM_PATH_VIOLATION");

  const unauthorizedByManifest = changedFiles.filter(
    (path) =>
      !acquisitionPaths.includes(path) &&
      !manifest.owns.paths.some((pattern) => pathOwned(path, pattern)),
  );
  assert.deepEqual(unauthorizedByManifest, [], "CHANGESET_OWNERSHIP_VIOLATION");

  return {
    claimId: manifest.id,
    owner: claim.owner,
    reviewer: claim.reviewer,
    branch,
    claimBaseSha: claim.baseSha,
    currentBaseSha,
    branchHeadSha,
    changedFiles,
    authority,
    collisions: 0,
  };
}

function git(root, args) {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
  }).trim();
}

function isGitAncestor(root, ancestor, descendant) {
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

export function resolveCandidatePath(root, candidatePath) {
  assert.equal(typeof candidatePath, "string", "CANDIDATE_PATH_INVALID");
  assert.ok(candidatePath.length > 0, "CANDIDATE_PATH_EMPTY");
  assert.equal(
    isAbsolute(candidatePath),
    false,
    "CANDIDATE_PATH_MUST_BE_RELATIVE",
  );

  const rootReal = realpathSync(root);
  const resolved = resolve(rootReal, candidatePath);
  const lexicalRelative = relative(rootReal, resolved);
  assert.ok(
    lexicalRelative &&
      lexicalRelative !== ".." &&
      !lexicalRelative.startsWith(`..${sep}`) &&
      !isAbsolute(lexicalRelative),
    "CANDIDATE_PATH_OUTSIDE_ROOT",
  );

  const real = realpathSync(resolved);
  const realRelative = relative(rootReal, real);
  assert.ok(
    realRelative &&
      realRelative !== ".." &&
      !realRelative.startsWith(`..${sep}`) &&
      !isAbsolute(realRelative),
    "CANDIDATE_PATH_OUTSIDE_ROOT",
  );

  return real;
}

function sortedStrings(values, code) {
  assert.ok(Array.isArray(values) && values.length > 0, code);
  return [...values].sort();
}

export function validateClaimHandoff({
  baseRegistry,
  candidateRegistry,
  baseFromManifest,
  candidateFromManifest,
  toManifest,
  now = Date.now(),
}) {
  assert.equal(
    baseRegistry?.registryAuthority,
    "ORCHESTRATOR",
    "HANDOFF_BASE_REGISTRY_AUTHORITY_INVALID",
  );
  assert.equal(
    candidateRegistry?.registryAuthority,
    "ORCHESTRATOR",
    "HANDOFF_CANDIDATE_REGISTRY_AUTHORITY_INVALID",
  );

  const fromId = baseFromManifest?.id;
  const toId = toManifest?.id;
  assert.match(fromId ?? "", /^MD-[A-Z0-9-]+$/u, "HANDOFF_FROM_ID_INVALID");
  assert.match(toId ?? "", /^MD-[A-Z0-9-]+$/u, "HANDOFF_TO_ID_INVALID");
  assert.notEqual(fromId, toId, "HANDOFF_IDS_MUST_DIFFER");

  assert.equal(candidateFromManifest?.id, fromId, "HANDOFF_FROM_ID_CHANGED");
  assert.equal(
    candidateFromManifest?.branch,
    baseFromManifest?.branch,
    "HANDOFF_FROM_BRANCH_CHANGED",
  );
  assert.equal(
    candidateFromManifest?.baseSha,
    baseFromManifest?.baseSha,
    "HANDOFF_FROM_BASE_CHANGED",
  );
  assert.equal(
    candidateFromManifest?.state,
    "MERGED",
    "HANDOFF_FROM_NOT_MERGED",
  );
  assert.deepEqual(
    {
      ...candidateFromManifest?.owns,
      paths: sortedStrings(
        candidateFromManifest?.owns?.paths,
        "HANDOFF_FROM_OWNERSHIP_REQUIRED",
      ),
    },
    {
      ...baseFromManifest?.owns,
      paths: sortedStrings(
        baseFromManifest?.owns?.paths,
        "HANDOFF_BASE_OWNERSHIP_REQUIRED",
      ),
    },
    "HANDOFF_FROM_OWNERSHIP_CHANGED",
  );
  assert.equal(
    toManifest?.state,
    "IMPLEMENTING",
    "HANDOFF_TO_NOT_IMPLEMENTING",
  );
  assert.ok(
    Array.isArray(toManifest?.dependencies) &&
      toManifest.dependencies.includes(fromId),
    "HANDOFF_DEPENDENCY_MISSING",
  );

  const baseClaim = baseRegistry.claims?.[fromId];
  assert.ok(baseClaim, "HANDOFF_BASE_CLAIM_MISSING");
  assert.ok(
    ACTIVE_CLAIM_STATUSES.has(baseClaim.status),
    "HANDOFF_BASE_CLAIM_INACTIVE",
  );
  assert.ok(
    parseExpiry(baseClaim.expiresAt) > now,
    "HANDOFF_BASE_CLAIM_EXPIRED",
  );
  assert.equal(
    baseClaim.reviewer,
    "AUTOMATED-INDEPENDENT-PROOF",
    "HANDOFF_BASE_REVIEW_AUTHORITY_INVALID",
  );
  assert.equal(
    baseClaim.branch,
    baseFromManifest.branch,
    "HANDOFF_BASE_BRANCH_MISMATCH",
  );
  assert.equal(
    baseClaim.baseSha,
    baseFromManifest.baseSha,
    "HANDOFF_BASE_SHA_MISMATCH",
  );
  assert.deepEqual(
    sortedStrings(baseClaim.paths, "HANDOFF_BASE_PATHS_REQUIRED"),
    sortedStrings(
      baseFromManifest.owns?.paths,
      "HANDOFF_BASE_OWNERSHIP_REQUIRED",
    ),
    "HANDOFF_BASE_PATHS_MISMATCH",
  );

  assert.equal(
    candidateRegistry.claims?.[fromId],
    undefined,
    "HANDOFF_OLD_CLAIM_STILL_ACTIVE",
  );

  const toClaim = candidateRegistry.claims?.[toId];
  assert.ok(toClaim, "HANDOFF_TARGET_CLAIM_MISSING");
  assert.equal(toClaim.status, "IMPLEMENTING", "HANDOFF_TARGET_STATUS_INVALID");
  assert.equal(
    toClaim.reviewer,
    "AUTOMATED-INDEPENDENT-PROOF",
    "HANDOFF_TARGET_REVIEW_AUTHORITY_INVALID",
  );
  assert.equal(
    toClaim.branch,
    toManifest.branch,
    "HANDOFF_TARGET_BRANCH_MISMATCH",
  );
  assert.equal(
    toClaim.baseSha,
    toManifest.baseSha,
    "HANDOFF_TARGET_BASE_MISMATCH",
  );
  assert.ok(
    parseExpiry(toClaim.expiresAt) > now,
    "HANDOFF_TARGET_CLAIM_EXPIRED",
  );
  assert.deepEqual(
    sortedStrings(toClaim.paths, "HANDOFF_TARGET_PATHS_REQUIRED"),
    sortedStrings(toManifest.owns?.paths, "HANDOFF_TARGET_OWNERSHIP_REQUIRED"),
    "HANDOFF_TARGET_PATHS_MISMATCH",
  );

  for (const pattern of toClaim.paths) assertSupportedPattern(pattern);
  assert.deepEqual(
    findClaimCollisions(candidateRegistry, toId, now),
    [],
    "HANDOFF_TARGET_OVERLAP_DETECTED",
  );

  return {
    fromId,
    toId,
    fromState: candidateFromManifest.state,
    toState: toManifest.state,
    targetBranch: toManifest.branch,
    targetBaseSha: toManifest.baseSha,
    targetStatus: toClaim.status,
    authority: "ORCHESTRATOR",
    collisions: 0,
  };
}

export function buildClaimHandoffProof(
  baseRoot,
  candidateRoot,
  env = process.env,
) {
  const trustedRoot = resolve(baseRoot);
  const targetRoot = resolve(candidateRoot);
  const expectedHead = env.EXPECTED_CANDIDATE_SHA ?? "";
  const expectedBase = env.EXPECTED_BASE_SHA ?? "";
  const expectedBranch = env.EXPECTED_BRANCH ?? "";
  const reconciliationManifestPath = env.MANIFEST_PATH ?? "";
  const fromManifestPath = env.HANDOFF_FROM_MANIFEST_PATH ?? "";
  const toManifestPath = env.HANDOFF_TO_MANIFEST_PATH ?? "";
  const registryPath =
    env.CLAIM_REGISTRY_PATH ?? ".github/morro-control/claims.json";

  assert.match(expectedHead, SHA_PATTERN, "EXPECTED_HEAD_INVALID");
  assert.match(expectedBase, SHA_PATTERN, "EXPECTED_BASE_INVALID");
  assert.ok(expectedBranch, "EXPECTED_BRANCH_REQUIRED");
  assert.ok(reconciliationManifestPath, "MANIFEST_PATH_REQUIRED");
  assert.ok(fromManifestPath, "HANDOFF_FROM_MANIFEST_PATH_REQUIRED");
  assert.ok(toManifestPath, "HANDOFF_TO_MANIFEST_PATH_REQUIRED");
  assert.notEqual(
    reconciliationManifestPath,
    fromManifestPath,
    "HANDOFF_RECONCILIATION_EQUALS_SOURCE_MANIFEST",
  );
  assert.notEqual(
    reconciliationManifestPath,
    toManifestPath,
    "HANDOFF_RECONCILIATION_EQUALS_TARGET_MANIFEST",
  );

  const baseHead = git(trustedRoot, ["rev-parse", "HEAD"]);
  const candidateHead = git(targetRoot, ["rev-parse", "HEAD"]);
  const treeSha = git(targetRoot, ["rev-parse", "HEAD^{tree}"]);
  assert.equal(baseHead, expectedBase, "HANDOFF_BASE_SHA_MISMATCH");
  assert.equal(candidateHead, expectedHead, "CANDIDATE_SHA_MISMATCH");
  assert.ok(
    isGitAncestor(targetRoot, expectedBase, candidateHead),
    "HANDOFF_BASE_NOT_ANCESTOR",
  );

  const dirty = git(targetRoot, [
    "status",
    "--porcelain",
    "--untracked-files=all",
  ]);
  assert.equal(dirty, "", "DIRTY_CANDIDATE_WORKTREE");

  const baseRegistry = JSON.parse(
    readFileSync(resolveCandidatePath(trustedRoot, registryPath), "utf8"),
  );
  const candidateRegistry = JSON.parse(
    readFileSync(resolveCandidatePath(targetRoot, registryPath), "utf8"),
  );
  const baseFromManifest = JSON.parse(
    readFileSync(resolveCandidatePath(trustedRoot, fromManifestPath), "utf8"),
  );
  const candidateFromManifest = JSON.parse(
    readFileSync(resolveCandidatePath(targetRoot, fromManifestPath), "utf8"),
  );
  const toManifest = JSON.parse(
    readFileSync(resolveCandidatePath(targetRoot, toManifestPath), "utf8"),
  );
  const reconciliationManifest = JSON.parse(
    readFileSync(
      resolveCandidatePath(targetRoot, reconciliationManifestPath),
      "utf8",
    ),
  );

  const changedRaw = git(targetRoot, [
    "diff",
    "--name-only",
    `${expectedBase}...${candidateHead}`,
  ]);
  const changedFiles = changedRaw ? changedRaw.split("\n").filter(Boolean) : [];

  assert.match(
    reconciliationManifest.id ?? "",
    /^MD-[A-Z0-9-]+$/u,
    "HANDOFF_RECONCILIATION_ID_INVALID",
  );
  assert.notEqual(
    reconciliationManifest.id,
    baseFromManifest.id,
    "HANDOFF_RECONCILIATION_ID_COLLIDES_WITH_SOURCE",
  );
  assert.notEqual(
    reconciliationManifest.id,
    toManifest.id,
    "HANDOFF_RECONCILIATION_ID_COLLIDES_WITH_TARGET",
  );
  assert.equal(
    reconciliationManifest.baseSha,
    expectedBase,
    "HANDOFF_RECONCILIATION_BASE_MISMATCH",
  );
  assert.equal(
    reconciliationManifest.branch,
    expectedBranch,
    "HANDOFF_RECONCILIATION_BRANCH_MISMATCH",
  );
  assert.equal(
    reconciliationManifest.state,
    "MERGE_READY",
    "HANDOFF_RECONCILIATION_NOT_MERGE_READY",
  );
  assert.equal(
    toManifest.baseSha,
    expectedBase,
    "HANDOFF_TARGET_BASE_NOT_CURRENT_BASE",
  );

  for (const requiredPath of [
    registryPath,
    fromManifestPath,
    toManifestPath,
    reconciliationManifestPath,
  ]) {
    assert.ok(
      reconciliationManifest.owns?.paths?.includes(requiredPath),
      "HANDOFF_RECONCILIATION_OWNERSHIP_INCOMPLETE",
    );
  }

  const unauthorized = changedFiles.filter(
    (path) =>
      !reconciliationManifest.owns.paths.some((pattern) =>
        pathOwned(path, pattern),
      ),
  );
  assert.deepEqual(
    unauthorized,
    [],
    "HANDOFF_RECONCILIATION_CHANGED_PATH_VIOLATION",
  );

  const handoff = validateClaimHandoff({
    baseRegistry,
    candidateRegistry,
    baseFromManifest,
    candidateFromManifest,
    toManifest,
  });

  return {
    contract: "MORRO-DETERMINISTIC-CLAIM-HANDOFF",
    status: "pass",
    failClosed: true,
    exactHead: candidateHead,
    treeSha,
    currentBaseSha: baseHead,
    reconciliationChangeSetId: reconciliationManifest.id,
    reconciliationBranch: reconciliationManifest.branch,
    changedFiles,
    ...handoff,
  };
}

export function buildClaimGuardProof(root, env = process.env) {
  const targetRoot = resolve(root);
  const expectedHead = env.EXPECTED_CANDIDATE_SHA ?? "";
  const expectedBase = env.EXPECTED_BASE_SHA ?? "";
  const expectedBranch = env.EXPECTED_BRANCH ?? "";
  const manifestPath = env.MANIFEST_PATH ?? "";
  const registryPath =
    env.CLAIM_REGISTRY_PATH ?? ".github/morro-control/claims.json";
  const authority = env.CLAIM_GUARD_AUTHORITY ?? "WORKER";

  assert.match(expectedHead, SHA_PATTERN, "EXPECTED_HEAD_INVALID");
  assert.match(expectedBase, SHA_PATTERN, "EXPECTED_BASE_INVALID");
  assert.ok(expectedBranch, "EXPECTED_BRANCH_REQUIRED");
  assert.ok(manifestPath, "MANIFEST_PATH_REQUIRED");

  const dirty = git(targetRoot, [
    "status",
    "--porcelain",
    "--untracked-files=all",
  ]);
  assert.equal(dirty, "", "DIRTY_CANDIDATE_WORKTREE");

  const headSha = git(targetRoot, ["rev-parse", "HEAD"]);
  const treeSha = git(targetRoot, ["rev-parse", "HEAD^{tree}"]);
  assert.equal(headSha, expectedHead, "CANDIDATE_SHA_MISMATCH");
  assert.ok(
    isGitAncestor(targetRoot, expectedBase, headSha),
    "CURRENT_BASE_NOT_ANCESTOR",
  );

  const manifestFile = resolveCandidatePath(targetRoot, manifestPath);
  const registryFile = resolveCandidatePath(targetRoot, registryPath);
  const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
  const registry = JSON.parse(readFileSync(registryFile, "utf8"));

  const changedRaw = git(targetRoot, [
    "diff",
    "--name-only",
    `${expectedBase}...${headSha}`,
  ]);
  const changedFiles = changedRaw ? changedRaw.split("\n").filter(Boolean) : [];

  // Only an exact acquisition or bounded base renewal may use bookkeeping.
  // Derive eligibility from committed base/candidate data, never from an env toggle.
  let acquisition = false;
  let reanchorProof;
  const canonicalRegistryPath = ".github/morro-control/claims.json";
  const ledgerPath = ".github/morro-control/events.ndjson";
  if (
    authority === "ORCHESTRATOR" &&
    changedFiles.includes(canonicalRegistryPath)
  ) {
    assert.equal(
      registryPath,
      canonicalRegistryPath,
      "ACQUISITION_REGISTRY_PATH_INVALID",
    );
    const canonicalRegistry = JSON.parse(
      git(targetRoot, ["show", `${expectedBase}:${canonicalRegistryPath}`]),
    );
    if (!Object.hasOwn(canonicalRegistry.claims ?? {}, manifest.id)) {
      const canonicalManifestPath = `.morro/changesets/${manifest.id}.json`;
      assert.equal(
        manifestPath,
        canonicalManifestPath,
        "ACQUISITION_MANIFEST_PATH_INVALID",
      );
      const expectedChanges = [
        `M\t${canonicalRegistryPath}`,
        `M\t${ledgerPath}`,
        `A\t${canonicalManifestPath}`,
      ].sort();
      const actualChanges = git(targetRoot, [
        "diff",
        "--no-renames",
        "--name-status",
        `${expectedBase}...${headSha}`,
      ])
        .split("\n")
        .sort();
      assert.deepEqual(
        actualChanges,
        expectedChanges,
        "ACQUISITION_EXACT_FILE_TRANSITION_REQUIRED",
      );
      for (const path of [
        canonicalRegistryPath,
        ledgerPath,
        canonicalManifestPath,
      ]) {
        const entry = git(targetRoot, ["ls-tree", headSha, "--", path]);
        assert.ok(
          entry.startsWith("100644 blob ") && entry.endsWith(`\t${path}`),
          "ACQUISITION_REGULAR_FILE_REQUIRED",
        );
      }
      // Preserve historical bytes as well as validated event semantics.
      const canonicalLedger = execFileSync(
        "git",
        ["-C", targetRoot, "show", `${expectedBase}:${ledgerPath}`],
        { encoding: "utf8" },
      );
      const candidateLedger = readFileSync(
        resolveCandidatePath(targetRoot, ledgerPath),
        "utf8",
      );
      assert.ok(
        candidateLedger.startsWith(canonicalLedger),
        "ACQUISITION_LEDGER_BYTES_MUTATED",
      );
      validateClaimAcquisitionTransition({
        manifest,
        registry,
        canonicalRegistry,
        claimId: manifest.id,
        canonicalEvents: parseAuthorityLedger(canonicalLedger),
        events: parseAuthorityLedger(candidateLedger),
        branch: expectedBranch,
        baseSha: expectedBase,
        headSha,
        authorizationPaths: changedFiles,
        changedFileCount: changedFiles.length,
      });
      acquisition = true;
    } else if (
      !manifest.owns.paths.some((pattern) =>
        pathOwned(canonicalRegistryPath, pattern),
      )
    ) {
      reanchorProof = buildClaimReanchorProof(targetRoot, {
        baseSha: expectedBase,
        headSha,
        manifestPath,
      });
    }
  }

  const claim = validateClaimContext({
    registry,
    manifest,
    branch: expectedBranch,
    allowSerializedAcquisitionBookkeeping: acquisition,
    reanchorProof,
    currentBaseSha: expectedBase,
    branchHeadSha: headSha,
    changedFiles,
    authority,
    isAncestor: (ancestor, descendant) =>
      isGitAncestor(targetRoot, ancestor, descendant),
  });

  return {
    contract: "MORRO-DETERMINISTIC-CLAIM-GUARD",
    status: "pass",
    failClosed: true,
    exactHead: headSha,
    treeSha,
    acquisition,
    reanchor: reanchorProof !== undefined,
    transientOrchestratorPaths:
      acquisition || reanchorProof !== undefined
        ? [...SERIALIZED_ACQUISITION_BOOKKEEPING_PATHS]
        : [],
    ...claim,
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
    "UNEXPECTED_CLAIM_GUARD_ERROR"
  );
}

const invokedDirectly =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  try {
    if (process.argv[2] === "--handoff") {
      console.log(
        JSON.stringify(
          buildClaimHandoffProof(
            process.argv[3] ?? ".",
            process.argv[4] ?? ".",
          ),
        ),
      );
    } else {
      console.log(JSON.stringify(buildClaimGuardProof(process.argv[2] ?? ".")));
    }
  } catch (cause) {
    console.error(`MORRO_CLAIM_GUARD_FAILED:${diagnosticCode(cause)}`);
    process.exitCode = 1;
  }
}
