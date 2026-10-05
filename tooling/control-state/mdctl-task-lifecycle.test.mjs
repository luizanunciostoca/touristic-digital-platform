import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  assertTaskIdentityStable,
  buildTaskRestart,
  buildTaskStart,
  buildTaskSubmit,
  buildTaskTest,
  evidenceInvalidationPlan,
  validateTaskContext,
  validateTaskLocalProof,
} from "../mdctl/task-lifecycle.mjs";
import { contextPackDigest } from "../mdctl/context-pack.mjs";
import { canonicalJson } from "../mdctl/changeset-v2.mjs";

function changeSet() {
  return {
    schemaVersion: 2,
    id: "MD-TASK-LIFECYCLE",
    baseSha: "a".repeat(40),
    branch: "infra/task-lifecycle",
    state: "IMPLEMENTING",
    risk: "high",
    scope: "PLATFORM",
    owns: { paths: ["tooling/mdctl/**"], contracts: ["TASK"] },
    reads: { contracts: ["MAIN"] },
    produces: { events: ["TASK_SUBMITTED"], routes: [] },
    database: { tables: [] },
    auth: { capabilities: [] },
    dependencies: [],
    requiredEvidence: ["remote-proof"],
    requiredCapabilities: ["github:read", "workspace:write:claimed-paths"],
    contextPack: {
      maxBytes: 65536,
      include: ["changeset", "git-identity", "proof-plan"],
    },
    proof: {
      budget: { maxCommands: 2, maxSeconds: 120 },
      commands: [
        {
          id: "unit-one",
          argv: ["node", "--test", "tooling/one.test.mjs"],
          timeoutSeconds: 30,
        },
        {
          id: "unit-two",
          argv: ["node", "--test", "tooling/two.test.mjs"],
          timeoutSeconds: 30,
        },
      ],
      requiredRemoteEvidence: ["remote-proof"],
    },
    stopAt: "REMOTE_PROVEN",
  };
}

function proofDigest(proof) {
  const { digest: _ignored, ...payload } = proof;
  return (
    "sha256:" +
    createHash("sha256").update(canonicalJson(payload)).digest("hex")
  );
}

function identity(head = "b".repeat(40), tree = "c".repeat(40)) {
  return {
    headSha: head,
    treeSha: tree,
    branch: "infra/task-lifecycle",
    dirty: false,
    baseIsAncestor: true,
  };
}

test("task identity must remain exact and clean across proof execution", () => {
  const before = identity();
  assert.deepEqual(assertTaskIdentityStable(before, { ...before }), before);
  assert.throws(
    () =>
      assertTaskIdentityStable(before, { ...before, headSha: "d".repeat(40) }),
    /TASK_HEAD_MOVED_DURING_TEST/u,
  );
  assert.throws(
    () => assertTaskIdentityStable(before, { ...before, dirty: true }),
    /TASK_WORKSPACE_DIRTY_AFTER_TEST/u,
  );
});

test("task start acquires exact capabilities and creates candidate-bound context", () => {
  let n = 0;
  const started = buildTaskStart({
    changeSet: changeSet(),
    owner: "worker-1",
    identity: identity(),
    now: "2026-10-01T09:00:00Z",
    idFactory: () => "task-" + ++n,
  });
  assert.equal(started.task.state, "STARTED");
  assert.equal(started.task.leaseIds.length, 2);
  assert.equal(started.contextPack.candidateSha, "b".repeat(40));
});

test("task test runs bounded proof commands and promotes only to LOCAL_PROVEN", async () => {
  let n = 0;
  const started = buildTaskStart({
    changeSet: changeSet(),
    owner: "worker-1",
    identity: identity(),
    now: "2026-10-01T09:00:00Z",
    idFactory: () => "task-" + ++n,
  });
  const calls = [];
  const tested = await buildTaskTest({
    task: started.task,
    changeSet: changeSet(),
    leaseRegistry: started.leaseRegistry,
    identity: identity("d".repeat(40), "e".repeat(40)),
    now: "2026-10-01T09:05:00Z",
    commandRunner: async (command) => {
      calls.push(command.id);
      return { status: "PASS", stdout: command.id, stderr: "" };
    },
  });
  assert.deepEqual(calls, ["unit-one", "unit-two"]);
  assert.equal(tested.task.state, "LOCAL_PROVEN");
  assert.equal(tested.task.candidateSha, "d".repeat(40));
  assert.match(tested.task.localProof.digest, /^sha256:[0-9a-f]{64}$/u);
  assert.deepEqual(tested.task.localProof.requiredRemoteEvidence, [
    "remote-proof",
  ]);
});

test("failed proof command cannot advance task state", async () => {
  let n = 0;
  const started = buildTaskStart({
    changeSet: changeSet(),
    owner: "worker-1",
    identity: identity(),
    now: "2026-10-01T09:00:00Z",
    idFactory: () => "task-" + ++n,
  });
  await assert.rejects(
    buildTaskTest({
      task: started.task,
      changeSet: changeSet(),
      leaseRegistry: started.leaseRegistry,
      identity: identity(),
      now: "2026-10-01T09:05:00Z",
      commandRunner: async () => ({ status: "FAIL" }),
    }),
    /TASK_PROOF_COMMAND_FAILED/u,
  );
  assert.equal(started.task.state, "STARTED");
});

test("task submit rejects a valid-but-replaced persisted Context Pack", async () => {
  let n = 0;
  const manifest = changeSet();
  const started = buildTaskStart({
    changeSet: manifest,
    owner: "worker-1",
    identity: identity(),
    now: "2026-10-01T09:00:00Z",
    idFactory: () => "task-" + ++n,
  });
  const tested = await buildTaskTest({
    task: started.task,
    changeSet: manifest,
    leaseRegistry: started.leaseRegistry,
    identity: identity("d".repeat(40), "e".repeat(40)),
    now: "2026-10-01T09:05:00Z",
    commandRunner: async () => ({ status: "PASS", stdout: "ok", stderr: "" }),
  });
  const replaced = {
    ...tested.contextPack,
    generatedAt: "2026-10-01T09:05:30Z",
  };
  replaced.digest = contextPackDigest(replaced);
  assert.throws(
    () =>
      validateTaskContext({
        task: tested.task,
        changeSet: manifest,
        leaseRegistry: started.leaseRegistry,
        contextPack: replaced,
      }),
    /TASK_CONTEXT_PACK_DIGEST_MISMATCH/u,
  );
});

test("task submit is exact-head bound, releases leases and does not claim remote proof", async () => {
  let n = 0;
  const manifest = changeSet();
  const started = buildTaskStart({
    changeSet: manifest,
    owner: "worker-1",
    identity: identity(),
    now: "2026-10-01T09:00:00Z",
    idFactory: () => "task-" + ++n,
  });
  const tested = await buildTaskTest({
    task: started.task,
    changeSet: manifest,
    leaseRegistry: started.leaseRegistry,
    identity: identity("d".repeat(40), "e".repeat(40)),
    now: "2026-10-01T09:05:00Z",
    commandRunner: async () => ({ status: "PASS", stdout: "ok", stderr: "" }),
  });
  assert.throws(
    () =>
      buildTaskSubmit({
        task: tested.task,
        changeSet: manifest,
        leaseRegistry: started.leaseRegistry,
        identity: identity("f".repeat(40), "e".repeat(40)),
        now: "2026-10-01T09:06:00Z",
      }),
    /TASK_CANDIDATE_MOVED_AFTER_TEST/u,
  );
  const submitted = buildTaskSubmit({
    task: tested.task,
    changeSet: manifest,
    leaseRegistry: started.leaseRegistry,
    identity: identity("d".repeat(40), "e".repeat(40)),
    now: "2026-10-01T09:06:00Z",
  });
  assert.equal(submitted.task.state, "SUBMITTED");
  assert.equal(submitted.handoff.nextState, "REMOTE_PROVEN");
  assert.equal(
    submitted.handoff.authority,
    "WORKER_SUBMISSION_NOT_REMOTE_PROOF",
  );
  assert.ok(
    tested.task.leaseIds.every(
      (id) => submitted.leaseRegistry.leases[id].state === "RELEASED",
    ),
  );
});

test("lease expiry during proof execution cannot advance to LOCAL_PROVEN", async () => {
  let n = 0;
  const started = buildTaskStart({
    changeSet: changeSet(),
    owner: "worker-1",
    identity: identity(),
    now: "2026-10-01T09:00:00Z",
    ttlSeconds: 60,
    idFactory: () => "expiring-" + ++n,
  });
  const times = ["2026-10-01T09:00:30Z", "2026-10-01T09:02:00Z"];
  await assert.rejects(
    buildTaskTest({
      task: started.task,
      changeSet: changeSet(),
      leaseRegistry: started.leaseRegistry,
      identity: identity(),
      now: () => times.shift(),
      commandRunner: async () => ({
        status: "PASS",
        stdout: "ok",
        stderr: "",
      }),
    }),
    /REQUIRED_CAPABILITY_LEASE_MISSING/u,
  );
  assert.equal(started.task.state, "STARTED");
});

test("recomputed digest cannot hide forged local proof content", async () => {
  let n = 0;
  const manifest = changeSet();
  const started = buildTaskStart({
    changeSet: manifest,
    owner: "worker-1",
    identity: identity(),
    now: "2026-10-01T09:00:00Z",
    idFactory: () => "proof-" + ++n,
  });
  const tested = await buildTaskTest({
    task: started.task,
    changeSet: manifest,
    leaseRegistry: started.leaseRegistry,
    identity: identity("d".repeat(40), "e".repeat(40)),
    now: "2026-10-01T09:05:00Z",
    commandRunner: async () => ({
      status: "PASS",
      stdout: "ok",
      stderr: "",
    }),
  });
  const forged = structuredClone(tested.task);
  forged.localProof.commandEvidence[0].id = "forged-command";
  forged.localProof.digest = proofDigest(forged.localProof);
  assert.throws(
    () =>
      validateTaskLocalProof({
        proof: forged.localProof,
        task: forged,
        changeSet: manifest,
      }),
    /TASK_LOCAL_PROOF_COMMAND_ID_MISMATCH/u,
  );
  assert.throws(
    () =>
      buildTaskSubmit({
        task: forged,
        changeSet: manifest,
        leaseRegistry: started.leaseRegistry,
        identity: identity("d".repeat(40), "e".repeat(40)),
        now: "2026-10-01T09:06:00Z",
      }),
    /TASK_LOCAL_PROOF_COMMAND_ID_MISMATCH/u,
  );
});

test("restart recovers an expired non-submitted task and requires fresh proof", async () => {
  let n = 0;
  const manifest = changeSet();
  const started = buildTaskStart({
    changeSet: manifest,
    owner: "worker-1",
    identity: identity(),
    now: "2026-10-01T09:00:00Z",
    ttlSeconds: 60,
    idFactory: () => "old-" + ++n,
  });
  let replacement = 0;
  const restarted = buildTaskRestart({
    task: started.task,
    changeSet: manifest,
    leaseRegistry: started.leaseRegistry,
    identity: identity("d".repeat(40), "e".repeat(40)),
    now: "2026-10-01T09:02:00Z",
    idFactory: () => "new-" + ++replacement,
  });
  assert.equal(restarted.task.state, "STARTED");
  assert.equal(restarted.task.localProof, null);
  assert.equal(restarted.task.testedAt, null);
  assert.notDeepEqual(restarted.task.leaseIds, started.task.leaseIds);
  const tested = await buildTaskTest({
    task: restarted.task,
    changeSet: manifest,
    leaseRegistry: restarted.leaseRegistry,
    identity: identity("d".repeat(40), "e".repeat(40)),
    now: "2026-10-01T09:02:30Z",
    commandRunner: async () => ({
      status: "PASS",
      stdout: "fresh",
      stderr: "",
    }),
  });
  assert.equal(tested.task.state, "LOCAL_PROVEN");
});

test("candidate mutation invalidates every candidate-bound proof after certification", () => {
  const certifiedCandidateSha = "a".repeat(40);
  const certifiedTreeSha = "b".repeat(40);
  const result = evidenceInvalidationPlan({
    certifiedCandidateSha,
    certifiedTreeSha,
    currentCandidateSha: "c".repeat(40),
    currentTreeSha: certifiedTreeSha,
  });
  assert.equal(result.state, "CANDIDATE_INVALIDATED");
  assert.equal(result.candidateChanged, true);
  for (const proof of [
    "admission",
    "certification",
    "affected-remote-proof",
    "independent-proof",
    "exact-head-identity",
    "review-reconciliation",
    "merge-gate",
  ]) {
    assert.ok(result.invalidated.includes(proof), proof);
  }
});

test("review metadata change on frozen candidate invalidates only review-dependent gates", () => {
  const candidate = "a".repeat(40);
  const tree = "b".repeat(40);
  assert.deepEqual(
    evidenceInvalidationPlan({
      certifiedCandidateSha: candidate,
      certifiedTreeSha: tree,
      currentCandidateSha: candidate,
      currentTreeSha: tree,
      reviewStateChanged: true,
    }),
    {
      state: "REVIEW_EVIDENCE_INVALIDATED",
      candidateChanged: false,
      invalidated: ["review-reconciliation", "merge-gate"],
    },
  );
  assert.deepEqual(
    evidenceInvalidationPlan({
      certifiedCandidateSha: candidate,
      certifiedTreeSha: tree,
      currentCandidateSha: candidate,
      currentTreeSha: tree,
    }).invalidated,
    [],
  );
});
