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

function invariantContext(releaseState, trustedRunEvidence = null) {
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
    trustedRunEvidence,
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

test("stale ledger lock fails closed without takeover or successor deletion", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tdp-integrity-"));
  const path = join(directory, "events.ndjson");
  const lockPath = path + ".lock";
  try {
    await mkdir(lockPath, { mode: 0o700 });
    await writeFile(join(lockPath, "owner"), "stale-owner\n", "utf8");
    const stale = new Date(Date.now() - 10 * 60 * 1000);
    await utimes(lockPath, stale, stale);

    await assert.rejects(
      appendAuthorityEvent(path, event),
      /EVENT_LEDGER_STALE_LOCK_REQUIRES_RECOVERY/u,
    );

    assert.equal(
      (await readFile(join(lockPath, "owner"), "utf8")).trim(),
      "stale-owner",
    );
    await assert.rejects(
      readFile(lockPath + ".takeover/owner", "utf8"),
      /ENOENT/u,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("critical VERIFIED evidence rejects stale and invented Actions runs", () => {
  const candidateSha = "c".repeat(40);
  const staleSha = "d".repeat(40);
  const trustedRef =
    "fixture/repo/.github/workflows/morro-agent-profiles-trusted.yml@" +
    "e".repeat(40);
  const releaseState = {
    candidateSha,
    trustedValidatorIndependenceState: "VERIFIED",
    trustedValidatorIndependenceEvidenceSha: candidateSha,
    trustedValidatorIndependenceRunId: "201",
    trustedValidatorIndependenceWorkflowPath:
      ".github/workflows/morro-agent-profiles.yml",
    trustedValidatorIndependenceWorkflowName: "Agent Profile Contract",
    trustedValidatorIndependenceTrustedWorkflowRef: trustedRef,
    tenantIsolationState: "VERIFIED",
    tenantIsolationEvidenceSha: candidateSha,
    tenantIsolationRunId: "202",
    tenantIsolationWorkflowPath:
      ".github/workflows/auth-integration-contract.yml",
    tenantIsolationWorkflowName: "Auth Integration Contract",
    destinationIsolationState: "VERIFIED",
    destinationIsolationEvidenceSha: candidateSha,
    destinationIsolationRunId: "203",
    destinationIsolationWorkflowPath:
      ".github/workflows/morro-pro-business-management-contract.yml",
    destinationIsolationWorkflowName: "Morro Pro Business Management Contract",
  };

  let report = evaluateInvariants(invariantContext(releaseState));
  for (const id of ["INV-005", "INV-010", "INV-011"])
    assert.equal(report.checks.find((check) => check.id === id).status, "FAIL");

  report = evaluateInvariants(
    invariantContext(
      {
        ...releaseState,
        trustedValidatorIndependenceEvidenceSha: staleSha,
      },
      {
        trustedValidatorIndependence: {
          id: 201,
          headSha: candidateSha,
          status: "completed",
          conclusion: "success",
          event: "pull_request",
          path: ".github/workflows/morro-agent-profiles.yml",
          name: "Agent Profile Contract",
          referencedWorkflows: [trustedRef],
        },
      },
    ),
  );
  assert.equal(
    report.checks.find((check) => check.id === "INV-005").status,
    "FAIL",
  );
});

test("critical VERIFIED evidence requires live successful exact-head trusted runs", () => {
  const candidateSha = "c".repeat(40);
  const trustedRef =
    "fixture/repo/.github/workflows/morro-agent-profiles-trusted.yml@" +
    "e".repeat(40);
  const releaseState = {
    candidateSha,
    trustedValidatorIndependenceState: "VERIFIED",
    trustedValidatorIndependenceEvidenceSha: candidateSha,
    trustedValidatorIndependenceRunId: "201",
    trustedValidatorIndependenceWorkflowPath:
      ".github/workflows/morro-agent-profiles.yml",
    trustedValidatorIndependenceWorkflowName: "Agent Profile Contract",
    trustedValidatorIndependenceTrustedWorkflowRef: trustedRef,
    tenantIsolationState: "VERIFIED",
    tenantIsolationEvidenceSha: candidateSha,
    tenantIsolationRunId: "202",
    tenantIsolationWorkflowPath:
      ".github/workflows/auth-integration-contract.yml",
    tenantIsolationWorkflowName: "Auth Integration Contract",
    destinationIsolationState: "VERIFIED",
    destinationIsolationEvidenceSha: candidateSha,
    destinationIsolationRunId: "203",
    destinationIsolationWorkflowPath:
      ".github/workflows/morro-pro-business-management-contract.yml",
    destinationIsolationWorkflowName: "Morro Pro Business Management Contract",
  };
  const live = {
    trustedValidatorIndependence: {
      id: 201,
      headSha: candidateSha,
      status: "completed",
      conclusion: "success",
      event: "pull_request",
      path: ".github/workflows/morro-agent-profiles.yml",
      name: "Agent Profile Contract",
      referencedWorkflows: [trustedRef],
    },
    tenantIsolation: {
      id: 202,
      headSha: candidateSha,
      status: "completed",
      conclusion: "success",
      event: "pull_request",
      path: ".github/workflows/auth-integration-contract.yml",
      name: "Auth Integration Contract",
      referencedWorkflows: [],
    },
    destinationIsolation: {
      id: 203,
      headSha: candidateSha,
      status: "completed",
      conclusion: "success",
      event: "pull_request",
      path: ".github/workflows/morro-pro-business-management-contract.yml",
      name: "Morro Pro Business Management Contract",
      referencedWorkflows: [],
    },
  };

  const report = evaluateInvariants(invariantContext(releaseState, live));
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

test("projection loader resolves trusted run evidence before terminal main recheck", async () => {
  const mainSha = "a".repeat(40);
  const candidateSha = "c".repeat(40);
  const trustedRef =
    "fixture/repo/.github/workflows/morro-agent-profiles-trusted.yml@" +
    "e".repeat(40);
  const releaseState = {
    schemaVersion: 1,
    candidateSha,
    trustedValidatorIndependenceRunId: "201",
  };
  const content = (value) => ({
    encoding: "base64",
    content: Buffer.from(JSON.stringify(value)).toString("base64"),
  });
  const calls = [];
  const api = async (endpoint) => {
    calls.push(endpoint);
    if (endpoint.endsWith("/commits/main")) return { sha: mainSha };
    if (endpoint.endsWith("/actions/runs/201"))
      return {
        id: 201,
        head_sha: candidateSha,
        status: "completed",
        conclusion: "success",
        event: "pull_request",
        path: ".github/workflows/morro-agent-profiles.yml",
        name: "Agent Profile Contract",
        referenced_workflows: [{ path: trustedRef }],
      };
    if (endpoint.includes("integration-queue.json"))
      return content({ version: 1, batches: [] });
    if (endpoint.includes("release-state.json")) return content(releaseState);
    if (endpoint.includes("ownership.json"))
      return content({ version: 2, domains: [] });
    throw new Error("UNEXPECTED_ENDPOINT");
  };

  const loaded = await loadInvariantContextAtMain({
    repository: "fixture/repo",
    mainSha,
    api,
  });
  assert.deepEqual(loaded.trustedRunEvidence.trustedValidatorIndependence, {
    id: 201,
    headSha: candidateSha,
    status: "completed",
    conclusion: "success",
    event: "pull_request",
    path: ".github/workflows/morro-agent-profiles.yml",
    name: "Agent Profile Contract",
    referencedWorkflows: [trustedRef],
  });
  assert.ok(
    calls.indexOf("repos/fixture/repo/actions/runs/201") <
      calls.indexOf("repos/fixture/repo/commits/main"),
  );
});
