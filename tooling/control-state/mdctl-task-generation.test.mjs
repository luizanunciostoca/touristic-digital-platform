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
const assertExists = (path, expected) =>
  assert.equal(existsSync(path), expected);
const readText = (path) => readFileSync(path, "utf8");
const readJson = (path) => JSON.parse(readText(path));
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
  return { f, request };
}
async function missingRequest(t, { keepRegistry = false } = {}) {
  const f = fixture(t);
  if (keepRegistry)
    for (const suffix of ["task", "context-pack", "handoff"])
      rmSync(join(f.state, `${ID}.${suffix}.json`), { force: true });
  else rmSync(f.state, { recursive: true });
  const request = generationRequest(await f.capture());
  assert.equal(request.mode, "MISSING");
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
    owner: { id: 19, login: "luizanunciostoca", type: "User" },
    comments: [],
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
    if (suffix.startsWith("/issues/7/comments?")) {
      const page = Number(suffix.match(/&page=(\d+)$/)[1]);
      return structuredClone(
        provider.comments.slice((page - 1) * 100, page * 100),
      );
    }
    if (suffix.startsWith("/issues/comments/"))
      return structuredClone(
        provider.comments.find(
          (comment) => comment.id === Number(suffix.split("/").at(-1)),
        ),
      );
    throw new Error("unexpected fixture API: " + path);
  };
  const options = {
    workspace: root,
    mainSha: main,
    prNumber: 7,
    executor: OWNER,
  };
  const state = join(root, ".git/morro-control");
  const lock = join(root, ".git/task-generation.lock");
  const journalPath = (nonce, name) => join(state, "generations", nonce, name);
  const historical = buildTaskStart({
    changeSet: manifest,
    owner: OWNER,
    identity: {
      branch: BRANCH,
      headSha: head,
      treeSha: git("rev-parse", "HEAD^{tree}"),
      dirty: false,
      baseIsAncestor: true,
    },
    now: new Date(Date.now() - 3600000).toISOString(),
    ttlSeconds: 60,
  });
  mkdirSync(state, { recursive: true });
  for (const [name, value] of [
    [ID + ".task.json", historical.task],
    [ID + ".context-pack.json", historical.contextPack],
    ["capability-leases.json", historical.leaseRegistry],
  ])
    writeFileSync(join(state, name), encode(value));
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
    lock,
    journalPath,
    approve: (request) => {
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
          issue_url: `https://api.github.com/repos/${GENERATION_REPOSITORY}/issues/7`,
          html_url: `https://github.com/${GENERATION_REPOSITORY}/pull/7#issuecomment-31`,
        },
      ];
    },
    capture: () => captureGeneration(options, { api }),
    prepare: (request) => prepareGeneration(options, request, { api }),
    prove: (nonce) => proveGeneration(options, nonce, { api }),
  };
}

test("history recovery executes final proof after metadata commit", async (t) => {
  const f = fixture(t);
  const capture = await f.capture();
  assert.equal(capture.mode, "HISTORY");
  const request = generationRequest(capture);
  assert.equal(request.authority, "CANONICAL_CLAIM_AND_TASK_HISTORY");
  for (const field of [
    "missingHistoryAcknowledged",
    "noOtherWritersAttested",
    "historyNotRetroactivelyRestored",
  ])
    assert.equal(Object.hasOwn(request, field), false);
  const prepared = await f.prepare(request);
  assert.equal(prepared.state, "PREPARED_REQUIRES_FINAL_PROOF");
  assertExists(join(prepared.directory, "final-proof.json"), false);
  const intent = readJson(join(prepared.directory, "intent.json"));
  assert.deepEqual(intent.files, capture.files);
  assert.equal(intent.ownerDecision, null);
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

test("partial history cannot issue or execute a generation request", async (t) => {
  const { f, request } = await authorized(t);
  rmSync(join(f.state, ID + ".context-pack.json"));
  await assert.rejects(f.capture(), /HISTORY_REQUIRED/);
  assert.throws(
    () => generationRequest({ mode: "UNKNOWN" }),
    /HISTORY_REQUIRED/,
  );
  await assert.rejects(
    f.prepare({ ...request, mode: "MISSING" }),
    /HISTORY_REQUIRED/,
  );
  assertExists(join(f.state, "generations"), false);
  assertExists(f.lock, false);
});

test("closed acquisition cannot authorize continuation", async (t) => {
  const f = fixture(t);
  f.provider.pull.state = "closed";
  f.provider.pull.merged_at = new Date().toISOString();
  f.provider.pull.merge_commit_sha = f.main;
  await assert.rejects(f.capture(), /PR_NOT_OPEN/);
  assertExists(join(f.state, "generations"), false);
});

for (const keepRegistry of [false, true])
  test(`MISSING proofs preserve absent history and existing registry=${keepRegistry}`, async (t) => {
    const { f, request } = await missingRequest(t, { keepRegistry });
    const before = (await f.capture()).files;
    for (const field of [
      "missingHistoryAcknowledged",
      "noOtherWritersAttested",
      "historyNotRetroactivelyRestored",
    ])
      assert.equal(request[field], true);
    await assert.rejects(f.prepare(request), /OWNER_DECISION_REQUIRED/);
    assertExists(f.lock, false);
    assertExists(join(f.state, "generations"), false);
    f.approve(request);
    const prepared = await f.prepare(request);
    const intent = readJson(join(prepared.directory, "intent.json"));
    assert.deepEqual(intent.files, before);
    assert.equal(intent.ownerDecision.user.id, 19);
    assert.equal(intent.request.authority, "OWNER_ATTESTED_NO_OTHER_WRITERS");
    const head = f.commit();
    f.provider.comments[0].pin = null;
    const result = await f.prove(request.nonce);
    assert.equal(result.state, "FINAL_PROVEN");
    assert.equal(result.candidateSha, head);
    assert.equal(result.remoteProofAccepted, false);
    const final = readJson(join(prepared.directory, "final-proof.json"));
    assert.equal(final.localProof.candidateSha, head);
    assert.equal(final.requestDigest, generationDigest(request));
    for (const file of before) {
      const path = join(f.state, file.name);
      if (file.content === null) assertExists(path, false);
      else assert.equal(readText(path), file.content);
    }
    assertExists(f.lock, false);
  });

for (const [name, content, expected] of [
  [ID + ".task.json", "null", /HISTORY_REQUIRED/],
  [ID + ".context-pack.json", "null", /HISTORY_REQUIRED/],
  [ID + ".handoff.json", "null", /HISTORY_REQUIRED/],
  [ID + ".handoff.json", "{}", /HISTORY_REQUIRED/],
  [ID + ".task.json", "{", SyntaxError],
  ["capability-leases.json", "null", /LEASE_REGISTRY/],
  ["capability-leases.json", "{}", /LEASE_REGISTRY/],
  ["capability-leases.json", "{", SyntaxError],
])
  test(`MISSING rejects existing ${name} containing ${content}`, async (t) => {
    const { f, request } = await missingRequest(t);
    f.write(".git/morro-control/" + name, content);
    await assert.rejects(f.capture(), expected);
    await assert.rejects(f.prepare(request), expected);
    assert.equal(readText(join(f.state, name)), content);
    assertExists(f.lock, false);
    assertExists(join(f.state, "generations"), false);
  });

test("MISSING rejects an active registry and dangling history symlinks", async (t) => {
  const { f, request } = await missingRequest(t);
  const active = buildTaskStart({
    changeSet: f.manifest,
    owner: OWNER,
    identity: fixtureIdentity(f),
  });
  f.write(
    ".git/morro-control/capability-leases.json",
    encode(active.leaseRegistry),
  );
  await assert.rejects(f.prepare(request), /ACTIVE_PREDECESSOR_LEASE/);
  rmSync(join(f.state, "capability-leases.json"));
  symlinkSync(
    join(f.root, ".git/nonexistent"),
    join(f.state, ID + ".task.json"),
  );
  await assert.rejects(f.prepare(request), /REGULAR_FILE_REQUIRED/);
  rmSync(f.state, { recursive: true });
  symlinkSync(join(f.root, ".git/nonexistent"), f.state);
  await assert.rejects(f.prepare(request), /STATE_DIRECTORY/);
  assertExists(f.lock, false);
  assertExists(join(f.root, ".git/nonexistent"), false);
});

for (const [name, path, value, expected] of [
  ["wrong owner id", "user.id", 20, /OWNER_COMMENT_IDENTITY/],
  ["wrong login", "user.login", "other", /OWNER_COMMENT_IDENTITY/],
  ["bot", "user.type", "Bot", /OWNER_COMMENT_IDENTITY/],
  ["association", "author_association", "MEMBER", /OWNER_COMMENT_IDENTITY/],
  ["app", "performed_via_github_app", { id: 1 }, /OWNER_COMMENT_IDENTITY/],
  ["edited", "updated_at", "2026-01-01T00:00:00Z", /OWNER_COMMENT_EDITED/],
  ["invalid comment id", "id", 0, /OWNER_COMMENT_EDITED/],
  [
    "wrong issue",
    "issue_url",
    "https://api.github.com/repos/other/repo/issues/7",
    /OWNER_COMMENT_TARGET/,
  ],
  [
    "wrong PR",
    "html_url",
    `https://github.com/${GENERATION_REPOSITORY}/pull/8#issuecomment-31`,
    /OWNER_COMMENT_TARGET/,
  ],
  [
    "wrong comment target",
    "html_url",
    `https://github.com/${GENERATION_REPOSITORY}/pull/7#issuecomment-32`,
    /OWNER_COMMENT_TARGET/,
  ],
])
  test("MISSING owner consent rejects " + name, async (t) => {
    const { f, request } = await missingRequest(t);
    f.approve(request);
    setPath(f.provider.comments[0], path, value);
    await assert.rejects(f.prepare(request), expected);
    assertExists(f.lock, false);
    assertExists(f.state, false);
    assert.equal(f.git("status", "--porcelain"), "");
  });

test("MISSING owner consent binds acknowledgements, time and positive owner id", async (t) => {
  const { f, request } = await missingRequest(t);
  f.approve(request);
  for (const field of [
    "missingHistoryAcknowledged",
    "noOtherWritersAttested",
    "historyNotRetroactivelyRestored",
  ])
    await assert.rejects(
      f.prepare({ ...request, [field]: false }),
      /REQUEST_CHANGED/,
    );
  await assert.rejects(
    f.prepare({ ...request, nonce: "a".repeat(32) }),
    /OWNER_DECISION_REQUIRED/,
  );
  await assert.rejects(
    verifyGenerationOwner(request, {
      api: f.api,
      clock: () => Date.parse(request.expiresAt),
    }),
    /REQUEST_EXPIRED/,
  );
  f.provider.owner.id = 0;
  await assert.rejects(f.prepare(request), /REPOSITORY_OWNER/);
  f.provider.owner.id = 19;
  for (const date of [
    "2026-01-01T00:00:00Z",
    new Date(Date.now() + 60000).toISOString(),
  ]) {
    f.provider.comments[0].created_at = date;
    f.provider.comments[0].updated_at = date;
    await assert.rejects(f.prepare(request), /OWNER_COMMENT_EXPIRED/);
  }
  assertExists(f.lock, false);
  assertExists(f.state, false);
});

test("owner pagination reads later duplicates and revocations; only null/missing pin normalizes", async (t) => {
  const { f, request } = await missingRequest(t);
  f.approve(request);
  const approval = f.provider.comments[0];
  const filler = Array.from({ length: 100 }, (_, index) => ({
    id: 1000 + index,
    body: "unrelated",
  }));
  f.provider.comments = [...filler, approval];
  let lists = 0;
  const api = async (path) => {
    const result = await f.api(path);
    if (path.includes("/comments?")) {
      for (const comment of result) if (++lists % 2) comment.pin = null;
    } else if (path.endsWith("/issues/comments/31")) result.pin = null;
    return result;
  };
  assert.equal((await verifyGenerationOwner(request, { api })).id, 31);
  for (const revoked of [false, true]) {
    f.provider.comments = [
      approval,
      ...filler.slice(0, 99),
      {
        ...approval,
        id: 32,
        html_url: approval.html_url.replace("31", "32"),
        body: revoked
          ? approval.body.replace("APPROVED_", "REVOKED_")
          : approval.body,
      },
    ];
    await assert.rejects(
      f.prepare(request),
      revoked ? /OWNER_REVOKED/ : /OWNER_DECISION_REQUIRED/,
    );
  }
  await assert.rejects(
    verifyGenerationOwner(request, {
      api: async (path) =>
        path.includes("/comments?") ? structuredClone(filler) : f.api(path),
    }),
    /COMMENT_PAGINATION_LIMIT/,
  );
  assertExists(f.lock, false);
  assertExists(f.state, false);
});

for (const drift of ["body", "pin", "deleted", "second-list"])
  test(`owner ${drift} drift fails repeated readback before writes`, async (t) => {
    const { f, request } = await missingRequest(t);
    f.approve(request);
    let reads = 0;
    const api = async (path) => {
      const result = await f.api(path);
      if (path.endsWith("/issues/comments/31")) {
        if (drift === "deleted") return null;
        if (drift === "body") result.body += " altered";
        if (drift === "pin") result.pin = true;
      }
      if (
        path.includes("/comments?") &&
        ++reads === 2 &&
        drift === "second-list"
      )
        result[0].body += " altered";
      return result;
    };
    await assert.rejects(
      prepareGeneration(f.options, request, { api }),
      /OWNER_COMMENT_CHANGED|OWNER_DECISION_REQUIRED/,
    );
    assertExists(f.lock, false);
    assertExists(f.state, false);
  });

for (const phase of ["prepare", "prove"])
  for (const stage of ["before-reservation", "before-proof", "after-proof"])
    test(`MISSING ${phase} revalidates owner ${stage}`, async (t) => {
      const { f, request } = await missingRequest(t);
      f.approve(request);
      if (phase === "prove") {
        await f.prepare(request);
        f.commit();
      }
      let ownerReads = 0;
      const revokeAt =
        ["before-reservation", "before-proof", "after-proof"].indexOf(stage) +
        1;
      const api = async (path) => {
        if (
          path === "repos/" + GENERATION_REPOSITORY &&
          ++ownerReads === revokeAt
        )
          f.provider.comments[0].body = f.provider.comments[0].body.replace(
            "APPROVED_",
            "REVOKED_",
          );
        return f.api(path);
      };
      await assert.rejects(
        phase === "prepare"
          ? prepareGeneration(f.options, request, { api })
          : proveGeneration(f.options, request.nonce, { api }),
        /OWNER_REVOKED/,
      );
      assertExists(f.lock, stage !== "before-reservation");
      assertExists(f.journalPath(request.nonce, "final-proof.json"), false);
      if (phase === "prepare") {
        assertExists(f.journalPath(request.nonce, "prepared.json"), false);
        assertExists(
          f.journalPath(request.nonce, "preliminary-proof.json"),
          stage === "after-proof",
        );
      }
      assert.equal(f.git("status", "--porcelain"), "");
    });

for (const phase of ["prepare", "prove"])
  test(`MISSING ${phase} preserves history appearing during terminal owner readback`, async (t) => {
    const { f, request } = await missingRequest(t);
    f.approve(request);
    if (phase === "prove") {
      await f.prepare(request);
      f.commit();
    }
    const before = [RP, EP, MP].map((path) => readText(join(f.root, path)));
    const appeared = join(f.state, ID + ".task.json");
    let ownerReads = 0;
    const api = async (path) => {
      if (path === "repos/" + GENERATION_REPOSITORY) ownerReads++;
      const result = await f.api(path);
      if (ownerReads === 3 && path.endsWith("/issues/comments/31"))
        writeFileSync(appeared, "null\n", { flag: "wx" });
      return result;
    };
    await assert.rejects(
      phase === "prepare"
        ? prepareGeneration(f.options, request, { api })
        : proveGeneration(f.options, request.nonce, { api }),
      /SOURCE_HISTORY_CHANGED/,
    );
    assert.equal(readText(appeared), "null\n");
    assert.deepEqual(
      [RP, EP, MP].map((path) => readText(join(f.root, path))),
      before,
    );
    assertExists(f.journalPath(request.nonce, "final-proof.json"), false);
    if (phase === "prepare")
      assertExists(f.journalPath(request.nonce, "prepared.json"), false);
    assertExists(f.lock, true);
    assert.equal(f.git("status", "--porcelain"), "");
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
        assert.equal(readText(join(f.state, file.name)), file.content);
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
  rmSync(join(f.state, ID + ".task.json"));
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
  const lock = f.lock;
  mkdirSync(lock);
  await assert.rejects(f.prepare(request), /EEXIST/);
  assertExists(join(f.state, "generations"), false);
  rmSync(lock, { recursive: true });
  await assert.rejects(f.prepare(request), /TASK_PROOF_COMMAND_FAILED/);
  assertExists(lock, true);
  assertExists(f.journalPath(request.nonce, "intent.json"), true);
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
  assertExists(join(f.state, "generations"), false);
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
  assertExists(f.journalPath(request.nonce, "preliminary-proof.json"), true);
  assert.equal(f.git("status", "--porcelain"), "");
  assertExists(f.lock, true);
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
    readText(join(prepared.directory, name)),
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
  assertExists(join(prepared.directory, "final-proof.json"), false);
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
  assertExists(join(elsewhere, request.nonce), false);
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
  await assert.rejects(f.prepare(request), /GENERATION_DIRECTORY/);
  assertExists(join(f.root, ".git/redirected/preliminary-proof.json"), false);
  assert.equal(f.git("status", "--porcelain"), "");
});

for (const mode of ["HISTORY", "MISSING"])
  for (const phase of ["prepare", "prove"])
    test(`${mode} ${phase} rejects candidate movement during terminal formatting`, async (t) => {
      const { f, request } =
        mode === "MISSING" ? await missingRequest(t) : await authorized(t);
      if (mode === "MISSING") f.approve(request);
      if (phase === "prove") {
        await f.prepare(request);
        f.commit();
      }
      const before = [RP, EP, MP].map((path) => readText(join(f.root, path)));
      let scheduled = false;
      const clock = () => {
        const stack = new Error().stack;
        // Commit after terminal identity is checked, before the awaited projection completes.
        if (
          !scheduled &&
          /at (finalFence|terminalCapture) /.test(stack.split("\n")[2]) &&
          stack.includes("at terminalCapture ")
        ) {
          scheduled = true;
          queueMicrotask(() => {
            f.write("tooling/product.mjs", "export const product = 2;\n");
            f.commit();
          });
        }
        return Date.now();
      };
      await assert.rejects(
        phase === "prepare"
          ? prepareGeneration(f.options, request, { api: f.api, clock })
          : proveGeneration(f.options, request.nonce, { api: f.api, clock }),
        /FINAL_CANDIDATE_MOVED/,
      );
      assert.equal(scheduled, true);
      assert.deepEqual(
        [RP, EP, MP].map((path) => readText(join(f.root, path))),
        before,
      );
      const receipt =
        phase === "prepare" ? "prepared.json" : "final-proof.json";
      assertExists(f.journalPath(request.nonce, receipt), false);
      assertExists(f.lock, true);
      assert.equal(f.git("status", "--porcelain"), "");
    });

for (const movedAt of [3, 4])
  test(`final lock rejects candidate movement at main read ${movedAt} before executing proof`, async (t) => {
    const { f, request } = await authorized(t);
    const prepared = await f.prepare(request);
    f.commit();
    let reads = 0;
    const api = async (path) => {
      if (path.endsWith("/commits/main") && ++reads === movedAt) {
        f.write(
          "tooling/proof.test.mjs",
          "import {writeFileSync} from 'node:fs'; writeFileSync('.git/stale-proof-ran', 'yes'); throw Error('must not execute stale proof');",
        );
        f.commit();
      }
      return f.api(path);
    };
    await assert.rejects(
      proveGeneration(f.options, request.nonce, { api }),
      /FINAL_CANDIDATE_MOVED/,
    );
    assertExists(join(prepared.directory, "final-proof.json"), false);
    assertExists(join(f.root, ".git/stale-proof-ran"), false);
    assertExists(f.lock, true);
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
  assertExists(join(directory, "final-proof.json"), false);
  assert.equal(f.git("status", "--porcelain"), "");
  if (phase !== "request") assertExists(f.lock, true);
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
