#!/usr/bin/env node
import assert from "node:assert/strict";
import prettier from "prettier";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  lstatSync,
  existsSync,
  realpathSync,
  mkdirSync,
  openSync,
  closeSync,
  fsyncSync,
  renameSync,
  rmdirSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { githubApi } from "../control-state/status.mjs";
import {
  canonicalJson,
  changeSetDigest,
  validateChangeSetV2,
} from "./changeset-v2.mjs";
import { buildClaimReanchor } from "./claim-lifecycle.mjs";
import {
  buildClaimGuardProof,
  findClaimCollisions,
} from "../fabric/claim-guard.mjs";
import {
  createLeaseRegistry,
  validateLeaseRegistry,
} from "./capability-leases.mjs";
import {
  buildTaskStart,
  buildTaskTest,
  buildTaskSubmit,
  validateTaskContext,
  validateTaskLocalProof,
} from "./task-lifecycle.mjs";

export const GENERATION_REPOSITORY =
  "luizanunciostoca/touristic-digital-platform";
const RP = ".github/morro-control/claims.json";
const EP = ".github/morro-control/events.ndjson";
const ENTRY = "tooling/mdctl/task-generation.mjs";
const SHA = /^[a-f0-9]{40}$/u;
const check = (v, code) => assert.ok(v, "GENERATION_" + code);
const same = (a, b, code) => assert.deepEqual(a, b, "GENERATION_" + code);
const hash = (v) => createHash("sha256").update(v).digest("hex");
export const generationDigest = (v) => hash(canonicalJson(v));
const bytes = (v) => JSON.stringify(v, null, 2) + "\n";
const pretty = (v) => prettier.format(bytes(v), { parser: "json" });
const git = (root, ...args) =>
  execFileSync("git", ["--no-optional-locks", "-C", root, ...args], {
    encoding: "utf8",
    timeout: 30000,
    maxBuffer: 8 * 1024 * 1024,
  }).trim();
const at = (root, sha, path) =>
  execFileSync("git", ["-C", root, "show", sha + ":" + path], {
    encoding: "utf8",
    timeout: 30000,
    maxBuffer: 8 * 1024 * 1024,
  });
const json = (path) => JSON.parse(regular(path));
function regular(path) {
  const stat = lstatSync(path);
  check(
    stat.isFile() && !stat.isSymbolicLink() && stat.size <= 2 * 1024 * 1024,
    "REGULAR_FILE_REQUIRED",
  );
  return readFileSync(path, "utf8");
}
function identity(root, base) {
  return {
    branch: git(root, "branch", "--show-current"),
    headSha: git(root, "rev-parse", "HEAD"),
    treeSha: git(root, "rev-parse", "HEAD^{tree}"),
    dirty: git(root, "status", "--porcelain", "--untracked-files=all") !== "",
    baseIsAncestor: git(root, "merge-base", base, "HEAD") === base,
  };
}
function stateDirectory(root) {
  const parent = realpathSync(
    resolve(root, git(root, "rev-parse", "--git-dir")),
  );
  const state = join(parent, "morro-control");
  if (existsSync(state))
    check(
      lstatSync(state).isDirectory() && !lstatSync(state).isSymbolicLink(),
      "STATE_DIRECTORY",
    );
  return state;
}
function sourceFiles(root, id) {
  const directory = stateDirectory(root);
  return [
    id + ".task.json",
    id + ".context-pack.json",
    id + ".handoff.json",
    "capability-leases.json",
  ].map((name) => {
    const path = join(directory, name);
    const content = existsSync(path) ? regular(path) : null;
    return { name, content, sha256: content === null ? null : hash(content) };
  });
}
function noActiveLeases(registry, now) {
  validateLeaseRegistry(registry);
  for (const lease of Object.values(registry.leases))
    check(
      !(lease.state === "ACTIVE" && Date.parse(lease.expiresAt) > now),
      "ACTIVE_PREDECESSOR_LEASE",
    );
}
function sourceMode(root, manifest, files, executor, now) {
  const values = files.map((f) =>
    f.content === null ? null : JSON.parse(f.content),
  );
  const [task, contextPack, handoff, leases] = values;
  if (leases) noActiveLeases(leases, now);
  if (task && contextPack && leases) {
    const historical = JSON.parse(
      at(root, task.candidateSha, ".morro/changesets/" + manifest.id + ".json"),
    );
    check(
      task.changeSetId === manifest.id &&
        task.branch === manifest.branch &&
        task.owner === executor,
      "HISTORY_IDENTITY",
    );
    check(
      git(root, "merge-base", task.candidateSha, "HEAD") === task.candidateSha,
      "HISTORY_NOT_ANCESTOR",
    );
    same(
      task.changeSetDigest,
      changeSetDigest(historical),
      "HISTORICAL_MANIFEST_DIGEST",
    );
    if (task.state !== "SUBMITTED")
      validateTaskContext({
        task,
        changeSet: historical,
        leaseRegistry: leases,
        contextPack,
      });
    else
      validateSubmitted(
        {
          task,
          contextPack,
          handoff,
          leaseRegistry: leases,
          localProof: task.localProof,
        },
        historical,
        {
          branch: task.branch,
          headSha: task.candidateSha,
          treeSha: git(root, "rev-parse", task.candidateSha + "^{tree}"),
          dirty: false,
          baseIsAncestor: true,
        },
      );
    if (task.state === "SUBMITTED")
      check(Date.parse(task.submittedAt) <= now, "HISTORY_FUTURE_SUBMISSION");
    if (task.state !== "STARTED")
      check(task.localProof, "HISTORY_PROOF_REQUIRED");
    if (task.localProof)
      validateTaskLocalProof({
        proof: task.localProof,
        task,
        changeSet: historical,
      });
    check(
      ["STARTED", "LOCAL_PROVEN", "SUBMITTED"].includes(task.state),
      "HISTORY_STATE",
    );
    return "HISTORY";
  }
  throw new Error("GENERATION_HISTORY_REQUIRED");
}

// Transport injection is for deterministic provider fixtures. The operational
// CLI below has no injection flag and verifies its canonical entrypoint first.
export async function captureGeneration(
  options,
  { api = githubApi, clock = Date.now } = {},
) {
  const { workspace: input, mainSha, prNumber, executor } = options;
  check(
    SHA.test(mainSha) && Number.isSafeInteger(prNumber) && prNumber > 0,
    "ARGUMENT_IDENTITY",
  );
  check(/^[A-Za-z0-9._:@/-]{1,120}$/u.test(executor ?? ""), "EXECUTOR");
  const workspace = realpathSync(input);
  same(
    git(workspace, "rev-parse", "--show-toplevel"),
    workspace,
    "WORKSPACE_TOPLEVEL",
  );
  const remote = "repos/" + GENERATION_REPOSITORY;
  const main = await api(remote + "/commits/main");
  same(main.sha, mainSha, "MAIN_MOVED");
  const observed = identity(workspace, mainSha);
  check(!observed.dirty && observed.baseIsAncestor, "WORKSPACE_IDENTITY");
  const pull = await api(remote + "/pulls/" + prNumber);
  check(pull.state === "open", "PR_NOT_OPEN");
  check(
    pull.number === prNumber &&
      pull.head?.repo?.full_name === GENERATION_REPOSITORY &&
      pull.base?.repo?.full_name === GENERATION_REPOSITORY &&
      pull.base.ref === "main" &&
      pull.head.ref === observed.branch,
    "PR_IDENTITY",
  );
  const ref = await api(
    remote + "/git/ref/heads/" + encodeURIComponent(observed.branch),
  );
  same(ref.object?.sha, pull.head.sha, "REMOTE_BRANCH_MOVED");
  check(
    git(workspace, "merge-base", ref.object.sha, observed.headSha) ===
      ref.object.sha,
    "REMOTE_HEAD_NOT_ANCESTOR",
  );
  const registry = JSON.parse(at(workspace, mainSha, RP));
  const entries = Object.entries(registry.claims).filter(
    ([, c]) => c.branch === observed.branch,
  );
  check(entries.length === 1, "CLAIM_RESOLUTION");
  const [id, claim] = entries[0];
  const mp = ".morro/changesets/" + id + ".json";
  const canonicalManifest = JSON.parse(at(workspace, mainSha, mp));
  const manifest = json(join(workspace, mp));
  validateChangeSetV2(manifest);
  const now = clock();
  check(
    claim.owner === "CHATGPT-PRO-CONTROL" &&
      claim.reviewer === "AUTOMATED-INDEPENDENT-PROOF" &&
      claim.status === "IMPLEMENTING" &&
      Date.parse(claim.expiresAt) > now,
    "CLAIM_AUTHORITY",
  );
  same(
    {
      ...manifest,
      baseSha: canonicalManifest.baseSha,
      state: canonicalManifest.state,
    },
    canonicalManifest,
    "MANIFEST_SCOPE_CHANGED",
  );
  same([...claim.paths].sort(), [...manifest.owns.paths].sort(), "CLAIM_SCOPE");
  same(findClaimCollisions(registry, id, now), [], "CLAIM_COLLISION");
  buildClaimGuardProof(workspace, {
    EXPECTED_CANDIDATE_SHA: observed.headSha,
    EXPECTED_BASE_SHA: mainSha,
    EXPECTED_BRANCH: observed.branch,
    MANIFEST_PATH: mp,
    CLAIM_GUARD_AUTHORITY: "ORCHESTRATOR",
  });
  const files = sourceFiles(workspace, id);
  const mode = sourceMode(workspace, manifest, files, executor, now);
  same((await api(remote + "/commits/main")).sha, mainSha, "MAIN_MOVED");
  return {
    workspace,
    mainSha,
    prNumber,
    executor,
    observed,
    id,
    claim,
    manifest,
    mp,
    files,
    mode,
    now,
    providerIdentity: {
      number: pull.number,
      state: pull.state,
      base: { ref: pull.base.ref, repository: pull.base.repo.full_name },
      head: {
        ref: pull.head.ref,
        sha: pull.head.sha,
        repository: pull.head.repo.full_name,
      },
      refSha: ref.object.sha,
      mergedAt: pull.merged_at ?? null,
      mergeCommitSha: pull.merge_commit_sha ?? null,
    },
  };
}

export function generationRequest(capture, nonce = randomUUID()) {
  check(capture.mode === "HISTORY", "HISTORY_REQUIRED");
  return {
    schemaVersion: 1,
    kind: "TDP_TASK_GENERATION_REQUEST",
    repository: GENERATION_REPOSITORY,
    claimId: capture.id,
    claimDigest: generationDigest(capture.claim),
    mainSha: capture.mainSha,
    candidateSha: capture.observed.headSha,
    treeSha: capture.observed.treeSha,
    branch: capture.observed.branch,
    prNumber: capture.prNumber,
    providerIdentity: capture.providerIdentity,
    executor: capture.executor,
    workspace: capture.workspace,
    mode: capture.mode,
    history: capture.files.map(({ name, sha256 }) => ({ name, sha256 })),
    authority: "CANONICAL_CLAIM_AND_TASK_HISTORY",
    nonce,
    issuedAt: new Date(capture.now).toISOString(),
    expiresAt: new Date(
      Math.min(capture.now + 1800000, Date.parse(capture.claim.expiresAt)),
    ).toISOString(),
  };
}
function validateRequest(request, capture) {
  check(/^[a-f0-9-]{32,36}$/u.test(request.nonce ?? ""), "NONCE");
  const issued = Date.parse(request.issuedAt),
    expiry = Date.parse(request.expiresAt);
  check(
    Number.isFinite(issued) &&
      Number.isFinite(expiry) &&
      issued <= capture.now &&
      capture.now < expiry &&
      expiry <= issued + 1800000 &&
      expiry <= Date.parse(capture.claim.expiresAt),
    "REQUEST_EXPIRED",
  );
  same(
    request,
    {
      ...generationRequest(capture, request.nonce),
      issuedAt: request.issuedAt,
      expiresAt: request.expiresAt,
    },
    "REQUEST_CHANGED",
  );
}
function durable(path, content, exclusive = true) {
  const temporary = exclusive ? path : path + ".tmp-" + randomUUID();
  const fd = openSync(temporary, "wx", 0o600);
  try {
    writeFileSync(fd, content);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  if (!exclusive) renameSync(temporary, path);
  const parent = openSync(dirname(path), "r");
  try {
    fsyncSync(parent);
  } finally {
    closeSync(parent);
  }
}
function generationPaths(capture, request) {
  const state = stateDirectory(capture.workspace);
  const generations = join(state, "generations");
  if (existsSync(generations))
    check(
      realpathSync(generations) === generations &&
        lstatSync(generations).isDirectory(),
      "GENERATION_DIRECTORY",
    );
  const common = realpathSync(
    resolve(
      capture.workspace,
      git(capture.workspace, "rev-parse", "--git-common-dir"),
    ),
  );
  return {
    directory: join(generations, request.nonce),
    lock: join(common, "task-generation.lock"),
  };
}
function preserveSource(capture) {
  same(
    sourceFiles(capture.workspace, capture.id),
    capture.files,
    "SOURCE_HISTORY_CHANGED",
  );
}
function preserveJournal(directory, expected) {
  check(
    realpathSync(directory) === directory && lstatSync(directory).isDirectory(),
    "GENERATION_DIRECTORY",
  );
  for (const [name, content] of Object.entries(expected))
    same(regular(join(directory, name)), content, "JOURNAL_CHANGED");
}
function appendJournal(directory, journal, name, value) {
  preserveJournal(directory, journal);
  journal[name] = bytes(value);
  durable(join(directory, name), journal[name]);
  preserveJournal(directory, journal);
}
function verifyFiles(root, expected, code) {
  for (const [path, content] of Object.entries(expected))
    same(regular(join(root, path)), content, code);
}
function sameCapture(current, capture) {
  same(current.observed, capture.observed, "FINAL_CANDIDATE_MOVED");
  same(current.manifest, capture.manifest, "FINAL_MANIFEST_MOVED");
  same(current.providerIdentity, capture.providerIdentity, "PROVIDER_CHANGED");
}
function finalFence(capture, request, clock) {
  preserveSource(capture);
  check(clock() < Date.parse(request.expiresAt), "REQUEST_EXPIRED");
  check(
    clock() < Date.parse(capture.claim.expiresAt),
    "CLAIM_EXPIRED_DURING_PROOF",
  );
  same(
    identity(capture.workspace, capture.mainSha),
    capture.observed,
    "FINAL_CANDIDATE_MOVED",
  );
}
async function terminalCapture(
  options,
  capture,
  request,
  decision,
  dependencies,
) {
  const { clock } = dependencies;
  const current = await captureGeneration(options, dependencies);
  sameCapture(current, capture);
  same(decision, null, "OWNER_DECISION_UNSUPPORTED");
  finalFence(capture, request, clock);
  return current;
}
export async function runGenerationProofCommand(workspace, command) {
  // Nested proofs must run without the parent's Node test-runner marker.
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, command.argv.slice(1), {
    cwd: workspace,
    encoding: "utf8",
    timeout: command.timeoutSeconds * 1000,
    maxBuffer: 4 * 1024 * 1024,
    env,
  });
  return {
    status: result.status === 0 && !result.error ? "PASS" : "FAIL",
    stdout: result.stdout,
    stderr: result.stderr,
  };
}
async function boundedProof(capture, manifest, registry, clock) {
  const initial = identity(capture.workspace, manifest.baseSha);
  same(initial, capture.observed, "FINAL_CANDIDATE_MOVED");
  const shared = {
    changeSet: manifest,
    identity: initial,
    now: () => new Date(clock()).toISOString(),
  };
  const started = buildTaskStart({
    ...shared,
    owner: capture.executor,
    leaseRegistry: registry,
  });
  const active = { ...shared, leaseRegistry: started.leaseRegistry };
  const tested = await buildTaskTest({
    ...active,
    task: started.task,
    commandRunner: (command) =>
      runGenerationProofCommand(capture.workspace, command),
  });
  same(
    identity(capture.workspace, manifest.baseSha),
    initial,
    "CANDIDATE_CHANGED_DURING_PROOF",
  );
  const submitted = buildTaskSubmit({ ...active, task: tested.task });
  return {
    ...submitted,
    contextPack: tested.contextPack,
    localProof: tested.task.localProof,
  };
}

function validateSubmitted(record, manifest, identity, prior) {
  const { task, contextPack, localProof, leaseRegistry } = record;
  check(
    Date.parse(task.startedAt) <= Date.parse(localProof.completedAt) &&
      Date.parse(localProof.completedAt) <= Date.parse(task.submittedAt),
    "HISTORY_PROOF_TIME",
  );
  const historical = structuredClone(leaseRegistry);
  if (!prior)
    for (const id of task.leaseIds) {
      const lease = historical.leases[id];
      same(lease.state, "RELEASED", "HISTORY_RELEASED_LEASE");
      check(
        Date.parse(lease.issuedAt) <= Date.parse(task.startedAt),
        "HISTORY_LEASE_TIME",
      );
      lease.state = "ACTIVE";
    }
  const ids = [...task.leaseIds];
  const started = buildTaskStart({
    changeSet: manifest,
    owner: task.owner,
    identity,
    leaseRegistry: prior ?? historical,
    now: task.startedAt,
    idFactory: () => ids.shift()?.replace(/^lease-/u, ""),
  });
  const active = {
    changeSet: manifest,
    identity,
    leaseRegistry: started.leaseRegistry,
  };
  const tested = {
    ...started.task,
    state: "LOCAL_PROVEN",
    testedAt: localProof.completedAt,
    contextPackDigest: contextPack.digest,
    localProof,
  };
  validateTaskContext({ ...active, task: tested, contextPack });
  const submitted = buildTaskSubmit({
    task: tested,
    ...active,
    now: task.submittedAt,
  });
  for (const id of task.leaseIds)
    same(
      leaseRegistry.leases[id],
      submitted.leaseRegistry.leases[id],
      "HISTORY_RELEASED_LEASE",
    );
  same(
    record,
    {
      ...submitted,
      leaseRegistry: prior ? submitted.leaseRegistry : leaseRegistry,
      contextPack,
      localProof,
    },
    "JOURNAL_PROOF_IDENTITY",
  );
}

async function metadataProjection(capture, preimages, projectedAt) {
  const transition =
    capture.manifest.baseSha === capture.mainSha
      ? {
          registry: JSON.parse(preimages[RP]),
          ledgerText: preimages[EP],
          manifest: capture.manifest,
        }
      : buildClaimReanchor({
          registry: JSON.parse(preimages[RP]),
          ledgerText: preimages[EP],
          manifest: capture.manifest,
          newBaseSha: capture.mainSha,
          observedAt: projectedAt,
          reason: "PROVEN_TASK_GENERATION_REANCHOR",
        });
  const proven = { ...transition.manifest, state: "LOCAL_PROVEN" };
  return {
    [RP]: await pretty(transition.registry),
    [EP]: transition.ledgerText,
    [capture.mp]: await pretty(proven),
  };
}
async function validateJournal(capture, nonce, intent, prepared, preliminary) {
  const request = intent.request;
  same(request.nonce, nonce, "JOURNAL_NONCE");
  same(prepared.state, "PREPARED_REQUIRES_FINAL_PROOF", "JOURNAL_STATE");
  same(prepared.requestDigest, generationDigest(request), "JOURNAL_DIGEST");
  same(
    prepared.preliminaryDigest,
    generationDigest(preliminary),
    "JOURNAL_PROOF_DIGEST",
  );
  same(intent.files, capture.files, "SOURCE_HISTORY_CHANGED");
  const original = {
    ...capture,
    manifest: JSON.parse(
      at(capture.workspace, request.candidateSha, capture.mp),
    ),
    observed: {
      ...capture.observed,
      headSha: request.candidateSha,
      treeSha: git(
        capture.workspace,
        "rev-parse",
        request.candidateSha + "^{tree}",
      ),
    },
  };
  validateRequest(request, original);
  same(request.mode, "HISTORY", "HISTORY_REQUIRED");
  same(intent.ownerDecision, null, "JOURNAL_AUTHORITY");
  const preimages = Object.fromEntries(
    [RP, EP, capture.mp].map((p) => [
      p,
      at(capture.workspace, request.candidateSha, p),
    ]),
  );
  same(intent.preimages, preimages, "JOURNAL_PREIMAGES");
  check(
    Date.parse(prepared.projectedAt) >=
      Date.parse(preliminary.localProof.completedAt) &&
      Date.parse(prepared.projectedAt) <= capture.now &&
      Date.parse(preliminary.task.startedAt) >= Date.parse(request.issuedAt),
    "JOURNAL_TIME",
  );
  same(
    prepared.after,
    await metadataProjection(original, preimages, prepared.projectedAt),
    "JOURNAL_PROJECTION",
  );
  const prior = intent.files[3].content
    ? JSON.parse(intent.files[3].content)
    : createLeaseRegistry();
  validateSubmitted(preliminary, original.manifest, original.observed, prior);
}

async function withGenerationLock(lock, action) {
  mkdirSync(lock);
  const result = await action();
  rmdirSync(lock);
  return result;
}
export async function prepareGeneration(options, request, dependencies = {}) {
  const api = dependencies.api ?? githubApi,
    clock = dependencies.clock ?? Date.now;
  const capture = await captureGeneration(options, { api, clock });
  validateRequest(request, capture);
  check(capture.mode === "HISTORY", "HISTORY_REQUIRED");
  const ownerDecision = null;
  const paths = generationPaths(capture, request);
  const { directory } = paths;
  check(!existsSync(directory), "NONCE_ALREADY_USED");
  return withGenerationLock(paths.lock, async () => {
    const recaptured = await captureGeneration(options, { api, clock });
    validateRequest(request, recaptured);
    const preimages = Object.fromEntries(
      [RP, EP, capture.mp].map((p) => [p, regular(join(capture.workspace, p))]),
    );
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const journal = {
      "intent.json": bytes({
        request,
        ownerDecision,
        files: capture.files,
        preimages,
      }),
    };
    durable(join(directory, "intent.json"), journal["intent.json"]);
    const priorLeases = capture.files.find(
      (f) => f.name === "capability-leases.json",
    ).content;
    const preliminary = await boundedProof(
      capture,
      capture.manifest,
      priorLeases ? JSON.parse(priorLeases) : createLeaseRegistry(),
      clock,
    );
    appendJournal(directory, journal, "preliminary-proof.json", preliminary);
    const terminal = await terminalCapture(
      options,
      capture,
      request,
      ownerDecision,
      { api, clock },
    );
    validateRequest(request, terminal);
    const projectedAt = new Date(clock()).toISOString();
    const after = await metadataProjection(capture, preimages, projectedAt);
    finalFence(capture, request, clock);
    verifyFiles(capture.workspace, preimages, "PREIMAGE_CHANGED");
    appendJournal(directory, journal, "prepared.json", {
      state: "PREPARED_REQUIRES_FINAL_PROOF",
      requestDigest: generationDigest(request),
      preliminaryDigest: generationDigest(preliminary),
      projectedAt,
      after,
    });
    for (const [path, content] of Object.entries(after)) {
      preserveJournal(directory, journal);
      preserveSource(capture);
      same(
        regular(join(capture.workspace, path)),
        preimages[path],
        "PREIMAGE_CHANGED",
      );
      if (content !== preimages[path])
        durable(join(capture.workspace, path), content, false);
      same(regular(join(capture.workspace, path)), content, "WRITE_READBACK");
    }
    verifyFiles(capture.workspace, after, "TERMINAL_WRITE_READBACK");
    preserveJournal(directory, journal);
    return {
      state: "PREPARED_REQUIRES_FINAL_PROOF",
      directory: directory,
      candidateSha: capture.observed.headSha,
      published: false,
    };
  });
}

export async function proveGeneration(options, nonce, dependencies = {}) {
  const api = dependencies.api ?? githubApi,
    clock = dependencies.clock ?? Date.now;
  check(/^[a-f0-9-]{32,36}$/u.test(nonce), "NONCE");
  const directory = join(
    stateDirectory(realpathSync(options.workspace)),
    "generations",
    nonce,
  );
  check(
    realpathSync(directory) === directory && lstatSync(directory).isDirectory(),
    "GENERATION_DIRECTORY",
  );
  const journal = Object.fromEntries(
    ["intent.json", "prepared.json", "preliminary-proof.json"].map((name) => [
      name,
      regular(join(directory, name)),
    ]),
  );
  const intent = JSON.parse(journal["intent.json"]),
    prepared = JSON.parse(journal["prepared.json"]);
  const request = intent.request;
  const preliminary = JSON.parse(journal["preliminary-proof.json"]);
  const capture = await captureGeneration(options, { api, clock });
  await validateJournal(capture, nonce, intent, prepared, preliminary);
  check(
    capture.observed.headSha !== request.candidateSha &&
      git(capture.workspace, "merge-base", request.candidateSha, "HEAD") ===
        request.candidateSha,
    "FINAL_COMMIT_REQUIRED",
  );
  verifyFiles(capture.workspace, prepared.after, "PREPARED_METADATA_CHANGED");
  // Material changes after the preliminary proof are allowed only inside the
  // existing claim, and are tested again here. No preliminary result is reused.
  const paths = generationPaths(capture, request);
  check(!existsSync(join(directory, "final-proof.json")), "FINAL_PROOF_EXISTS");
  return withGenerationLock(paths.lock, async () => {
    same(intent.ownerDecision, null, "JOURNAL_AUTHORITY");
    const recaptured = await captureGeneration(options, { api, clock });
    sameCapture(recaptured, capture);
    preserveJournal(directory, journal);
    await validateJournal(recaptured, nonce, intent, prepared, preliminary);
    const final = await boundedProof(
      capture,
      capture.manifest,
      preliminary.leaseRegistry,
      clock,
    );
    const terminal = await terminalCapture(
      options,
      capture,
      request,
      intent.ownerDecision,
      { api, clock },
    );
    await validateJournal(terminal, nonce, intent, prepared, preliminary);
    finalFence(capture, request, clock);
    appendJournal(directory, journal, "final-proof.json", {
      state: "FINAL_PROVEN",
      requestDigest: generationDigest(request),
      mainSha: capture.mainSha,
      candidateSha: capture.observed.headSha,
      treeSha: capture.observed.treeSha,
      ...final,
    });
    return {
      state: "FINAL_PROVEN",
      directory,
      mainSha: capture.mainSha,
      candidateSha: capture.observed.headSha,
      treeSha: capture.observed.treeSha,
      localProofDigest: final.localProof.digest,
      remoteProofAccepted: false,
    };
  });
}

async function main(args) {
  const [action, workspace, mainSha, pr, executor, value] = args;
  check(
    ["inspect", "prepare", "prove"].includes(action) &&
      args.length === (action === "inspect" ? 5 : 6),
    "USAGE",
  );
  const authorityRoot = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../..",
  );
  check(
    git(authorityRoot, "rev-parse", "HEAD") === mainSha &&
      git(authorityRoot, "status", "--porcelain", "--untracked-files=all") ===
        "",
    "CANONICAL_EXECUTABLE_REQUIRED",
  );
  check(
    git(authorityRoot, "hash-object", fileURLToPath(import.meta.url)) ===
      git(authorityRoot, "rev-parse", mainSha + ":" + ENTRY),
    "EXECUTABLE_CHANGED",
  );
  const options = { workspace, mainSha, prNumber: Number(pr), executor };
  const result =
    action === "inspect"
      ? generationRequest(await captureGeneration(options))
      : action === "prepare"
        ? await prepareGeneration(options, json(value))
        : await proveGeneration(options, value);
  console.log(JSON.stringify(result, null, 2));
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main(process.argv.slice(2)).catch(() => {
    console.error("GENERATION_COMMAND_FAILED");
    process.exitCode = 1;
  });
