import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, rename, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { findClaimCollisions, pathOwned } from "../fabric/claim-guard.mjs";
import {
  collectClaimRetirementEvidence,
  validateCandidateRetirementManifest,
  validateClaimRetirements,
  validateRetirementEvents,
} from "../fabric/claim-retirement-proof.mjs";
import {
  parseAuthorityLedger,
  validateAuthorityEvent,
} from "./event-ledger.mjs";
import { validateChangeSetV2 } from "./changeset-v2.mjs";

const SHA = /^[0-9a-f]{40}$/u;
const OWNER = /^[A-Za-z0-9._:@/-]{1,120}$/u;
const CLAIM_ID = /^MD-[A-Z0-9-]+$/u;
const BOOKKEEPING = Object.freeze([
  ".github/morro-control/claims.json",
  ".github/morro-control/events.ndjson",
]);
const RISK_TO_PRIORITY = Object.freeze({
  low: "P3",
  medium: "P2",
  high: "P1",
  critical: "P0",
});

function assertRegistry(registry) {
  assert.equal(
    registry?.registryAuthority,
    "ORCHESTRATOR",
    "CLAIM_LIFECYCLE_REGISTRY_AUTHORITY_INVALID",
  );
  assert.ok(
    registry.claims &&
      typeof registry.claims === "object" &&
      !Array.isArray(registry.claims),
    "CLAIM_LIFECYCLE_REGISTRY_INVALID",
  );
  return registry;
}

function iso(value, code) {
  const ms = Date.parse(value ?? "");
  assert.ok(Number.isFinite(ms), code);
  return new Date(ms).toISOString();
}

function eventId(observedAt, claimId, suffix) {
  const stamp = observedAt.replaceAll(/[^0-9]/gu, "").slice(0, 14);
  return "evt-" + stamp + "-" + claimId.toLowerCase() + "-" + suffix;
}

function appendEvents(ledgerText, events) {
  const canonical = String(ledgerText);
  parseAuthorityLedger(canonical);
  for (const event of events) validateAuthorityEvent(event);
  const prefix = canonical.length > 0 && !canonical.endsWith("\n") ? "\n" : "";
  const candidate =
    canonical +
    prefix +
    events.map((event) => JSON.stringify(event)).join("\n") +
    "\n";
  parseAuthorityLedger(candidate);
  return candidate;
}

function assertNoPersistentBookkeepingClaim(manifest) {
  for (const path of BOOKKEEPING) {
    assert.equal(
      manifest.owns.paths.some((pattern) => pathOwned(path, pattern)),
      false,
      "CLAIM_LIFECYCLE_PERSISTENT_BOOKKEEPING_FORBIDDEN:" + path,
    );
  }
}

export function buildClaimAcquisition({
  registry,
  ledgerText,
  manifest,
  owner = "CHATGPT-PRO-CONTROL",
  reviewer = "AUTOMATED-INDEPENDENT-PROOF",
  expiresAt,
  observedAt,
  domains,
  sourceSha = manifest?.baseSha,
}) {
  assertRegistry(registry);
  validateChangeSetV2(manifest);
  assert.equal(manifest.state, "IMPLEMENTING", "CLAIM_ACQUIRE_STATE_INVALID");
  assert.match(manifest.id ?? "", CLAIM_ID, "CLAIM_ACQUIRE_ID_INVALID");
  assert.match(owner ?? "", OWNER, "CLAIM_ACQUIRE_OWNER_INVALID");
  assert.equal(
    reviewer,
    "AUTOMATED-INDEPENDENT-PROOF",
    "CLAIM_ACQUIRE_REVIEWER_INVALID",
  );
  assert.match(sourceSha ?? "", SHA, "CLAIM_ACQUIRE_SOURCE_INVALID");
  assert.equal(sourceSha, manifest.baseSha, "CLAIM_ACQUIRE_BASE_MISMATCH");
  const observed = iso(observedAt, "CLAIM_ACQUIRE_TIME_INVALID");
  const expiry = iso(expiresAt, "CLAIM_ACQUIRE_EXPIRY_INVALID");
  assert.ok(
    Date.parse(expiry) > Date.parse(observed),
    "CLAIM_ACQUIRE_EXPIRY_NOT_FUTURE",
  );
  assert.equal(
    Object.hasOwn(registry.claims, manifest.id),
    false,
    "CLAIM_ACQUIRE_ALREADY_EXISTS",
  );
  assertNoPersistentBookkeepingClaim(manifest);
  assert.ok(
    Array.isArray(domains) &&
      domains.length > 0 &&
      domains.every(
        (domain) =>
          typeof domain === "string" && /^[a-z][a-z0-9-]{1,79}$/u.test(domain),
      ) &&
      new Set(domains).size === domains.length,
    "CLAIM_ACQUIRE_DOMAINS_REQUIRED",
  );

  const claim = {
    owner,
    reviewer,
    branch: manifest.branch,
    baseSha: manifest.baseSha,
    paths: [...manifest.owns.paths],
    domains: [...domains],
    risk: RISK_TO_PRIORITY[manifest.risk],
    status: "IMPLEMENTING",
    expiresAt: expiry,
  };
  const candidateRegistry = {
    ...registry,
    claims: { ...registry.claims, [manifest.id]: claim },
  };
  const collisions = findClaimCollisions(
    candidateRegistry,
    manifest.id,
    Date.parse(observed),
  );
  assert.deepEqual(collisions, [], "CLAIM_ACQUIRE_COLLISION");

  const events = [
    {
      schemaVersion: 1,
      eventId: eventId(observed, manifest.id, "created"),
      eventType: "CHANGESET_CREATED",
      observedAt: observed,
      actor: "ORCHESTRATOR",
      entity: manifest.id,
      sourceSha,
      payloadVersion: 1,
      payload: { branch: manifest.branch, objective: manifest.objective },
    },
    {
      schemaVersion: 1,
      eventId: eventId(observed, manifest.id, "acquired"),
      eventType: "CLAIM_ACQUIRED",
      observedAt: observed,
      actor: "ORCHESTRATOR",
      entity: manifest.id,
      sourceSha,
      payloadVersion: 1,
      payload: {
        branch: manifest.branch,
        expiresAt: expiry,
        risk: claim.risk,
      },
    },
  ];
  return {
    registry: candidateRegistry,
    manifest,
    ledgerText: appendEvents(ledgerText, events),
    events,
    claim,
  };
}

export function buildClaimReanchor({
  registry,
  ledgerText,
  manifest,
  newBaseSha,
  observedAt,
  reason = "POST_ACQUISITION_IMPLEMENTATION_REANCHOR",
}) {
  assertRegistry(registry);
  validateChangeSetV2(manifest);
  assert.match(newBaseSha ?? "", SHA, "CLAIM_REANCHOR_BASE_INVALID");
  const claim = registry.claims[manifest.id];
  assert.ok(claim, "CLAIM_REANCHOR_ACTIVE_CLAIM_REQUIRED");
  assert.equal(claim.branch, manifest.branch, "CLAIM_REANCHOR_BRANCH_MISMATCH");
  assert.equal(
    claim.baseSha,
    manifest.baseSha,
    "CLAIM_REANCHOR_MANIFEST_BASE_MISMATCH",
  );
  assert.notEqual(claim.baseSha, newBaseSha, "CLAIM_REANCHOR_BASE_UNCHANGED");
  const observed = iso(observedAt, "CLAIM_REANCHOR_TIME_INVALID");

  const nextClaim = { ...claim, baseSha: newBaseSha };
  const candidateRegistry = {
    ...registry,
    claims: { ...registry.claims, [manifest.id]: nextClaim },
  };
  const candidateManifest = { ...manifest, baseSha: newBaseSha };
  const event = {
    schemaVersion: 1,
    eventId: eventId(
      observed,
      manifest.id,
      "reanchor-" + newBaseSha.slice(0, 8),
    ),
    eventType: "CLAIM_RENEWED",
    observedAt: observed,
    actor: "ORCHESTRATOR",
    entity: manifest.id,
    sourceSha: newBaseSha,
    payloadVersion: 1,
    payload: {
      reason,
      previousBaseSha: claim.baseSha,
      currentBaseSha: newBaseSha,
      currentBranch: manifest.branch,
      authorityScopeChanged: false,
    },
  };
  return {
    registry: candidateRegistry,
    manifest: candidateManifest,
    ledgerText: appendEvents(ledgerText, [event]),
    events: [event],
    claim: nextClaim,
  };
}

export function buildClaimRetirement({
  registry,
  ledgerText,
  manifest,
  evidence,
  retirementBaseSha,
  retirementBranch,
  observedAt,
}) {
  assertRegistry(registry);
  validateChangeSetV2(manifest);
  assert.match(retirementBaseSha ?? "", SHA, "CLAIM_RETIRE_BASE_INVALID");
  assert.ok(
    typeof retirementBranch === "string" && retirementBranch.length > 0,
    "CLAIM_RETIRE_BRANCH_INVALID",
  );
  const claim = registry.claims[manifest.id];
  assert.ok(claim, "CLAIM_RETIRE_ACTIVE_CLAIM_REQUIRED");
  assert.equal(evidence?.id, manifest.id, "CLAIM_RETIRE_EVIDENCE_ID_MISMATCH");
  const observed = iso(observedAt, "CLAIM_RETIRE_TIME_INVALID");

  const claims = { ...registry.claims };
  delete claims[manifest.id];
  const candidateRegistry = { ...registry, claims };
  const candidateManifest = {
    ...manifest,
    baseSha: retirementBaseSha,
    branch: retirementBranch,
    state: evidence.reason === "MERGED_PR" ? "MERGED" : manifest.state,
  };

  validateClaimRetirements({
    baseRegistry: registry,
    candidateRegistry,
    evidenceById: { [manifest.id]: evidence },
    now: Date.parse(observed),
  });
  validateCandidateRetirementManifest(candidateManifest, {
    claimId: manifest.id,
    expectedBaseSha: retirementBaseSha,
    canonicalManifest: manifest,
    evidence,
  });

  const events =
    evidence.reason === "MERGED_PR"
      ? [
          {
            schemaVersion: 1,
            eventId: eventId(observed, manifest.id, "merged"),
            eventType: "MERGED",
            observedAt: observed,
            actor: "ORCHESTRATOR",
            entity: manifest.id,
            sourceSha: evidence.mergeSha,
            payloadVersion: 1,
            payload: {
              basis: "GITHUB_MERGED_PR_AND_MAIN_ANCESTRY",
              pullRequest: evidence.prNumber,
              mergeSha: evidence.mergeSha,
            },
          },
          {
            schemaVersion: 1,
            eventId: eventId(observed, manifest.id, "released"),
            eventType: "CLAIM_RELEASED",
            observedAt: observed,
            actor: "ORCHESTRATOR",
            entity: manifest.id,
            sourceSha: evidence.mergeSha,
            payloadVersion: 1,
            payload: {
              basis: "GITHUB_MERGED_PR_AND_MAIN_ANCESTRY",
              pullRequest: evidence.prNumber,
              mergeSha: evidence.mergeSha,
            },
          },
        ]
      : [
          {
            schemaVersion: 1,
            eventId: eventId(observed, manifest.id, "released"),
            eventType: "CLAIM_RELEASED",
            observedAt: observed,
            actor: "ORCHESTRATOR",
            entity: manifest.id,
            sourceSha: retirementBaseSha,
            payloadVersion: 1,
            payload: { reason: evidence.reason },
          },
        ];

  const candidateLedger = appendEvents(ledgerText, events);
  validateRetirementEvents({
    canonicalText: ledgerText,
    candidateText: candidateLedger,
    claimId: manifest.id,
    expectedBaseSha: retirementBaseSha,
    evidence,
  });

  return {
    registry: candidateRegistry,
    manifest: candidateManifest,
    ledgerText: candidateLedger,
    events,
    evidence,
  };
}

async function writeAtomic(path, text) {
  const temporary = path + ".tmp-" + process.pid;
  await writeFile(temporary, text, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function option(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  const value = args[index + 1];
  assert.ok(value && !value.startsWith("--"), "CLAIM_ARGUMENT_VALUE_REQUIRED");
  return value;
}

function listOption(args, name) {
  const raw = option(args, name);
  if (!raw) return null;
  const values = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  assert.ok(values.length > 0, "CLAIM_ARGUMENT_LIST_REQUIRED");
  return values;
}

function git(root, ...args) {
  return execFileSync("git", ["--no-optional-locks", "-C", root, ...args], {
    encoding: "utf8",
  }).trim();
}

export async function runClaimCli(
  args,
  {
    root = process.cwd(),
    now = () => new Date().toISOString(),
    repository = process.env.GITHUB_REPOSITORY ??
      "luizanunciostoca/touristic-digital-platform",
    token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? "",
    fetchImpl = fetch,
  } = {},
) {
  const action = args[0];
  const manifestArg = args[1];
  assert.ok(
    ["acquire", "reanchor", "retire"].includes(action),
    "CLAIM_ACTION_INVALID",
  );
  assert.ok(
    manifestArg && !manifestArg.startsWith("--"),
    "CLAIM_MANIFEST_REQUIRED",
  );
  const manifestPath = isAbsolute(manifestArg)
    ? manifestArg
    : resolve(root, manifestArg);
  const registryPath = resolve(root, ".github/morro-control/claims.json");
  const ledgerPath = resolve(root, ".github/morro-control/events.ndjson");
  const manifest = validateChangeSetV2(await readJson(manifestPath));
  const registry = assertRegistry(await readJson(registryPath));
  const ledgerText = await readFile(ledgerPath, "utf8");
  const observedAt = iso(now(), "CLAIM_TIME_INVALID");
  const branch = git(root, "branch", "--show-current");
  const status = git(root, "status", "--porcelain=v1", "--untracked-files=all");
  if (action === "acquire") {
    const manifestRelative = relative(resolve(root), manifestPath).replaceAll(
      sep,
      "/",
    );
    assert.equal(
      manifestRelative,
      ".morro/changesets/" + manifest.id + ".json",
      "CLAIM_ACQUIRE_CANONICAL_MANIFEST_REQUIRED",
    );
    const dirtyPaths = status
      ? status
          .split("\n")
          .filter(Boolean)
          .map((line) => line.slice(3).trim())
      : [];
    assert.deepEqual(
      dirtyPaths,
      [manifestRelative],
      "CLAIM_ACQUIRE_WORKTREE_SCOPE_INVALID",
    );
    assert.equal(
      git(root, "rev-parse", "HEAD"),
      manifest.baseSha,
      "CLAIM_ACQUIRE_HEAD_MUST_EQUAL_BASE",
    );
  } else {
    assert.equal(status, "", "CLAIM_LIFECYCLE_WORKTREE_DIRTY");
  }
  if (action !== "retire") {
    assert.equal(branch, manifest.branch, "CLAIM_RUNTIME_BRANCH_MISMATCH");
  }

  let transition;
  if (action === "acquire") {
    transition = buildClaimAcquisition({
      registry,
      ledgerText,
      manifest,
      owner: option(args, "--owner") ?? "CHATGPT-PRO-CONTROL",
      expiresAt: option(args, "--expires-at"),
      observedAt,
      domains: listOption(args, "--domains"),
      sourceSha: manifest.baseSha,
    });
  } else if (action === "reanchor") {
    const baseSha = option(args, "--base-sha");
    assert.match(baseSha ?? "", SHA, "CLAIM_REANCHOR_BASE_REQUIRED");
    assert.equal(
      git(root, "rev-parse", "HEAD"),
      baseSha,
      "CLAIM_REANCHOR_HEAD_MUST_EQUAL_BASE",
    );
    git(root, "merge-base", "--is-ancestor", manifest.baseSha, baseSha);
    transition = buildClaimReanchor({
      registry,
      ledgerText,
      manifest,
      newBaseSha: baseSha,
      observedAt,
    });
  } else {
    const baseSha = option(args, "--base-sha");
    assert.match(baseSha ?? "", SHA, "CLAIM_RETIRE_BASE_REQUIRED");
    assert.equal(
      git(root, "rev-parse", "HEAD"),
      baseSha,
      "CLAIM_RETIRE_HEAD_MUST_EQUAL_BASE",
    );
    const claim = registry.claims[manifest.id];
    assert.ok(claim, "CLAIM_RETIRE_ACTIVE_CLAIM_REQUIRED");
    const evidence = await collectClaimRetirementEvidence(manifest.id, claim, {
      repository,
      expectedBaseSha: baseSha,
      now: Date.parse(observedAt),
      token,
      fetchImpl,
    });
    transition = buildClaimRetirement({
      registry,
      ledgerText,
      manifest,
      evidence,
      retirementBaseSha: baseSha,
      retirementBranch: branch,
      observedAt,
    });
  }

  await writeAtomic(
    registryPath,
    JSON.stringify(transition.registry, null, 2) + "\n",
  );
  if (transition.manifest !== manifest) {
    await writeAtomic(
      manifestPath,
      JSON.stringify(transition.manifest, null, 2) + "\n",
    );
  }
  await writeAtomic(ledgerPath, transition.ledgerText);
  return {
    action,
    changeSetId: manifest.id,
    branch,
    state: transition.manifest.state,
    baseSha: transition.manifest.baseSha,
    eventTypes: transition.events.map((event) => event.eventType),
    evidenceReason: transition.evidence?.reason ?? null,
    authority: "LOCAL_TRANSITION_REQUIRES_INDEPENDENT_GIT_PROOF",
  };
}
