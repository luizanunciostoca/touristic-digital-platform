import assert from "node:assert/strict";
import test from "node:test";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  captureGeneration,
  runGenerationProofCommand,
  generationRequest,
  generationDigest,
  prepareGeneration,
  proveGeneration,
  verifyGenerationOwner,
  GENERATION_REPOSITORY,
} from "../mdctl/task-generation.mjs";
import {
  buildTaskStart,
  buildTaskRestart,
  buildTaskTest,
  buildTaskSubmit,
} from "../mdctl/task-lifecycle.mjs";

const ID = "MD-GENERATION-FIXTURE";
const MP = ".morro/changesets/" + ID + ".json";
const RP = ".github/morro-control/claims.json";
const EP = ".github/morro-control/events.ndjson";
const BRANCH = "fix/generation-fixture";
const OWNER = "FIXTURE-EXECUTOR";
const encode = (v) => JSON.stringify(v, null, 2) + "\n";
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
function fixtureIdentity(f) {
  return {
    branch: BRANCH,
    headSha: f.head,
    treeSha: f.git("rev-parse", "HEAD^{tree}"),
    dirty: false,
    baseIsAncestor: true,
  };
}
function setPath(object, path, value) {
  const keys = path.split(".");
  const key = keys.pop();
  keys.reduce((target, name) => target[name], object)[key] = value;
}
async function authorized(t, options) {
  const f = fixture(t, options);
  const request = generationRequest(await f.capture());
  f.approve(request);
  return { f, request };
}
function fixture(
  t,
  {
    timeoutSeconds = 10,
    proof = "import assert from 'node:assert/strict'; assert.equal(2 + 2, 4);",
  } = {},
) {
  const root = mkdtempSync(join(tmpdir(), "tdp-generation-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync("git", ["-C", root, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  const write = (path, data) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), data);
  };
  const commit = () => {
    git("add", ".");
    git("commit", "-qm", "fixture");
    return git("rev-parse", "HEAD");
  };
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.invalid");
  write("tooling/proof.test.mjs", proof);
  write(
    RP,
    encode({ schemaVersion: 1, registryAuthority: "ORCHESTRATOR", claims: {} }),
  );
  write(EP, "");
  const initial = commit();
  const manifest = {
    schemaVersion: 2,
    id: ID,
    objective: "prove-bounded-generation-fixture",
    baseSha: initial,
    branch: BRANCH,
    state: "IMPLEMENTING",
    risk: "high",
    scope: "PLATFORM",
    owns: {
      paths: [MP, "tooling/product.mjs", "tooling/proof.test.mjs"],
      contracts: [],
    },
    reads: { contracts: ["MAIN"] },
    produces: { events: [], routes: [] },
    database: { tables: [] },
    auth: { capabilities: [] },
    dependencies: [],
    requiredEvidence: ["automated-independent-proof", "exact-head-identity"],
    requiredCapabilities: ["github:read", "workspace:write:claimed-paths"],
    contextPack: {
      maxBytes: 65536,
      include: ["changeset", "git-identity", "proof-plan"],
    },
    proof: {
      budget: { maxCommands: 1, maxSeconds: 10 },
      commands: [
        {
          id: "fixture",
          argv: ["node", "--test", "tooling/proof.test.mjs"],
          timeoutSeconds,
        },
      ],
      requiredRemoteEvidence: [
        "automated-independent-proof",
        "exact-head-identity",
      ],
    },
    stopAt: "REMOTE_PROVEN",
  };
  const claim = {
    owner: "CHATGPT-PRO-CONTROL",
    reviewer: "AUTOMATED-INDEPENDENT-PROOF",
    branch: BRANCH,
    baseSha: initial,
    paths: manifest.owns.paths,
    domains: ["ci-release"],
    risk: "P1",
    status: "IMPLEMENTING",
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  };
  write(MP, encode(manifest));
  write(
    RP,
    encode({
      schemaVersion: 1,
      registryAuthority: "ORCHESTRATOR",
      claims: { [ID]: claim },
    }),
  );
  const main = commit();
  git("checkout", "-qb", BRANCH);
  write("tooling/product.mjs", "export const product = 1;\n");
  commit();
  const head = git("rev-parse", "HEAD");
  const pull = {
    number: 7,
    state: "open",
    merged_at: null,
    merge_commit_sha: null,
    head: {
      sha: head,
      ref: BRANCH,
      repo: { full_name: GENERATION_REPOSITORY },
    },
    base: { ref: "main", repo: { full_name: GENERATION_REPOSITORY } },
  };
  const provider = {
    main,
    pull,
    comments: [],
    owner: { id: 19, login: "luizanunciostoca", type: "User" },
  };
  const api = async (path) => {
    const suffix = path.replace("repos/" + GENERATION_REPOSITORY, "");
    if (suffix === "")
      return structuredClone({
        full_name: GENERATION_REPOSITORY,
        owner: provider.owner,
      });
    if (suffix === "/commits/main") return { sha: provider.main };
    if (suffix === "/pulls/7") return structuredClone(provider.pull);
    if (suffix.startsWith("/git/ref/heads/"))
      return { object: { sha: provider.pull.head.sha } };
    if (suffix.startsWith("/issues/7/comments?"))
      return structuredClone(provider.comments);
    if (suffix === "/issues/comments/31")
      return structuredClone(provider.comments.find((c) => c.id === 31));
    throw new Error("unexpected fixture API: " + path);
  };
  const options = {
    workspace: root,
    mainSha: main,
    prNumber: 7,
    executor: OWNER,
  };
  const state = join(root, ".git/morro-control");
  const approve = (request) => {
    const time = new Date().toISOString();
    provider.comments = [
      {
        id: 31,
        body: `APPROVED_TASK_GENERATION:${ID}:${generationDigest(request)}:${request.nonce}:${main}`,
        user: structuredClone(provider.owner),
        author_association: "OWNER",
        performed_via_github_app: null,
        created_at: time,
        updated_at: time,
      },
    ];
  };
  return {
    root,
    git,
    write,
    commit,
    main,
    head,
    manifest,
    options,
    provider,
    api,
    state,
    approve,
    capture: () => captureGeneration(options, { api }),
    prepare: (request) => prepareGeneration(options, request, { api }),
    prove: (nonce) => proveGeneration(options, nonce, { api }),
  };
}

test("missing history requires real owner identity before writes; actual final proof follows metadata commit", async (t) => {
  const f = fixture(t);
  const capture = await f.capture();
  assert.equal(capture.mode, "MISSING");
  const request = generationRequest(capture);
  await assert.rejects(f.prepare(request), /OWNER_DECISION_REQUIRED/);
  assert.equal(existsSync(f.state), false);
  f.approve(request);
  const prepared = await f.prepare(request);
  assert.equal(prepared.state, "PREPARED_REQUIRES_FINAL_PROOF");
  assert.equal(existsSync(join(prepared.directory, "final-proof.json")), false);
  const intent = readJson(join(prepared.directory, "intent.json"));
  assert.deepEqual(
    intent.files.map((file) => file.content),
    [null, null, null, null],
  );
  assert.equal(intent.ownerDecision.id, 31);
  const finalHead = f.commit();
  const result = await f.prove(request.nonce);
  assert.equal(result.state, "FINAL_PROVEN");
  assert.equal(result.candidateSha, finalHead);
  assert.equal(result.remoteProofAccepted, false);
  const final = readJson(join(prepared.directory, "final-proof.json"));
  assert.equal(final.localProof.candidateSha, finalHead);
  assert.equal(final.task.state, "SUBMITTED");
  assert.equal(final.localProof.changeSetDigest, final.task.changeSetDigest);
  assert.notEqual(final.localProof.candidateSha, request.candidateSha);
  await assert.rejects(f.prove(request.nonce), /FINAL_PROOF_EXISTS/);
});

test("closed acquisition cannot authorize continuation", async (t) => {
  const f = fixture(t);
  f.provider.pull.state = "closed";
  f.provider.pull.merged_at = new Date().toISOString();
  f.provider.pull.merge_commit_sha = f.main;
  await assert.rejects(f.capture(), /PR_NOT_OPEN/);
  assert.equal(existsSync(f.state), false);
});

for (const mode of [false, true, "restarted", "early-proof", "early-submit"])
  test(`complete ${mode || "expired STARTED"} history survives reanchor and final proof`, async (t) => {
    const f = fixture(t);
    const identity = fixtureIdentity(f);
    let started = buildTaskStart({
      changeSet: f.manifest,
      owner: OWNER,
      identity,
      now: new Date(Date.now() - (mode ? 10000 : 3600000)).toISOString(),
      ttlSeconds: 60,
    });
    if (typeof mode === "string")
      started = buildTaskRestart({
        ...started,
        changeSet: f.manifest,
        identity,
      });
    if (typeof mode === "string")
      assert.ok(
        started.leaseRegistry.leases[started.task.leaseIds[0]].issuedAt <
          started.task.startedAt,
      );
    const earlier = new Date(Date.now() - 5000).toISOString();
    let record = started;
    if (mode) {
      const tested = await buildTaskTest({
        task: started.task,
        now: mode === "early-proof" ? earlier : undefined,
        changeSet: f.manifest,
        leaseRegistry: started.leaseRegistry,
        identity,
        commandRunner: (command) => runGenerationProofCommand(f.root, command),
      });
      record = {
        ...buildTaskSubmit({
          task: tested.task,
          now:
            mode === "early-submit"
              ? new Date(Date.now() - 5000).toISOString()
              : undefined,
          changeSet: f.manifest,
          leaseRegistry: started.leaseRegistry,
          identity,
        }),
        contextPack: tested.contextPack,
      };
    }
    mkdirSync(f.state, { recursive: true });
    for (const [name, value] of [
      [ID + ".task.json", record.task],
      [ID + ".context-pack.json", record.contextPack],
      [ID + ".handoff.json", record.handoff],
      ["capability-leases.json", record.leaseRegistry],
    ])
      if (value) writeFileSync(join(f.state, name), encode(value));
    if (String(mode).startsWith("early-")) {
      await assert.rejects(f.capture(), /HISTORY_PROOF_TIME/);
      return;
    }
    const capture = await f.capture();
    assert.equal(capture.mode, "HISTORY");
    const request = generationRequest(capture);
    await f.prepare(request);
    f.commit();
    await assert.rejects(
      proveGeneration(f.options, request.nonce, {
        api: f.api,
        clock: () => Date.parse(request.expiresAt) + 1,
      }),
      /REQUEST_EXPIRED/,
    );
    await f.prove(request.nonce);
    for (const file of capture.files)
      if (file.content !== null)
        assert.equal(
          readFileSync(join(f.state, file.name), "utf8"),
          file.content,
        );
  });

for (const [name, path, value, expected] of [
  [
    "app comment",
    "performed_via_github_app",
    { id: 1 },
    /OWNER_COMMENT_IDENTITY/,
  ],
  ["wrong owner", "user.id", 20, /OWNER_COMMENT_IDENTITY/],
  ["edited", "updated_at", "2026-01-01T00:00:00Z", /OWNER_COMMENT_EDITED/],
  ["revoked", "body", null, /OWNER_REVOKED/],
  [
    "old approval",
    "created_at",
    "2026-01-01T00:00:00Z",
    /OWNER_COMMENT_EXPIRED/,
  ],
])
  test("owner decision rejects " + name, async (t) => {
    const { f, request } = await authorized(t);
    const comment = f.provider.comments[0];
    setPath(
      comment,
      path,
      value ?? comment.body.replace("APPROVED_", "REVOKED_"),
    );
    if (name === "old approval") comment.updated_at = value;
    await assert.rejects(f.prepare(request), expected);
    assert.equal(existsSync(f.state), false);
  });

test("duplicate, stale request and owner readback mutation fail closed", async (t) => {
  const { f, request } = await authorized(t);
  f.provider.comments.push(structuredClone(f.provider.comments[0]));
  await assert.rejects(
    verifyGenerationOwner(request, { api: f.api }),
    /OWNER_DECISION_REQUIRED/,
  );
  f.provider.comments.pop();
  await assert.rejects(
    verifyGenerationOwner(
      { ...request, expiresAt: "2026-01-01T00:00:00Z" },
      { api: f.api },
    ),
    /REQUEST_EXPIRED/,
  );
  const api = async (path) => {
    const result = await f.api(path);
    if (path.endsWith("/issues/comments/31")) result.body += " changed";
    return result;
  };
  await assert.rejects(
    verifyGenerationOwner(request, { api }),
    /OWNER_COMMENT_CHANGED/,
  );
});

test("changed request, dirty checkout, wrong main, source symlink and active predecessor are rejected", async (t) => {
  const { f, request } = await authorized(t);
  await assert.rejects(
    prepareGeneration(f.options, { ...request, mode: "FRESH" }, { api: f.api }),
    /REQUEST_CHANGED/,
  );
  f.provider.main = "f".repeat(40);
  await assert.rejects(f.capture(), /MAIN_MOVED/);
  f.provider.main = f.main;
  f.write("tooling/product.mjs", "dirty");
  await assert.rejects(f.capture(), /WORKSPACE_IDENTITY/);
  f.write("tooling/product.mjs", "export const product = 1;\n");
  mkdirSync(f.state, { recursive: true });
  symlinkSync(join(f.root, MP), join(f.state, ID + ".task.json"));
  await assert.rejects(f.capture(), /REGULAR_FILE_REQUIRED/);
  rmSync(join(f.state, ID + ".task.json"));
  const started = buildTaskStart({
    changeSet: f.manifest,
    owner: OWNER,
    identity: fixtureIdentity(f),
  });
  writeFileSync(
    join(f.state, "capability-leases.json"),
    encode(started.leaseRegistry),
  );
  await assert.rejects(f.capture(), /ACTIVE_PREDECESSOR_LEASE/);
});

test("existing lock prevents any generation and failing proof preserves intent without metadata promotion", async (t) => {
  const { f, request } = await authorized(t, {
    proof: "throw new Error('deliberate fixture failure');",
  });
  const lock = join(f.root, ".git/task-generation.lock");
  mkdirSync(lock);
  await assert.rejects(f.prepare(request), /EEXIST/);
  assert.equal(existsSync(f.state), false);
  rmSync(lock, { recursive: true });
  await assert.rejects(f.prepare(request), /TASK_PROOF_COMMAND_FAILED/);
  assert.equal(existsSync(lock), true);
  assert.equal(
    existsSync(join(f.state, "generations", request.nonce, "intent.json")),
    true,
  );
  assert.equal(readJson(join(f.root, MP)).state, "IMPLEMENTING");
  assert.equal(f.git("status", "--porcelain"), "");
});

test("proof that mutates candidate cannot promote; canonical CLI refuses unintegrated source", async (t) => {
  const { f, request } = await authorized(t, {
    proof:
      "import {writeFileSync} from 'node:fs'; writeFileSync('tooling/product.mjs', 'mutation');",
  });
  await assert.rejects(f.prepare(request), /CANDIDATE_CHANGED_DURING_PROOF/);
  assert.equal(readJson(join(f.root, MP)).state, "IMPLEMENTING");
  const script = fileURLToPath(
    new URL("../mdctl/task-generation.mjs", import.meta.url),
  );
  const result = spawnSync(
    process.execPath,
    [script, "inspect", f.root, f.main, "7", OWNER],
    { encoding: "utf8" },
  );
  assert.notEqual(result.status, 0);
  assert.equal(result.stderr, "GENERATION_COMMAND_FAILED\n");
});

test("changed candidate invalidates request before reservation", async (t) => {
  const { f, request } = await authorized(t);
  f.write("tooling/product.mjs", "export const product = 2;\n");
  f.commit();
  await assert.rejects(f.prepare(request), /REQUEST_CHANGED/);
  assert.equal(existsSync(f.state), false);
});

test("main drift after actual preliminary proof preserves evidence but makes no metadata mutation", async (t) => {
  const { f, request } = await authorized(t);
  let reads = 0;
  const api = async (path) => {
    if (path.endsWith("/commits/main") && ++reads === 5)
      return { sha: "f".repeat(40) };
    return f.api(path);
  };
  await assert.rejects(
    prepareGeneration(f.options, request, { api }),
    /MAIN_MOVED/,
  );
  assert.equal(
    existsSync(
      join(f.state, "generations", request.nonce, "preliminary-proof.json"),
    ),
    true,
  );
  assert.equal(f.git("status", "--porcelain"), "");
  assert.equal(existsSync(join(f.root, ".git/task-generation.lock")), true);
});

test("final proof rejects dirty or changed metadata and changed journal", async (t) => {
  const { f, request } = await authorized(t);
  const prepared = await f.prepare(request);
  await assert.rejects(f.prove(request.nonce), /WORKSPACE_IDENTITY/);
  f.commit();
  const journalFiles = [
    "intent.json",
    "prepared.json",
    "preliminary-proof.json",
  ];
  const originals = journalFiles.map((name) =>
    readFileSync(join(prepared.directory, name), "utf8"),
  );
  for (const [index, path, value, expected] of [
    [0, "request.executor", "OTHER", /JOURNAL_DIGEST/],
    [0, "request.nonce", "a".repeat(32), /JOURNAL_NONCE/],
    [1, "state", "FINAL_PROVEN", /JOURNAL_STATE/],
    [0, "preimages", { [MP]: "{}" }, /JOURNAL_PREIMAGES/],
    [2, "task.candidateSha", "f".repeat(40), /JOURNAL_PROOF_DIGEST/],
  ]) {
    const changed = JSON.parse(originals[index]);
    setPath(changed, path, value);
    writeFileSync(
      join(prepared.directory, journalFiles[index]),
      encode(changed),
    );
    await assert.rejects(f.prove(request.nonce), expected);
    writeFileSync(
      join(prepared.directory, journalFiles[index]),
      originals[index],
    );
  }
  const falsified = JSON.parse(originals[2]);
  falsified.task.candidateSha = "f".repeat(40);
  writeFileSync(join(prepared.directory, journalFiles[2]), encode(falsified));
  const projection = JSON.parse(originals[1]);
  projection.preliminaryDigest = generationDigest(falsified);
  writeFileSync(join(prepared.directory, journalFiles[1]), encode(projection));
  await assert.rejects(f.prove(request.nonce), /JOURNAL_PROOF_IDENTITY/);
  for (let i = 0; i < journalFiles.length; i++)
    writeFileSync(join(prepared.directory, journalFiles[i]), originals[i]);
  const manifest = readJson(join(f.root, MP));
  manifest.state = "REMOTE_PROVEN";
  f.write(MP, encode(manifest));
  f.commit();
  await assert.rejects(f.prove(request.nonce), /PREPARED_METADATA_CHANGED/);
  assert.equal(existsSync(join(prepared.directory, "final-proof.json")), false);
});

test("proof timeout is a failure, never an empty successful proof", async (t) => {
  const { f, request } = await authorized(t, {
    timeoutSeconds: 1,
    proof: "setTimeout(() => {}, 5000);",
  });
  await assert.rejects(f.prepare(request), /TASK_PROOF_COMMAND_FAILED/);
  assert.equal(readJson(join(f.root, MP)).state, "IMPLEMENTING");
});

test("generation parent symlink cannot redirect durable writes", async (t) => {
  const { f, request } = await authorized(t);
  mkdirSync(f.state, { recursive: true });
  const elsewhere = join(f.root, ".git/elsewhere");
  mkdirSync(elsewhere);
  symlinkSync(elsewhere, join(f.state, "generations"));
  await assert.rejects(f.prepare(request), /GENERATION_DIRECTORY/);
  assert.equal(existsSync(join(elsewhere, request.nonce)), false);
});

test("proof cannot redirect preliminary evidence through a symlink", async (t) => {
  const f = fixture(t, {
    proof: `import {readdirSync,renameSync,symlinkSync} from 'node:fs';
      const parent = '.git/morro-control/generations/';
      const source = parent + readdirSync(parent)[0];
      renameSync(source, '.git/redirected');
      symlinkSync(process.cwd() + '/.git/redirected', source);`,
  });
  const request = generationRequest(await f.capture());
  f.approve(request);
  await assert.rejects(f.prepare(request), /GENERATION_DIRECTORY/);
  assert.equal(
    existsSync(join(f.root, ".git/redirected/preliminary-proof.json")),
    false,
  );
  assert.equal(f.git("status", "--porcelain"), "");
});

test("final lock recapture rejects a candidate committed after initial capture", async (t) => {
  const { f, request } = await authorized(t);
  const prepared = await f.prepare(request);
  f.commit();
  let reads = 0;
  const api = async (path) => {
    if (path.endsWith("/commits/main") && ++reads === 3) {
      f.write(
        "tooling/proof.test.mjs",
        "throw Error('must not execute stale proof');",
      );
      f.commit();
    }
    return f.api(path);
  };
  await assert.rejects(
    proveGeneration(f.options, request.nonce, { api }),
    /FINAL_CANDIDATE_MOVED/,
  );
  assert.equal(existsSync(join(prepared.directory, "final-proof.json")), false);
  assert.equal(existsSync(join(f.root, ".git/task-generation.lock")), true);
});

async function rejectConcurrentChange(t, phase, mutate, expected) {
  const { f, request } = await authorized(t);
  if (phase === "prove") {
    await f.prepare(request);
    f.commit();
  }
  const directory = join(f.state, "generations", request.nonce);
  let reads = 0;
  if (phase === "request") mutate(f, directory);
  const api = async (path) => {
    if (path.endsWith("/commits/main") && ++reads === 5) mutate(f, directory);
    return f.api(path);
  };
  await assert.rejects(
    phase === "prove"
      ? proveGeneration(f.options, request.nonce, { api })
      : prepareGeneration(f.options, request, { api }),
    expected,
  );
  assert.equal(existsSync(join(directory, "final-proof.json")), false);
  assert.equal(f.git("status", "--porcelain"), "");
  if (phase !== "request")
    assert.equal(existsSync(join(f.root, ".git/task-generation.lock")), true);
}
for (const phase of ["request", "prepare", "prove"])
  for (const change of ["head", "state"])
    test(`${phase} rejects concurrent remote ${change} movement`, (t) =>
      rejectConcurrentChange(
        t,
        phase,
        (f) => {
          if (change === "head") f.provider.pull.head.sha = f.main;
          else f.provider.pull.state = "closed";
        },
        /REQUEST_CHANGED|PROVIDER_CHANGED|PR_NOT_OPEN/,
      ));
for (const phase of ["prepare", "prove"])
  for (const name of [
    "intent.json",
    "preliminary-proof.json",
    ...(phase === "prove" ? ["prepared.json"] : []),
  ])
    test(`${phase} rejects terminal journal byte changes: ${name}`, (t) =>
      rejectConcurrentChange(
        t,
        phase,
        (_f, directory) => {
          const path = join(directory, name);
          writeFileSync(path, readFileSync(path, "utf8") + "\n");
        },
        /JOURNAL_CHANGED/,
      ));
