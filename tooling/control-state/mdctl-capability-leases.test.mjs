import assert from "node:assert/strict";
import test from "node:test";
import {
  acquireCapabilityLeases,
  assertRequiredCapabilityLeases,
  createLeaseRegistry,
  leaseRegistryDigest,
  releaseCapabilityLeases,
  renewCapabilityLeases,
} from "../mdctl/capability-leases.mjs";

function changeSet(id = "MD-LEASE-TEST") {
  return {
    schemaVersion: 2,
    id,
    baseSha: "a".repeat(40),
    branch: "infra/lease-test",
    state: "IMPLEMENTING",
    risk: "high",
    scope: "PLATFORM",
    owns: { paths: ["tooling/mdctl/**"], contracts: [] },
    reads: { contracts: [] },
    produces: { events: [], routes: [] },
    database: { tables: [] },
    auth: { capabilities: [] },
    dependencies: [],
    requiredEvidence: ["remote-proof"],
    requiredCapabilities: ["github:read", "workspace:write:claimed-paths"],
    contextPack: {
      maxBytes: 65536,
      include: ["changeset", "git-identity"],
    },
    proof: {
      budget: { maxCommands: 1, maxSeconds: 60 },
      commands: [
        {
          id: "unit",
          argv: ["node", "--test", "tooling/test.test.mjs"],
          timeoutSeconds: 30,
        },
      ],
      requiredRemoteEvidence: ["remote-proof"],
    },
    stopAt: "REMOTE_PROVEN",
  };
}

test("capability acquisition is complete, idempotent and digestable", () => {
  const ids = ["a", "b"];
  let index = 0;
  const first = acquireCapabilityLeases({
    registry: createLeaseRegistry(),
    changeSet: changeSet(),
    owner: "worker-1",
    now: "2026-10-01T09:00:00Z",
    idFactory: () => ids[index++],
  });
  assert.equal(first.leases.length, 2);
  assert.equal(
    assertRequiredCapabilityLeases({
      registry: first.registry,
      changeSet: changeSet(),
      owner: "worker-1",
      now: "2026-10-01T09:01:00Z",
    }).length,
    2,
  );
  const second = acquireCapabilityLeases({
    registry: first.registry,
    changeSet: changeSet(),
    owner: "worker-1",
    now: "2026-10-01T09:02:00Z",
    idFactory: () => "unused",
  });
  assert.deepEqual(
    second.leases.map((lease) => lease.leaseId),
    first.leases.map((lease) => lease.leaseId),
  );
  assert.match(leaseRegistryDigest(second.registry), /^sha256:[0-9a-f]{64}$/u);
});

test("conflicting active capability lease fails closed", () => {
  const acquired = acquireCapabilityLeases({
    registry: createLeaseRegistry(),
    changeSet: changeSet(),
    owner: "worker-1",
    now: "2026-10-01T09:00:00Z",
    idFactory: () => Math.random().toString(36).slice(2),
  });
  const other = changeSet("MD-LEASE-OTHER");
  assert.throws(
    () =>
      acquireCapabilityLeases({
        registry: acquired.registry,
        changeSet: other,
        owner: "worker-2",
        now: "2026-10-01T09:01:00Z",
        idFactory: () => "other",
      }),
    /CAPABILITY_LEASE_CONFLICT/u,
  );
});

test("expired lease no longer proves capability and can be reacquired", () => {
  const first = acquireCapabilityLeases({
    registry: createLeaseRegistry(),
    changeSet: changeSet(),
    owner: "worker-1",
    now: "2026-10-01T09:00:00Z",
    ttlSeconds: 60,
    idFactory: (() => {
      let n = 0;
      return () => "old-" + ++n;
    })(),
  });
  assert.throws(
    () =>
      assertRequiredCapabilityLeases({
        registry: first.registry,
        changeSet: changeSet(),
        owner: "worker-1",
        now: "2026-10-01T09:02:00Z",
      }),
    /REQUIRED_CAPABILITY_LEASE_MISSING/u,
  );
  let n = 0;
  const replacement = acquireCapabilityLeases({
    registry: first.registry,
    changeSet: changeSet(),
    owner: "worker-2",
    now: "2026-10-01T09:02:00Z",
    idFactory: () => "new-" + ++n,
  });
  assert.equal(replacement.leases.length, 2);
});

test("renew and release require exact owner changeset and branch", () => {
  let n = 0;
  const first = acquireCapabilityLeases({
    registry: createLeaseRegistry(),
    changeSet: changeSet(),
    owner: "worker-1",
    now: "2026-10-01T09:00:00Z",
    idFactory: () => "id-" + ++n,
  });
  const ids = first.leases.map((lease) => lease.leaseId);
  const renewed = renewCapabilityLeases({
    registry: first.registry,
    leaseIds: ids,
    changeSetId: "MD-LEASE-TEST",
    owner: "worker-1",
    branch: "infra/lease-test",
    now: "2026-10-01T09:10:00Z",
  });
  const released = releaseCapabilityLeases({
    registry: renewed,
    leaseIds: ids,
    changeSetId: "MD-LEASE-TEST",
    owner: "worker-1",
    branch: "infra/lease-test",
  });
  assert.ok(ids.every((id) => released.leases[id].state === "RELEASED"));
});
