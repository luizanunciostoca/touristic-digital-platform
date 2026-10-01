import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  changeSetDigest,
  validateChangeSetV2,
} from "../mdctl/changeset-v2.mjs";
import {
  appendAuthorityEvent,
  parseAuthorityLedger,
} from "../mdctl/event-ledger.mjs";
import {
  evaluateInvariants,
  loadInvariantContextAtMain,
} from "../mdctl/invariants.mjs";

const manifestPath = ".morro/changesets/MD-CP-AUTONOMOUS-BLOCK-B.json";

test("Block B dogfoods ChangeSet V2 with bounded executable proof", async () => {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  validateChangeSetV2(manifest);
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.scope, "PLATFORM");
  assert.ok(manifest.requiredCapabilities.length >= 1);
  assert.ok(manifest.contextPack.maxBytes <= 1024 * 1024);
  assert.ok(
    manifest.proof.commands.length <= manifest.proof.budget.maxCommands,
  );
  assert.match(changeSetDigest(manifest), /^sha256:[0-9a-f]{64}$/u);

  for (const command of manifest.proof.commands) {
    assert.equal(command.argv[0], "node");
    assert.equal(command.argv[1], "--test");
    for (const file of command.argv.slice(2)) {
      assert.equal((await stat(file)).isFile(), true, file);
    }
  }
});

test("Block B remote proof requirements remain explicit and non-local", async () => {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  for (const evidence of [
    "automated-independent-proof",
    "exact-head-identity",
  ]) {
    assert.ok(manifest.requiredEvidence.includes(evidence));
    assert.ok(manifest.proof.requiredRemoteEvidence.includes(evidence));
  }
});

const event = {
  schemaVersion: 1,
  eventId: "evt-integrity-001",
  eventType: "CLAIM_ACQUIRED",
  observedAt: "2026-10-01T09:00:00Z",
  actor: "test",
  entity: "MD-INTEGRITY",
  sourceSha: "a".repeat(40),
  payloadVersion: 1,
  payload: {},
};

function invariantContext(releaseState) {
  return {
    observed: {
      snapshotStartedAt: "2026-10-01T09:00:00Z",
      mainSha: "b".repeat(40),
      observedClaims: [],
      runtimeHealth: {},
    },
    termux: { state: "HEALTHY" },
    integrationQueue: { batches: [] },
    releaseState,
    ownership: {
      domains: [
        {
          id: "payments",
          pathPrefixes: ["packages/financial/", "services/financial/"],
        },
      ],
    },
  };
}

test("stale ledger takeover remains serialized under concurrent successors", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tdp-integrity-"));
  const path = join(directory, "events.ndjson");
  const lockPath = path + ".lock";
  try {
    await mkdir(lockPath, { mode: 0o700 });
    await writeFile(join(lockPath, "owner"), "stale-owner\n", "utf8");
    const stale = new Date(Date.now() - 10 * 60 * 1000);
    await utimes(lockPath, stale, stale);
    const second = { ...event, eventId: "evt-integrity-002" };

    await Promise.all([
      appendAuthorityEvent(path, event),
      appendAuthorityEvent(path, second),
    ]);

    const stored = parseAuthorityLedger(await readFile(path, "utf8"));
    assert.deepEqual(
      new Set(stored.map((item) => item.eventId)),
      new Set(["evt-integrity-001", "evt-integrity-002"]),
    );
    await assert.rejects(readFile(join(lockPath, "owner"), "utf8"), /ENOENT/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("critical VERIFIED evidence is exact-candidate and trusted-run bound", () => {
  const candidateSha = "c".repeat(40);
  const staleSha = "d".repeat(40);
  let report = evaluateInvariants(
    invariantContext({
      candidateSha,
      trustedValidatorIndependenceState: "VERIFIED",
      trustedValidatorIndependenceEvidenceSha: staleSha,
      trustedValidatorIndependenceRunId: "101",
      tenantIsolationState: "VERIFIED",
      tenantIsolationEvidenceSha: staleSha,
      tenantIsolationRunId: "102",
      destinationIsolationState: "VERIFIED",
      destinationIsolationEvidenceSha: staleSha,
      destinationIsolationRunId: "103",
    }),
  );
  for (const id of ["INV-005", "INV-010", "INV-011"])
    assert.equal(report.checks.find((check) => check.id === id).status, "FAIL");

  report = evaluateInvariants(
    invariantContext({
      candidateSha,
      trustedValidatorIndependenceState: "VERIFIED",
      trustedValidatorIndependenceEvidenceSha: candidateSha,
      trustedValidatorIndependenceRunId: "201",
      tenantIsolationState: "VERIFIED",
      tenantIsolationEvidenceSha: candidateSha,
      tenantIsolationRunId: "202",
      destinationIsolationState: "VERIFIED",
      destinationIsolationEvidenceSha: candidateSha,
      destinationIsolationRunId: "203",
    }),
  );
  for (const id of ["INV-005", "INV-010", "INV-011"])
    assert.equal(report.checks.find((check) => check.id === id).status, "PASS");
});

test("projection loader rechecks main after reading decision projections", async () => {
  const mainSha = "a".repeat(40);
  const movedSha = "b".repeat(40);
  const content = (value) => ({
    encoding: "base64",
    content: Buffer.from(JSON.stringify(value)).toString("base64"),
  });
  const api = async (endpoint) => {
    if (endpoint.endsWith("/commits/main")) return { sha: movedSha };
    if (endpoint.includes("integration-queue.json"))
      return content({ version: 1, batches: [] });
    if (endpoint.includes("release-state.json"))
      return content({ schemaVersion: 1, candidateSha: null });
    if (endpoint.includes("ownership.json"))
      return content({ version: 2, domains: [] });
    throw new Error("UNEXPECTED_ENDPOINT");
  };
  await assert.rejects(
    loadInvariantContextAtMain({
      repository: "fixture/repo",
      mainSha,
      api,
    }),
    /MAIN_CHANGED_DURING_CONTROL_PROJECTION_LOAD/u,
  );
});
