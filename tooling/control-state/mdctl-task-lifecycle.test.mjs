import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTaskStart,
  buildTaskSubmit,
  buildTaskTest,
} from "../mdctl/task-lifecycle.mjs";

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

function identity(head = "b".repeat(40), tree = "c".repeat(40)) {
  return {
    headSha: head,
    treeSha: tree,
    branch: "infra/task-lifecycle",
    dirty: false,
    baseIsAncestor: true,
  };
}

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
  assert.deepEqual(tested.task.localProof.requiredRemoteEvidence, ["remote-proof"]);
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
