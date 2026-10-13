import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTaskStart,
  buildTaskTest,
  buildTaskSubmit,
  buildTaskCorrection,
  buildTaskRestart,
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

async function fixture() {
  let n = 0;
  const idFactory = () => "correction-" + ++n;
  const manifest = changeSet();
  const identity = {
    headSha: "b".repeat(40),
    treeSha: "c".repeat(40),
    branch: manifest.branch,
    baseIsAncestor: true,
    dirty: false,
  };
  const started = buildTaskStart({
    changeSet: manifest,
    owner: "worker-1",
    identity,
    now: "2026-10-01T09:00:00Z",
    idFactory,
  });
  const tested = await buildTaskTest({
    task: started.task,
    changeSet: manifest,
    leaseRegistry: started.leaseRegistry,
    identity,
    now: "2026-10-01T09:05:00Z",
    // Unit fixture output; this is not project execution evidence.
    commandRunner: async () => ({
      status: "PASS",
      stdout: "fixture",
      stderr: "",
    }),
  });
  const submitted = buildTaskSubmit({
    task: tested.task,
    changeSet: manifest,
    leaseRegistry: started.leaseRegistry,
    identity,
    now: "2026-10-01T09:06:00Z",
  });
  const successor = {
    ...structuredClone(manifest),
    id: "MD-TASK-CORRECTION",
    branch: "infra/task-correction",
    dependencies: [manifest.id],
  };
  const claimRegistry = {
    registryAuthority: "ORCHESTRATOR",
    claims: {
      [successor.id]: {
        owner: "worker-1",
        reviewer: "AUTOMATED-INDEPENDENT-PROOF",
        branch: successor.branch,
        baseSha: successor.baseSha,
        paths: successor.owns.paths,
        domains: ["control-plane"],
        risk: "P1",
        status: "IMPLEMENTING",
        expiresAt: "2026-10-02T09:00:00Z",
      },
    },
  };
  return {
    ...submitted,
    changeSet: manifest,
    successor,
    claimRegistry,
    identity: {
      ...identity,
      branch: successor.branch,
      headSha: "d".repeat(40),
    },
    isAncestor: () => true,
    // Deterministic fixture for the trusted Git reader, not runtime evidence.
    readCandidateDiff: (identity) => ({
      ...identity,
      changedFiles: ["tooling/mdctl/correction.mjs"],
    }),
    now: "2026-10-01T09:10:00Z",
    idFactory,
  };
}
test("submitted correction preserves predecessor and binds new task to receipt", async () => {
  const f = await fixture();
  const before = structuredClone({
    task: f.task,
    handoff: f.handoff,
    leases: f.leaseRegistry,
  });
  const result = buildTaskCorrection(f);
  assert.equal(result.task.state, "STARTED");
  assert.equal(result.task.localProof, null);
  assert.equal(result.task.handoffDigest, null);
  assert.equal(result.task.supersedes.handoffDigest, f.handoff.digest);
  assert.notEqual(result.task.taskId, f.task.taskId);
  assert.deepEqual(
    { task: f.task, handoff: f.handoff, leases: f.leaseRegistry },
    before,
  );
  assert.ok(result.task.leaseIds.every((id) => !f.task.leaseIds.includes(id)));
  assert.equal(
    result.authority,
    "LOCAL_CORRECTION_PROPOSAL_NOT_EXECUTION_RESERVATION",
  );
  assert.throws(
    () => buildTaskRestart({ ...f, changeSet: f.changeSet }),
    /STATE_NOT_RESTARTABLE/,
  );
});
for (const [name, mutate, code] of [
  [
    "modified receipt",
    (f) => (f.handoff.candidateSha = "f".repeat(40)),
    /HANDOFF_MISMATCH/,
  ],
  [
    "modified digest",
    (f) => (f.task.handoffDigest = "sha256:" + "0".repeat(64)),
    /HANDOFF_DIGEST_MISMATCH/,
  ],
  [
    "active old lease",
    (f) => (f.leaseRegistry.leases[f.task.leaseIds[0]].state = "ACTIVE"),
    /LEASE_NOT_RELEASED/,
  ],
  [
    "missing old lease",
    (f) => delete f.leaseRegistry.leases[f.task.leaseIds[0]],
    /CAPABILITIES_MISMATCH/,
  ],
  [
    "lease owned by another",
    (f) => (f.leaseRegistry.leases[f.task.leaseIds[0]].owner = "other"),
    /LEASE_OWNER_MISMATCH/,
  ],
  ["omitted lease", (f) => f.task.leaseIds.pop(), /CAPABILITIES_MISMATCH/],
  [
    "duplicate lease",
    (f) => (f.task.leaseIds[1] = f.task.leaseIds[0]),
    /DUPLICATE_LEASE/,
  ],
  ["wrong task ID", (f) => (f.task.taskId = "task-other"), /TASK_ID_MISMATCH/],
  ["same ID", (f) => (f.successor.id = f.changeSet.id), /NEW_ID_REQUIRED/],
  [
    "same branch",
    (f) => (f.successor.branch = f.changeSet.branch),
    /NEW_BRANCH_REQUIRED/,
  ],
  [
    "missing dependency",
    (f) => (f.successor.dependencies = []),
    /DEPENDENCY_MISMATCH/,
  ],
  [
    "broadened scope",
    (f) => f.successor.owns.paths.push("tooling/**"),
    /AUTHORITY_CHANGED/,
  ],
  [
    "weaker proof",
    (f) => f.successor.proof.commands.pop(),
    /AUTHORITY_CHANGED/,
  ],
  [
    "another claim owner",
    (f) => (f.claimRegistry.claims[f.successor.id].owner = "other"),
    /CLAIM_OWNER_MISMATCH/,
  ],
  [
    "expired claim",
    (f) =>
      (f.claimRegistry.claims[f.successor.id].expiresAt =
        "2026-09-01T00:00:00Z"),
    /CLAIM_EXPIRED/,
  ],
  ["dirty workspace", (f) => (f.identity.dirty = true), /WORKSPACE_DIRTY/],
  ["absent ancestry verifier", (f) => delete f.isAncestor, /ANCESTRY_REQUIRED/],
  ["regressed base", (f) => (f.isAncestor = () => false), /BASE_REGRESSED/],
  ["reversed clock", (f) => (f.now = "2026-10-01T09:01:00Z"), /TIME_REVERSED/],
  [
    "reused lease IDs",
    (f) => (f.idFactory = () => f.task.leaseIds[0].replace(/^lease-/, "")),
    /LEASE_ID_DUPLICATE/,
  ],
])
  test(`correction rejects ${name}`, async () => {
    const f = await fixture();
    mutate(f);
    assert.throws(() => buildTaskCorrection(f), code);
  });

for (const [name, paths] of [
  ["narrower claim", ["tooling/mdctl/narrow.mjs"]],
  ["broader claim", ["tooling/**"]],
  ["empty claim", []],
  ["duplicated claim pattern", ["tooling/mdctl/**", "tooling/mdctl/**"]],
])
  test(`correction rejects ${name} before proposing leases`, async () => {
    const f = await fixture();
    f.claimRegistry.claims[f.successor.id].paths = paths;
    const before = structuredClone(f.leaseRegistry);
    assert.throws(
      () => buildTaskCorrection(f),
      /TASK_CORRECTION_CLAIM_SCOPE_MISMATCH/,
    );
    assert.deepEqual(f.leaseRegistry, before);
  });

for (const [name, mutate, code] of [
  ["missing reader", (f) => delete f.readCandidateDiff, /DIFF_READER_REQUIRED/],
  [
    "missing result",
    (f) => (f.readCandidateDiff = () => null),
    /DIFF_REQUIRED/,
  ],
  ...["baseSha", "headSha", "treeSha"].map((key) => [
    `stale ${key}`,
    (f) => {
      const read = f.readCandidateDiff;
      f.readCandidateDiff = (identity) => ({
        ...read(identity),
        [key]: "f".repeat(40),
      });
    },
    /DIFF_IDENTITY_MISMATCH/,
  ]),
  [
    "out-of-scope candidate",
    (f) =>
      (f.readCandidateDiff = (identity) => ({
        ...identity,
        changedFiles: ["services/financial/unclaimed.ts"],
      })),
    /CLAIM_PATH_VIOLATION/,
  ],
  [
    "missing paths",
    (f) => (f.readCandidateDiff = (identity) => ({ ...identity })),
    /DIFF_PATHS_INVALID/,
  ],
  [
    "duplicate paths",
    (f) =>
      (f.readCandidateDiff = (identity) => ({
        ...identity,
        changedFiles: ["tooling/mdctl/a.mjs", "tooling/mdctl/a.mjs"],
      })),
    /DIFF_PATHS_DUPLICATE/,
  ],
]) {
  test(`correction rejects ${name} without proposing leases`, async () => {
    const f = await fixture();
    mutate(f);
    const before = structuredClone({ task: f.task, leases: f.leaseRegistry });
    assert.throws(() => buildTaskCorrection(f), code);
    assert.deepEqual({ task: f.task, leases: f.leaseRegistry }, before);
  });
}
