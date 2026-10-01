import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { canonicalJson, validateChangeSetV2 } from "./changeset-v2.mjs";

const LEASE_ID = /^lease-[A-Za-z0-9._-]{1,120}$/u;
const OWNER = /^[A-Za-z0-9._:@/-]{1,120}$/u;
const CAPABILITY = /^[a-z0-9][a-z0-9:._/-]{0,159}$/u;
const ACTIVE = new Set(["ACTIVE", "RELEASED", "EXPIRED"]);
const AUTHORITIES = new Set(["ORCHESTRATOR", "TASK_LOCAL_PROJECTION"]);
const REGISTRY_KEYS = new Set(["schemaVersion", "authority", "leases"]);
const LEASE_KEYS = new Set([
  "leaseId",
  "changeSetId",
  "owner",
  "capability",
  "scope",
  "branch",
  "issuedAt",
  "expiresAt",
  "state",
]);

function assertClosedObject(value, allowed, code) {
  assert.ok(
    value && typeof value === "object" && !Array.isArray(value),
    code + "_OBJECT_INVALID",
  );
  for (const key of Object.keys(value))
    assert.ok(allowed.has(key), code + "_PROPERTY_UNKNOWN:" + key);
  return value;
}

const parseTime = (value, code) => {
  const ms = Date.parse(value ?? "");
  assert.ok(Number.isFinite(ms), code);
  return ms;
};

function clone(value) {
  return structuredClone(value);
}

export function createLeaseRegistry(authority = "TASK_LOCAL_PROJECTION") {
  assert.ok(AUTHORITIES.has(authority), "LEASE_REGISTRY_AUTHORITY_INVALID");
  return { schemaVersion: 1, authority, leases: {} };
}

export function validateLeaseRegistry(registry) {
  assertClosedObject(registry, REGISTRY_KEYS, "LEASE_REGISTRY");
  assert.equal(registry?.schemaVersion, 1, "LEASE_REGISTRY_SCHEMA_INVALID");
  assert.ok(
    AUTHORITIES.has(registry?.authority),
    "LEASE_REGISTRY_AUTHORITY_INVALID",
  );
  assert.ok(
    registry?.leases &&
      typeof registry.leases === "object" &&
      !Array.isArray(registry.leases),
    "LEASE_REGISTRY_ENTRIES_INVALID",
  );

  for (const [key, lease] of Object.entries(registry.leases)) {
    assertClosedObject(lease, LEASE_KEYS, "LEASE");
    assert.match(key, LEASE_ID, "LEASE_ID_INVALID");
    assert.equal(lease?.leaseId, key, "LEASE_KEY_ID_MISMATCH");
    assert.match(
      lease.changeSetId ?? "",
      /^MD-[A-Z0-9-]+$/u,
      "LEASE_CHANGESET_INVALID",
    );
    assert.match(lease.owner ?? "", OWNER, "LEASE_OWNER_INVALID");
    assert.match(
      lease.capability ?? "",
      CAPABILITY,
      "LEASE_CAPABILITY_INVALID",
    );
    assert.ok(
      [
        "PLATFORM",
        "DESTINATION:MORRO",
        "DESTINATION:ITACARE",
        "CROSS_DESTINATION",
      ].includes(lease.scope),
      "LEASE_SCOPE_INVALID",
    );
    assert.ok(
      typeof lease.branch === "string" &&
        lease.branch.length > 0 &&
        lease.branch.length <= 240,
      "LEASE_BRANCH_INVALID",
    );
    const issued = parseTime(lease.issuedAt, "LEASE_ISSUED_AT_INVALID");
    const expires = parseTime(lease.expiresAt, "LEASE_EXPIRES_AT_INVALID");
    assert.ok(expires > issued, "LEASE_INTERVAL_INVALID");
    assert.ok(ACTIVE.has(lease.state), "LEASE_STATE_INVALID");
  }
  return registry;
}

export function leaseRegistryDigest(registry) {
  validateLeaseRegistry(registry);
  return (
    "sha256:" +
    createHash("sha256").update(canonicalJson(registry)).digest("hex")
  );
}

function expireStale(registry, nowMs) {
  for (const lease of Object.values(registry.leases)) {
    if (lease.state === "ACTIVE" && parseTime(lease.expiresAt) <= nowMs)
      lease.state = "EXPIRED";
  }
}

function assertMutationAuthority(registry) {
  assert.equal(
    registry.authority,
    "TASK_LOCAL_PROJECTION",
    "LEASE_REGISTRY_MUTATION_AUTHORITY_INVALID",
  );
}

function leaseKey(lease) {
  return lease.scope + "|" + lease.capability;
}

export function acquireCapabilityLeases({
  registry,
  changeSet,
  owner,
  branch = changeSet?.branch,
  now = new Date(),
  ttlSeconds = 1800,
  idFactory = randomUUID,
}) {
  validateChangeSetV2(changeSet);
  validateLeaseRegistry(registry);
  assertMutationAuthority(registry);
  assert.match(owner ?? "", OWNER, "LEASE_OWNER_INVALID");
  assert.equal(branch, changeSet.branch, "LEASE_BRANCH_CHANGESET_MISMATCH");
  assert.ok(
    Number.isInteger(ttlSeconds) && ttlSeconds >= 60 && ttlSeconds <= 7200,
    "LEASE_TTL_INVALID",
  );

  const nowMs = parseTime(
    now instanceof Date ? now.toISOString() : now,
    "LEASE_NOW_INVALID",
  );
  const next = clone(registry);
  expireStale(next, nowMs);
  const acquired = [];

  for (const capability of changeSet.requiredCapabilities) {
    const exact = Object.values(next.leases).find(
      (lease) =>
        lease.state === "ACTIVE" &&
        lease.changeSetId === changeSet.id &&
        lease.owner === owner &&
        lease.branch === branch &&
        lease.scope === changeSet.scope &&
        lease.capability === capability,
    );
    if (exact) {
      acquired.push(exact);
      continue;
    }

    const conflict = Object.values(next.leases).find(
      (lease) =>
        lease.state === "ACTIVE" &&
        leaseKey(lease) === changeSet.scope + "|" + capability,
    );
    assert.equal(conflict, undefined, "CAPABILITY_LEASE_CONFLICT");

    const leaseId = "lease-" + idFactory();
    assert.match(leaseId, LEASE_ID, "LEASE_ID_INVALID");
    assert.equal(next.leases[leaseId], undefined, "LEASE_ID_DUPLICATE");
    const issuedAt = new Date(nowMs).toISOString();
    const expiresAt = new Date(nowMs + ttlSeconds * 1000).toISOString();
    const lease = {
      leaseId,
      changeSetId: changeSet.id,
      owner,
      capability,
      scope: changeSet.scope,
      branch,
      issuedAt,
      expiresAt,
      state: "ACTIVE",
    };
    next.leases[leaseId] = lease;
    acquired.push(lease);
  }

  validateLeaseRegistry(next);
  return { registry: next, leases: acquired };
}

export function renewCapabilityLeases({
  registry,
  leaseIds,
  changeSetId,
  owner,
  branch,
  now = new Date(),
  ttlSeconds = 1800,
}) {
  validateLeaseRegistry(registry);
  assertMutationAuthority(registry);
  assert.ok(
    Array.isArray(leaseIds) && leaseIds.length > 0,
    "LEASE_IDS_REQUIRED",
  );
  assert.ok(
    Number.isInteger(ttlSeconds) && ttlSeconds >= 60 && ttlSeconds <= 7200,
    "LEASE_TTL_INVALID",
  );
  const nowMs = parseTime(
    now instanceof Date ? now.toISOString() : now,
    "LEASE_NOW_INVALID",
  );
  const next = clone(registry);
  expireStale(next, nowMs);

  for (const leaseId of leaseIds) {
    const lease = next.leases[leaseId];
    assert.ok(lease, "LEASE_NOT_FOUND");
    assert.equal(lease.state, "ACTIVE", "LEASE_NOT_ACTIVE");
    assert.equal(lease.changeSetId, changeSetId, "LEASE_CHANGESET_MISMATCH");
    assert.equal(lease.owner, owner, "LEASE_OWNER_MISMATCH");
    assert.equal(lease.branch, branch, "LEASE_BRANCH_MISMATCH");
    lease.expiresAt = new Date(nowMs + ttlSeconds * 1000).toISOString();
  }

  validateLeaseRegistry(next);
  return next;
}

export function releaseCapabilityLeases({
  registry,
  leaseIds,
  changeSetId,
  owner,
  branch,
}) {
  validateLeaseRegistry(registry);
  assertMutationAuthority(registry);
  assert.ok(
    Array.isArray(leaseIds) && leaseIds.length > 0,
    "LEASE_IDS_REQUIRED",
  );
  const next = clone(registry);
  for (const leaseId of leaseIds) {
    const lease = next.leases[leaseId];
    assert.ok(lease, "LEASE_NOT_FOUND");
    assert.equal(lease.changeSetId, changeSetId, "LEASE_CHANGESET_MISMATCH");
    assert.equal(lease.owner, owner, "LEASE_OWNER_MISMATCH");
    assert.equal(lease.branch, branch, "LEASE_BRANCH_MISMATCH");
    assert.ok(
      ["ACTIVE", "EXPIRED"].includes(lease.state),
      "LEASE_RELEASE_INVALID",
    );
    lease.state = "RELEASED";
  }
  validateLeaseRegistry(next);
  return next;
}

export function assertRequiredCapabilityLeases({
  registry,
  changeSet,
  owner,
  branch = changeSet?.branch,
  now = new Date(),
}) {
  validateChangeSetV2(changeSet);
  validateLeaseRegistry(registry);
  const nowMs = parseTime(
    now instanceof Date ? now.toISOString() : now,
    "LEASE_NOW_INVALID",
  );
  const leases = Object.values(registry.leases).filter(
    (lease) =>
      lease.state === "ACTIVE" &&
      parseTime(lease.expiresAt) > nowMs &&
      lease.changeSetId === changeSet.id &&
      lease.owner === owner &&
      lease.branch === branch &&
      lease.scope === changeSet.scope,
  );
  for (const capability of changeSet.requiredCapabilities) {
    const matching = leases.filter((lease) => lease.capability === capability);
    assert.equal(matching.length, 1, "REQUIRED_CAPABILITY_LEASE_MISSING");
  }
  return leases;
}
