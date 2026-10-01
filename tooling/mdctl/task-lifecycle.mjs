import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";
import {
  acquireCapabilityLeases,
  assertRequiredCapabilityLeases,
  createLeaseRegistry,
  releaseCapabilityLeases,
} from "./capability-leases.mjs";
import {
  buildContextPack,
  validateContextPack,
} from "./context-pack.mjs";
import {
  canonicalJson,
  changeSetDigest,
  validateChangeSetV2,
} from "./changeset-v2.mjs";

const execute = promisify(execFile);
const SHA = /^[0-9a-f]{40}$/u;
const OWNER = /^[A-Za-z0-9._:@/-]{1,120}$/u;

const digest = (value) =>
  "sha256:" +
  createHash("sha256").update(canonicalJson(value)).digest("hex");

function parseTime(value, code) {
  const ms = Date.parse(value ?? "");
  assert.ok(Number.isFinite(ms), code);
  return new Date(ms).toISOString();
}

export function buildTaskStart({
  changeSet,
  owner,
  identity,
  leaseRegistry = createLeaseRegistry(),
  now = new Date().toISOString(),
  ttlSeconds = 1800,
  idFactory = randomUUID,
}) {
  validateChangeSetV2(changeSet);
  assert.match(owner ?? "", OWNER, "TASK_OWNER_INVALID");
  assert.equal(identity?.branch, changeSet.branch, "TASK_BRANCH_MISMATCH");
  assert.match(identity?.headSha ?? "", SHA, "TASK_HEAD_SHA_INVALID");
  assert.match(identity?.treeSha ?? "", SHA, "TASK_TREE_SHA_INVALID");
  assert.equal(identity?.baseIsAncestor, true, "TASK_BASE_NOT_ANCESTOR");
  assert.equal(identity?.dirty, false, "TASK_WORKSPACE_DIRTY");
  const startedAt = parseTime(now instanceof Date ? now.toISOString() : now, "TASK_TIME_INVALID");

  const acquired = acquireCapabilityLeases({
    registry: leaseRegistry,
    changeSet,
    owner,
    branch: identity.branch,
    now: startedAt,
    ttlSeconds,
    idFactory,
  });
  const leaseIds = acquired.leases.map((lease) => lease.leaseId);
  const contextPack = buildContextPack({
    changeSet,
    candidateSha: identity.headSha,
    treeSha: identity.treeSha,
    branch: identity.branch,
    capabilityLeaseIds: leaseIds,
    generatedAt: startedAt,
  });
  const task = {
    schemaVersion: 1,
    kind: "TDP_TASK_STATE",
    taskId: "task-" + changeSet.id,
    changeSetId: changeSet.id,
    changeSetDigest: changeSetDigest(changeSet),
    owner,
    branch: identity.branch,
    baseSha: changeSet.baseSha,
    state: "STARTED",
    candidateSha: identity.headSha,
    treeSha: identity.treeSha,
    contextPackDigest: contextPack.digest,
    leaseIds,
    startedAt,
    testedAt: null,
    submittedAt: null,
    localProof: null,
    handoffDigest: null,
  };
  return { task, leaseRegistry: acquired.registry, contextPack };
}

export async function buildTaskTest({
  task,
  changeSet,
  leaseRegistry,
  identity,
  commandRunner,
  now = new Date().toISOString(),
}) {
  validateChangeSetV2(changeSet);
  assert.equal(task?.state, "STARTED", "TASK_STATE_NOT_STARTABLE_FOR_TEST");
  assert.equal(task.changeSetId, changeSet.id, "TASK_CHANGESET_MISMATCH");
  assert.equal(task.changeSetDigest, changeSetDigest(changeSet), "TASK_CHANGESET_DIGEST_MISMATCH");
  assert.equal(task.owner && OWNER.test(task.owner), true, "TASK_OWNER_INVALID");
  assert.equal(identity?.branch, task.branch, "TASK_BRANCH_MISMATCH");
  assert.match(identity?.headSha ?? "", SHA, "TASK_HEAD_SHA_INVALID");
  assert.match(identity?.treeSha ?? "", SHA, "TASK_TREE_SHA_INVALID");
  assert.equal(identity?.baseIsAncestor, true, "TASK_BASE_NOT_ANCESTOR");
  assert.equal(identity?.dirty, false, "TASK_WORKSPACE_DIRTY");
  assert.equal(typeof commandRunner, "function", "TASK_COMMAND_RUNNER_REQUIRED");

  const testedAt = parseTime(now instanceof Date ? now.toISOString() : now, "TASK_TIME_INVALID");
  const leases = assertRequiredCapabilityLeases({
    registry: leaseRegistry,
    changeSet,
    owner: task.owner,
    branch: task.branch,
    now: testedAt,
  });
  const evidence = [];

  for (const command of changeSet.proof.commands) {
    let result;
    try {
      result = await commandRunner(command);
    } catch {
      throw new Error("TASK_PROOF_COMMAND_FAILED:" + command.id);
    }
    assert.equal(result?.status, "PASS", "TASK_PROOF_COMMAND_FAILED:" + command.id);
    evidence.push({
      id: command.id,
      status: "PASS",
      candidateSha: identity.headSha,
      timeoutSeconds: command.timeoutSeconds,
      outputDigest: digest({
        stdout: String(result.stdout ?? ""),
        stderr: String(result.stderr ?? ""),
      }),
    });
  }

  const contextPack = buildContextPack({
    changeSet,
    candidateSha: identity.headSha,
    treeSha: identity.treeSha,
    branch: identity.branch,
    capabilityLeaseIds: leases.map((lease) => lease.leaseId),
    generatedAt: testedAt,
  });
  const localProof = {
    schemaVersion: 1,
    kind: "TDP_TASK_LOCAL_PROOF",
    changeSetId: changeSet.id,
    candidateSha: identity.headSha,
    treeSha: identity.treeSha,
    commandEvidence: evidence,
    requiredRemoteEvidence: changeSet.proof.requiredRemoteEvidence,
    completedAt: testedAt,
  };
  localProof.digest = digest(localProof);

  return {
    task: {
      ...task,
      state: "LOCAL_PROVEN",
      candidateSha: identity.headSha,
      treeSha: identity.treeSha,
      contextPackDigest: contextPack.digest,
      testedAt,
      localProof,
    },
    contextPack,
  };
}

export function buildTaskSubmit({
  task,
  changeSet,
  leaseRegistry,
  identity,
  now = new Date().toISOString(),
}) {
  validateChangeSetV2(changeSet);
  assert.equal(task?.state, "LOCAL_PROVEN", "TASK_STATE_NOT_SUBMITTABLE");
  assert.equal(task.changeSetId, changeSet.id, "TASK_CHANGESET_MISMATCH");
  assert.equal(task.changeSetDigest, changeSetDigest(changeSet), "TASK_CHANGESET_DIGEST_MISMATCH");
  assert.equal(identity?.branch, task.branch, "TASK_BRANCH_MISMATCH");
  assert.equal(identity?.headSha, task.candidateSha, "TASK_CANDIDATE_MOVED_AFTER_TEST");
  assert.equal(identity?.treeSha, task.treeSha, "TASK_TREE_MOVED_AFTER_TEST");
  assert.equal(identity?.dirty, false, "TASK_WORKSPACE_DIRTY");
  assert.equal(identity?.baseIsAncestor, true, "TASK_BASE_NOT_ANCESTOR");
  const submittedAt = parseTime(now instanceof Date ? now.toISOString() : now, "TASK_TIME_INVALID");

  assertRequiredCapabilityLeases({
    registry: leaseRegistry,
    changeSet,
    owner: task.owner,
    branch: task.branch,
    now: submittedAt,
  });

  const handoffPayload = {
    schemaVersion: 1,
    kind: "TDP_TASK_HANDOFF",
    changeSetId: changeSet.id,
    changeSetDigest: task.changeSetDigest,
    owner: task.owner,
    branch: task.branch,
    baseSha: task.baseSha,
    candidateSha: task.candidateSha,
    treeSha: task.treeSha,
    contextPackDigest: task.contextPackDigest,
    localProofDigest: task.localProof?.digest ?? null,
    requiredRemoteEvidence: changeSet.proof.requiredRemoteEvidence,
    nextState: "REMOTE_PROVEN",
    authority: "WORKER_SUBMISSION_NOT_REMOTE_PROOF",
    generatedAt: submittedAt,
  };
  assert.match(handoffPayload.localProofDigest ?? "", /^sha256:[0-9a-f]{64}$/u, "TASK_LOCAL_PROOF_MISSING");
  const handoff = { ...handoffPayload, digest: digest(handoffPayload) };

  const releasedRegistry = releaseCapabilityLeases({
    registry: leaseRegistry,
    leaseIds: task.leaseIds,
    changeSetId: changeSet.id,
    owner: task.owner,
    branch: task.branch,
  });

  return {
    task: {
      ...task,
      state: "SUBMITTED",
      submittedAt,
      handoffDigest: handoff.digest,
    },
    handoff,
    leaseRegistry: releasedRegistry,
  };
}

async function git(root, ...args) {
  return (
    await execute("git", ["--no-optional-locks", "-C", root, ...args], {
      encoding: "utf8",
      timeout: 15000,
      maxBuffer: 2 * 1024 * 1024,
    })
  ).stdout.trim();
}

export async function collectTaskGitIdentity(root, baseSha) {
  const [headSha, treeSha, branch, status] = await Promise.all([
    git(root, "rev-parse", "HEAD"),
    git(root, "rev-parse", "HEAD^{tree}"),
    git(root, "branch", "--show-current"),
    git(root, "status", "--porcelain=v1", "--untracked-files=normal"),
  ]);
  let baseIsAncestor = false;
  try {
    await execute(
      "git",
      ["--no-optional-locks", "-C", root, "merge-base", "--is-ancestor", baseSha, headSha],
      { timeout: 15000 },
    );
    baseIsAncestor = true;
  } catch {
    baseIsAncestor = false;
  }
  return {
    headSha,
    treeSha,
    branch: branch || "DETACHED",
    dirty: Boolean(status),
    baseIsAncestor,
  };
}

async function writeJsonAtomic(path, value) {
  await mkdir(resolve(path, ".."), { recursive: true, mode: 0o700 });
  const temporary = path + ".tmp-" + randomUUID();
  await writeFile(temporary, JSON.stringify(value, null, 2) + "\n", {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
  await rename(temporary, path);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function resolveStateDir(root, requested) {
  if (requested)
    return isAbsolute(requested) ? requested : resolve(root, requested);
  const gitPath = await git(root, "rev-parse", "--git-path", "morro-control");
  return isAbsolute(gitPath) ? gitPath : resolve(root, gitPath);
}

async function defaultCommandRunner(root, command) {
  try {
    const { stdout, stderr } = await execute(command.argv[0], command.argv.slice(1), {
      cwd: root,
      encoding: "utf8",
      timeout: command.timeoutSeconds * 1000,
      maxBuffer: 4 * 1024 * 1024,
    });
    return { status: "PASS", stdout, stderr };
  } catch {
    return { status: "FAIL", stdout: "", stderr: "" };
  }
}

function parseTaskArgs(args) {
  const action = args[0];
  const manifestPath = args[1];
  assert.ok(["start", "test", "submit"].includes(action), "TASK_ACTION_INVALID");
  assert.ok(manifestPath && !manifestPath.startsWith("--"), "TASK_MANIFEST_REQUIRED");
  const options = { action, manifestPath, owner: null, stateDir: null, ttlSeconds: 1800 };
  for (let i = 2; i < args.length; i++) {
    const key = args[i];
    const value = args[++i];
    assert.ok(value && !value.startsWith("--"), "TASK_ARGUMENT_VALUE_REQUIRED");
    if (key === "--owner") options.owner = value;
    else if (key === "--state-dir") options.stateDir = value;
    else if (key === "--ttl-seconds") options.ttlSeconds = Number(value);
    else throw new Error("TASK_ARGUMENT_INVALID:" + key);
  }
  return options;
}

export async function runTaskCli(args, { root = process.cwd() } = {}) {
  const parsed = parseTaskArgs(args);
  const manifestAbsolute = isAbsolute(parsed.manifestPath)
    ? parsed.manifestPath
    : resolve(root, parsed.manifestPath);
  const changeSet = validateChangeSetV2(await readJson(manifestAbsolute));
  const stateDir = await resolveStateDir(root, parsed.stateDir);
  const taskPath = join(stateDir, changeSet.id + ".task.json");
  const leasePath = join(stateDir, "capability-leases.json");
  const contextPath = join(stateDir, changeSet.id + ".context-pack.json");
  const handoffPath = join(stateDir, changeSet.id + ".handoff.json");

  if (parsed.action === "start") {
    assert.match(parsed.owner ?? "", OWNER, "TASK_OWNER_REQUIRED");
    try {
      await readFile(taskPath, "utf8");
      throw new Error("TASK_STATE_ALREADY_EXISTS");
    } catch (error) {
      if (error?.message === "TASK_STATE_ALREADY_EXISTS") throw error;
      if (error?.code !== "ENOENT") throw error;
    }
    const identity = await collectTaskGitIdentity(root, changeSet.baseSha);
    const started = buildTaskStart({
      changeSet,
      owner: parsed.owner,
      identity,
      now: new Date().toISOString(),
      ttlSeconds: parsed.ttlSeconds,
    });
    await writeJsonAtomic(leasePath, started.leaseRegistry);
    await writeJsonAtomic(contextPath, started.contextPack);
    await writeJsonAtomic(taskPath, started.task);
    return {
      action: "start",
      state: started.task.state,
      taskPath,
      contextPath,
      leasePath,
      candidateSha: started.task.candidateSha,
    };
  }

  const task = await readJson(taskPath);
  const leaseRegistry = await readJson(leasePath);
  const identity = await collectTaskGitIdentity(root, changeSet.baseSha);

  if (parsed.action === "test") {
    const tested = await buildTaskTest({
      task,
      changeSet,
      leaseRegistry,
      identity,
      commandRunner: (command) => defaultCommandRunner(root, command),
    });
    validateContextPack(tested.contextPack, changeSet);
    await writeJsonAtomic(contextPath, tested.contextPack);
    await writeJsonAtomic(taskPath, tested.task);
    return {
      action: "test",
      state: tested.task.state,
      taskPath,
      contextPath,
      candidateSha: tested.task.candidateSha,
      localProofDigest: tested.task.localProof.digest,
    };
  }

  const submitted = buildTaskSubmit({
    task,
    changeSet,
    leaseRegistry,
    identity,
  });
  await writeJsonAtomic(leasePath, submitted.leaseRegistry);
  await writeJsonAtomic(handoffPath, submitted.handoff);
  await writeJsonAtomic(taskPath, submitted.task);
  return {
    action: "submit",
    state: submitted.task.state,
    taskPath,
    handoffPath,
    candidateSha: submitted.task.candidateSha,
    handoffDigest: submitted.handoff.digest,
  };
}
