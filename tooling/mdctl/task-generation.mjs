#!/usr/bin/env node
import assert from "node:assert/strict";
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
  return "MISSING";
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
    pull,
    id,
    claim,
    registry,
    canonicalManifest,
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
    authority:
      capture.mode === "MISSING"
        ? "OWNER_ATTESTED_NO_OTHER_WRITERS"
        : "CANONICAL_CLAIM_AND_TASK_HISTORY",
    missingHistoryAcknowledged: capture.mode === "MISSING",
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
export async function verifyGenerationOwner(
  request,
  { api = githubApi, clock = Date.now } = {},
) {
  check(
    Date.parse(request.issuedAt) <= clock() &&
      clock() < Date.parse(request.expiresAt),
    "REQUEST_EXPIRED",
  );
  const remote = "repos/" + GENERATION_REPOSITORY;
  const repo = await api(remote);
  check(
    repo.full_name === GENERATION_REPOSITORY &&
      repo.owner?.type === "User" &&
      Number.isSafeInteger(repo.owner.id) &&
      repo.owner.login === GENERATION_REPOSITORY.split("/")[0],
    "REPOSITORY_OWNER",
  );
  const suffix = `${request.claimId}:${generationDigest(request)}:${request.nonce}:${request.mainSha}`;
  const approval = "APPROVED_TASK_GENERATION:" + suffix;
  const revocation = "REVOKED_TASK_GENERATION:" + suffix;
  async function readDecision() {
    const found = [];
    for (let page = 1; page <= 10; page++) {
      const comments = await api(
        `${remote}/issues/${request.prNumber}/comments?per_page=100&page=${page}`,
      );
      check(Array.isArray(comments) && comments.length <= 100, "COMMENT_PAGE");
      for (const comment of comments) {
        if (![approval, revocation].includes(comment.body)) continue;
        check(
          comment.user?.id === repo.owner.id &&
            comment.user.login === repo.owner.login &&
            comment.user.type === "User" &&
            comment.author_association === "OWNER" &&
            comment.performed_via_github_app === null,
          "OWNER_COMMENT_IDENTITY",
        );
        check(comment.body !== revocation, "OWNER_REVOKED");
        check(
          Number.isSafeInteger(comment.id) &&
            comment.id > 0 &&
            comment.created_at === comment.updated_at,
          "OWNER_COMMENT_EDITED",
        );
        const created = Date.parse(comment.created_at);
        check(
          created >= Date.parse(request.issuedAt) &&
            created <= clock() &&
            clock() - created <= 1800000,
          "OWNER_COMMENT_EXPIRED",
        );
        found.push(comment);
      }
      if (comments.length < 100) {
        check(found.length === 1, "OWNER_DECISION_REQUIRED");
        return found[0];
      }
    }
    throw new Error("GENERATION_COMMENT_PAGINATION_LIMIT");
  }
  const first = await readDecision();
  const normalize = (v) => ({ ...v, pin: v.pin ?? null });
  same(
    normalize(await api(`${remote}/issues/comments/${first.id}`)),
    normalize(first),
    "OWNER_COMMENT_CHANGED",
  );
  same(await readDecision(), first, "OWNER_COMMENT_CHANGED");
  return first;
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
function verifyFiles(root, expected, code) {
  for (const [path, content] of Object.entries(expected))
    same(regular(join(root, path)), content, code);
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
  same(current.observed, capture.observed, "FINAL_CANDIDATE_MOVED");
  same(current.manifest, capture.manifest, "FINAL_MANIFEST_MOVED");
  same(current.providerIdentity, capture.providerIdentity, "PROVIDER_CHANGED");
  if (decision)
    same(
      await verifyGenerationOwner(request, dependencies),
      decision,
      "OWNER_COMMENT_CHANGED",
    );
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
  return current;
}
async function boundedProof(capture, manifest, registry, clock) {
  const initial = identity(capture.workspace, manifest.baseSha);
  const started = buildTaskStart({
    changeSet: manifest,
    owner: capture.executor,
    identity: initial,
    leaseRegistry: registry,
    now: () => new Date(clock()).toISOString(),
    ttlSeconds: 1800,
  });
  const tested = await buildTaskTest({
    task: started.task,
    changeSet: manifest,
    leaseRegistry: started.leaseRegistry,
    identity: initial,
    now: () => new Date(clock()).toISOString(),
    commandRunner: async (command) => {
      // Node's parent test-runner marker can make a nested --test invocation
      // return without executing its requested file. A proof is a fresh process.
      const env = { ...process.env };
      delete env.NODE_TEST_CONTEXT;
      const result = spawnSync(process.execPath, command.argv.slice(1), {
        cwd: capture.workspace,
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
    },
  });
  same(
    identity(capture.workspace, manifest.baseSha),
    initial,
    "CANDIDATE_CHANGED_DURING_PROOF",
  );
  const submitted = buildTaskSubmit({
    task: tested.task,
    changeSet: manifest,
    leaseRegistry: started.leaseRegistry,
    identity: initial,
    now: () => new Date(clock()).toISOString(),
  });
  return {
    ...submitted,
    contextPack: tested.contextPack,
    localProof: tested.task.localProof,
  };
}

// Reconstruct released evidence with the same canonical builders that issued it.
// An in-memory expected value is never persisted over predecessor history.
function validateSubmitted(record, manifest, identity, prior) {
  const { task, contextPack, localProof, leaseRegistry } = record;
  const lease = leaseRegistry.leases[task.leaseIds[0]];
  const ids = [...task.leaseIds];
  const ttlSeconds = prior
    ? 1800
    : (Date.parse(lease.expiresAt) - Date.parse(lease.issuedAt)) / 1000;
  const started = buildTaskStart({
    changeSet: manifest,
    owner: task.owner,
    identity,
    leaseRegistry: prior ?? createLeaseRegistry(),
    now: task.startedAt,
    ttlSeconds,
    idFactory: () => ids.shift()?.replace(/^lease-/u, ""),
  });
  const tested = {
    ...started.task,
    state: "LOCAL_PROVEN",
    testedAt: localProof.completedAt,
    contextPackDigest: contextPack.digest,
    localProof,
  };
  validateTaskContext({
    task: tested,
    changeSet: manifest,
    leaseRegistry: started.leaseRegistry,
    contextPack,
  });
  const submitted = buildTaskSubmit({
    task: tested,
    changeSet: manifest,
    leaseRegistry: started.leaseRegistry,
    identity,
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

function metadataProjection(capture, preimages, projectedAt) {
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
  return {
    [RP]: bytes(transition.registry),
    [EP]: transition.ledgerText,
    [capture.mp]: bytes({ ...transition.manifest, state: "LOCAL_PROVEN" }),
  };
}
function validateJournal(capture, nonce, intent, prepared, preliminary) {
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
  same(
    Boolean(intent.ownerDecision),
    request.mode === "MISSING",
    "JOURNAL_AUTHORITY",
  );
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
    metadataProjection(original, preimages, prepared.projectedAt),
    "JOURNAL_PROJECTION",
  );
  const prior = intent.files[3].content
    ? JSON.parse(intent.files[3].content)
    : createLeaseRegistry();
  validateSubmitted(preliminary, original.manifest, original.observed, prior);
}

export async function prepareGeneration(options, request, dependencies = {}) {
  const api = dependencies.api ?? githubApi,
    clock = dependencies.clock ?? Date.now;
  const capture = await captureGeneration(options, { api, clock });
  validateRequest(request, capture);
  const ownerDecision =
    capture.mode === "MISSING"
      ? await verifyGenerationOwner(request, { api, clock })
      : null;
  const paths = generationPaths(capture, request);
  check(!existsSync(paths.directory), "NONCE_ALREADY_USED");
  mkdirSync(paths.lock);
  let complete = false;
  try {
    const recaptured = await captureGeneration(options, { api, clock });
    validateRequest(request, recaptured);
    const preimages = Object.fromEntries(
      [RP, EP, capture.mp].map((p) => [p, regular(join(capture.workspace, p))]),
    );
    mkdirSync(paths.directory, { recursive: true, mode: 0o700 });
    const journal = {
      "intent.json": bytes({
        request,
        ownerDecision,
        files: capture.files,
        preimages,
      }),
    };
    durable(join(paths.directory, "intent.json"), journal["intent.json"]);
    const priorLeases = capture.files.find(
      (f) => f.name === "capability-leases.json",
    ).content;
    const preliminary = await boundedProof(
      capture,
      capture.manifest,
      priorLeases ? JSON.parse(priorLeases) : createLeaseRegistry(),
      clock,
    );
    preserveJournal(paths.directory, journal);
    journal["preliminary-proof.json"] = bytes(preliminary);
    durable(
      join(paths.directory, "preliminary-proof.json"),
      journal["preliminary-proof.json"],
    );
    const terminal = await terminalCapture(
      options,
      capture,
      request,
      ownerDecision,
      { api, clock },
    );
    validateRequest(request, terminal);
    const projectedAt = new Date(clock()).toISOString();
    const after = metadataProjection(capture, preimages, projectedAt);
    verifyFiles(capture.workspace, preimages, "PREIMAGE_CHANGED");
    preserveJournal(paths.directory, journal);
    journal["prepared.json"] = bytes({
      state: "PREPARED_REQUIRES_FINAL_PROOF",
      requestDigest: generationDigest(request),
      preliminaryDigest: generationDigest(preliminary),
      projectedAt,
      after,
    });
    durable(join(paths.directory, "prepared.json"), journal["prepared.json"]);
    for (const [path, content] of Object.entries(after)) {
      preserveJournal(paths.directory, journal);
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
    preserveJournal(paths.directory, journal);
    complete = true;
    return {
      state: "PREPARED_REQUIRES_FINAL_PROOF",
      directory: paths.directory,
      candidateSha: capture.observed.headSha,
      published: false,
    };
  } finally {
    if (complete) rmdirSync(paths.lock);
  }
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
  validateJournal(capture, nonce, intent, prepared, preliminary);
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
  mkdirSync(paths.lock);
  let complete = false;
  try {
    if (intent.ownerDecision)
      same(
        await verifyGenerationOwner(request, { api, clock }),
        intent.ownerDecision,
        "OWNER_COMMENT_CHANGED",
      );
    const recaptured = await captureGeneration(options, { api, clock });
    same(recaptured.observed, capture.observed, "FINAL_CANDIDATE_MOVED");
    same(recaptured.manifest, capture.manifest, "FINAL_MANIFEST_MOVED");
    same(
      recaptured.providerIdentity,
      capture.providerIdentity,
      "PROVIDER_CHANGED",
    );
    preserveJournal(directory, journal);
    validateJournal(recaptured, nonce, intent, prepared, preliminary);
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
    validateJournal(terminal, nonce, intent, prepared, preliminary);
    preserveJournal(directory, journal);
    journal["final-proof.json"] = bytes({
      state: "FINAL_PROVEN",
      requestDigest: generationDigest(request),
      mainSha: capture.mainSha,
      candidateSha: capture.observed.headSha,
      treeSha: capture.observed.treeSha,
      ...final,
    });
    durable(join(directory, "final-proof.json"), journal["final-proof.json"]);
    preserveJournal(directory, journal);
    complete = true;
    return {
      state: "FINAL_PROVEN",
      directory,
      mainSha: capture.mainSha,
      candidateSha: capture.observed.headSha,
      treeSha: capture.observed.treeSha,
      localProofDigest: final.localProof.digest,
      remoteProofAccepted: false,
    };
  } finally {
    if (complete) rmdirSync(paths.lock);
  }
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
  main(process.argv.slice(2)).catch((error) => {
    console.error(String(error.message).split("\n")[0]);
    process.exitCode = 1;
  });
