import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { LaneCMutationCoordinator } from "../safe-mutation.mjs";
import { SqliteLaneCMutationStore } from "../sqlite-store.mjs";

function context(overrides = {}) {
  return {
    subject: "affiliate:sqlite-001",
    authState: "active",
    authzVersion: 3,
    role: "editor",
    capabilities: ["affiliate.self_onboard"],
    tenantId: "tenant-morro",
    businessIds: [],
    destinationIds: ["morro-de-sao-paulo"],
    origin: "https://morro.example",
    expectedOrigin: "https://morro.example",
    csrfToken: "sqlite-lane-c-csrf-001",
    expectedCsrfToken: "sqlite-lane-c-csrf-001",
    executionMode: "LOCAL_PROOF",
    nowMs: 1_800_000_100_000,
    ...overrides,
  };
}

const command = {
  contractId: "IF-AFF-002",
  action: "affiliate.self_onboard",
  tenantId: "tenant-morro",
  destinationId: "morro-de-sao-paulo",
  payload: {
    accountType: "person",
    roleCategory: "guide",
    programId: "program-morro",
    acceptedTermsVersion: "terms-v1",
  },
};

test("SQLite evidence store survives restart and preserves replay semantics", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "morro-lane-c-"));
  const dbPath = path.join(dir, "lane-c.sqlite");
  let store = new SqliteLaneCMutationStore(dbPath);
  let effects = 0;

  try {
    const coordinator = new LaneCMutationCoordinator({
      store,
      uuid: () => "77777777-7777-4777-8777-777777777777",
    });
    const prepared = await coordinator.prepare(command, context());
    await coordinator.confirm(prepared.preparationId, context());
    const first = await coordinator.execute(
      prepared.preparationId,
      "lane_c_sqlite_001",
      context(),
      async () => {
        effects += 1;
        return { status: "PERSISTED_LOCAL_PROOF", authority: "NONE" };
      },
    );
    assert.equal(first.replayed, false);
    assert.equal(effects, 1);

    store.close();
    store = new SqliteLaneCMutationStore(dbPath);

    const restarted = new LaneCMutationCoordinator({ store });
    const replay = await restarted.execute(
      prepared.preparationId,
      "lane_c_sqlite_001",
      context(),
      async () => {
        effects += 1;
        return { status: "DUPLICATE" };
      },
    );
    assert.equal(replay.replayed, true);
    assert.equal(replay.status, "PERSISTED_LOCAL_PROOF");
    assert.equal(effects, 1);
  } finally {
    try {
      store.close();
    } catch {}
    rmSync(dir, { recursive: true, force: true });
  }
});

test("SQLite evidence store arbitrates concurrent duplicate claims", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "morro-lane-c-concurrent-"));
  const dbPath = path.join(dir, "lane-c.sqlite");
  const store = new SqliteLaneCMutationStore(dbPath);
  let effects = 0;

  try {
    const coordinator = new LaneCMutationCoordinator({
      store,
      uuid: () => "88888888-8888-4888-8888-888888888888",
    });
    const prepared = await coordinator.prepare(command, context());
    await coordinator.confirm(prepared.preparationId, context());

    const attempts = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        coordinator.execute(
          prepared.preparationId,
          "lane_c_sqlite_concurrent_001",
          context(),
          async () => {
            effects += 1;
            await new Promise((resolve) => setTimeout(resolve, 20));
            return { status: "ONCE", authority: "NONE" };
          },
        ),
      ),
    );

    assert.equal(effects, 1);
    assert.ok(attempts.some((entry) => entry.status === "fulfilled"));
    assert.ok(
      attempts.every(
        (entry) =>
          entry.status === "fulfilled" ||
          (entry.reason instanceof Error && /IDEMPOTENCY_IN_FLIGHT/u.test(entry.reason.message)),
      ),
    );
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
