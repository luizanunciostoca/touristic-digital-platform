import assert from "node:assert/strict";
import test from "node:test";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  symlinkSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  repository,
  workflowPath,
  validateRequest,
  validateInvocation,
  isolatedEnvironment,
  validateRemote,
  verifyTransition,
  verifyAlreadyRetired,
  terminalObject,
  tapSummary,
  createGithubReader,
  runChecked,
  sealEvidence,
  metadataPaths,
} from "./merged-retirement-executor.mjs";

const request = {
  claim_id: "MD-FIXTURE-MERGED",
  expected_main: "a".repeat(40),
  material_head: "b".repeat(40),
  merge_sha: "c".repeat(40),
  merged_pr: "12",
  nonce: "abcdef012345",
};
const branch = "chore/retire-merged-fixture";
function invocation() {
  const event = {
    inputs: { ...request },
    repository: {
      id: 123,
      full_name: repository,
      private: false,
      owner: { login: "luizanunciostoca" },
    },
    sender: { login: "luizanunciostoca" },
  };
  const env = {
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_REPOSITORY: repository,
    GITHUB_REPOSITORY_ID: "123",
    GITHUB_REPOSITORY_OWNER: "luizanunciostoca",
    GITHUB_ACTOR: "luizanunciostoca",
    GITHUB_TRIGGERING_ACTOR: "luizanunciostoca",
    GITHUB_REF: "refs/heads/main",
    GITHUB_RUN_ATTEMPT: "1",
    GITHUB_ACTIONS: "true",
    CI: "true",
    RUNNER_ENVIRONMENT: "github-hosted",
    RUNNER_OS: "Linux",
    GITHUB_SERVER_URL: "https://github.com",
    GITHUB_API_URL: "https://api.github.com",
    GITHUB_WORKFLOW_REF: `${repository}/${workflowPath}@refs/heads/main`,
    GITHUB_SHA: request.expected_main,
    GITHUB_WORKFLOW_SHA: request.expected_main,
    GITHUB_RUN_ID: "999",
  };
  return { event, env };
}
function remoteFixture() {
  return [
    { repositoryId: 123 },
    { id: 123, full_name: repository, default_branch: "main", private: false },
    { object: { sha: request.expected_main } },
    {
      number: 12,
      merged: true,
      state: "closed",
      base: { ref: "main", repo: { full_name: repository } },
      head: {
        sha: request.material_head,
        ref: "feat/fixture",
        repo: { full_name: repository },
      },
      merge_commit_sha: request.merge_sha,
    },
    { sha: request.material_head, tree: { sha: "d".repeat(40) } },
  ];
}
function transition() {
  const before = {
    registry: {
      version: 1,
      claims: {
        [request.claim_id]: { branch: "feat/fixture" },
        survivor: { scope: ["protected"] },
      },
    },
    manifest: {
      id: request.claim_id,
      state: "IMPLEMENTING",
      baseSha: "f".repeat(40),
      branch: "feat/fixture",
      requiredEvidence: ["full-quality", "exact-head-release-gates"],
      proof: { commands: [{ argv: ["node", "actual-proof.mjs"] }] },
    },
    ledger:
      JSON.stringify({
        eventType: "CLAIM_ACQUIRED",
        entity: request.claim_id,
      }) + "\n",
  };
  const events = ["MERGED", "CLAIM_RELEASED"].map((eventType) => ({
    eventType,
    entity: request.claim_id,
    actor: "ORCHESTRATOR",
    sourceSha: request.merge_sha,
    payload: {
      basis: "GITHUB_MERGED_PR_AND_MAIN_ANCESTRY",
      pullRequest: 12,
      mergeSha: request.merge_sha,
    },
  }));
  const after = structuredClone(before);
  delete after.registry.claims[request.claim_id];
  Object.assign(after.manifest, {
    state: "MERGED",
    branch,
    baseSha: request.expected_main,
  });
  after.ledger += events.map((event) => JSON.stringify(event) + "\n").join("");
  return { before, after, events };
}

test("retirement accepts a generic, closed request bound to owner/main dispatch", () => {
  const { event, env } = invocation();
  assert.deepEqual(validateInvocation(env, event).request, request);
  assert.equal(
    validateRequest({ ...request, claim_id: "MD-A-DIFFERENT-MERGED-TASK" })
      .claim_id,
    "MD-A-DIFFERENT-MERGED-TASK",
  );
  for (const change of [
    { claim_id: "../other" },
    { expected_main: "main" },
    { merged_pr: 12 },
    { nonce: "old" },
    { material_head: "" },
    { merge_sha: "UNKNOWN" },
    { approval: "historical" },
  ])
    assert.throws(() => validateRequest({ ...request, ...change }));
  for (const key of [
    "GITHUB_SHA",
    "GITHUB_WORKFLOW_SHA",
    "GITHUB_REPOSITORY",
    "GITHUB_REPOSITORY_ID",
    "GITHUB_REF",
    "GITHUB_ACTOR",
    "GITHUB_TRIGGERING_ACTOR",
    "GITHUB_RUN_ATTEMPT",
    "RUNNER_ENVIRONMENT",
    "GITHUB_WORKFLOW_REF",
  ])
    assert.throws(() => validateInvocation({ ...env, [key]: "other" }, event));
  const changed = structuredClone(event);
  changed.inputs.nonce = "000000000000";
  assert.equal(validateInvocation(env, changed).request.nonce, "000000000000");
  changed.sender.login = "other";
  assert.throws(() => validateInvocation(env, changed));
});

test("provider identity and merged material head/tree/merge are independently bound", () => {
  const fixture = remoteFixture();
  assert.equal(
    validateRemote(request, ...fixture).materialTree,
    "d".repeat(40),
  );
  for (const mutate of [
    (f) => f[1].id++,
    (f) => (f[2].object.sha = "e".repeat(40)),
    (f) => (f[3].merged = false),
    (f) => (f[3].head.sha = "e".repeat(40)),
    (f) => (f[3].head.repo.full_name = "fork/untrusted"),
    (f) => (f[3].merge_commit_sha = "e".repeat(40)),
    (f) => (f[3].base.ref = "other"),
    (f) => (f[4].tree.sha = "invalid"),
  ]) {
    const f = remoteFixture();
    mutate(f);
    assert.throws(() => validateRemote(request, ...f));
  }
});

test("canonical retirement envelope preserves survivors, proof authority and history", () => {
  const { before, after } = transition();
  assert.deepEqual(
    verifyTransition(before, after, request, branch).paths,
    metadataPaths(request.claim_id),
  );
  for (const mutate of [
    (a) => delete a.registry.claims.survivor,
    (a) => (a.registry.claims.unexpected = {}),
    (a) => (a.manifest.requiredEvidence = []),
    (a) => (a.manifest.proof.commands = []),
    (a) => (a.manifest.state = "RELEASED"),
    (a) => (a.ledger = a.ledger.replace("CLAIM_ACQUIRED", "REWRITTEN")),
    (a) =>
      (a.ledger = a.ledger.replace('"pullRequest":12', '"pullRequest":13')),
    (a) => (a.ledger += "{}\n"),
  ]) {
    const changed = structuredClone(after);
    mutate(changed);
    assert.throws(() => verifyTransition(before, changed, request, branch));
  }
});

test("already-retired readback is idempotent only with matching merged provenance", () => {
  const { before, after } = transition();
  assert.equal(
    verifyAlreadyRetired(after, request).status,
    "ALREADY_RETIRED_VERIFIED",
  );
  assert.throws(() => verifyAlreadyRetired(before, request));
  const reacquired = structuredClone(after);
  reacquired.ledger +=
    JSON.stringify({ entity: request.claim_id, eventType: "CLAIM_ACQUIRED" }) +
    "\n";
  assert.throws(() => verifyAlreadyRetired(reacquired, request));
  assert.throws(() =>
    verifyAlreadyRetired(after, { ...request, merge_sha: "e".repeat(40) }),
  );
  after.manifest.state = "IMPLEMENTING";
  assert.throws(() => verifyAlreadyRetired(after, request));
});

test("semantic terminal and TAP evidence reject duplicate, stale and skipped proof", () => {
  const result = {
    mode: "CERTIFIED",
    headSha: request.expected_main,
    nested: { value: "{quoted}" },
  };
  const output = "command output\n" + JSON.stringify(result, null, 2) + "\n";
  assert.deepEqual(
    terminalObject(output, {
      mode: "CERTIFIED",
      headSha: request.expected_main,
    }),
    result,
  );
  assert.throws(() => terminalObject(output + output, { mode: "CERTIFIED" }));
  assert.throws(() =>
    terminalObject(output, {
      mode: "CERTIFIED",
      headSha: request.material_head,
    }),
  );
  const tap =
    "# tests 2\n# pass 2\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n";
  assert.equal(tapSummary(tap).pass, 2);
  assert.throws(() => tapSummary(tap.replace("# skipped 0", "# skipped 1")));
  assert.throws(() => tapSummary(tap + tap));
});

test("GitHub transport is GET-only, repository-bound and fully paginated", async () => {
  const calls = [];
  const client = createGithubReader("fixture-token", async (url, options) => {
    calls.push({ url, options });
    return new Response(
      JSON.stringify(
        url.endsWith("page=1")
          ? Array.from({ length: 100 }, (_, id) => ({ id }))
          : [{ id: 100 }],
      ),
    );
  });
  assert.equal(
    (await client.list(`/repos/${repository}/pulls?state=open`)).length,
    101,
  );
  assert.equal(calls.length, 2);
  assert.ok(
    calls.every(
      ({ options }) => options.method === "GET" && options.redirect === "error",
    ),
  );
  await assert.rejects(() => client.get("/repos/other/project/pulls"));
  const duplicate = createGithubReader(
    "",
    async () => new Response(JSON.stringify([{ id: 1 }, { id: 1 }])),
  );
  await assert.rejects(() => duplicate.list(`/repos/${repository}/pulls`));
  const endless = createGithubReader("", async (url) => {
    const page = Number(new URL(url).searchParams.get("page"));
    return new Response(
      JSON.stringify(
        Array.from({ length: 100 }, (_, id) => ({ id: page * 100 + id })),
      ),
    );
  });
  await assert.rejects(
    () => endless.list(`/repos/${repository}/pulls`),
    /PAGINATION_INCOMPLETE/u,
  );
});

test("child environment strips credentials and inherited execution redirections", () => {
  const env = isolatedEnvironment(
    {
      PATH: "/bin",
      HOME: "/fixture-home",
      GITHUB_TOKEN: "secret",
      GH_TOKEN: "secret",
      NODE_OPTIONS: "--import=untrusted",
      GIT_DIR: "/other",
      GIT_CONFIG_COUNT: "99",
      ACTIONS_RUNTIME_TOKEN: "secret",
    },
    "/hooks",
    "/tmp/fixtures",
  );
  assert.equal(env.HOME, "/fixture-home");
  assert.equal(env.GIT_CONFIG_COUNT, "3");
  for (const key of [
    "GITHUB_TOKEN",
    "GH_TOKEN",
    "NODE_OPTIONS",
    "GIT_DIR",
    "ACTIONS_RUNTIME_TOKEN",
  ])
    assert.ok(!(key in env));
  assert.equal(env.GIT_CONFIG_GLOBAL, "/dev/null");
});

test("real subprocess execution is bounded, rejects leaked tokens and drains descendants", async () => {
  const execute = (script, options) =>
    runChecked(process.execPath, ["-e", script], options);
  const result = await execute("process.stdout.write('actual-execution')");
  assert.equal(result.stdout, "actual-execution");
  await assert.rejects(
    () => runChecked(process.execPath, ["-e", "process.exit(2)"]),
    /COMMAND_FAILED/u,
  );
  await assert.rejects(
    () =>
      runChecked(process.execPath, ["-e", "setInterval(()=>{},1000)"], {
        timeout: 100,
      }),
    /TIMEOUT/u,
  );
  await assert.rejects(
    () =>
      runChecked(process.execPath, ["-e", "console.log('fixture-token')"], {
        token: "fixture-token",
      }),
    /TOKEN_IN_OUTPUT/u,
  );
  await assert.rejects(
    () =>
      runChecked(process.execPath, ["-e", "console.log('x'.repeat(1000))"], {
        maxBytes: 20,
      }),
    /LOG_LIMIT/u,
  );
  await assert.rejects(
    () =>
      runChecked(process.execPath, [
        "-e",
        "require('node:child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'}).unref()",
      ]),
    /CHILDREN_REMAIN/u,
  );
});

test("a real isolated Git store ignores a planted hook and does not fabricate a lease", async () => {
  const directory = mkdtempSync(join(tmpdir(), "merged-retirement-git-"));
  try {
    const hooks = join(directory, "safe-hooks"),
      temporary = join(directory, "temporary"),
      repo = join(directory, "repository");
    for (const path of [hooks, temporary, repo]) mkdirSync(path);
    const env = isolatedEnvironment(process.env, hooks, temporary);
    const git = (...args) => runChecked("git", args, { cwd: repo, env });
    await git("init", "--quiet");
    writeFileSync(
      join(repo, ".git/hooks/pre-commit"),
      "#!/bin/sh\ntouch unsafe-hook-ran\n",
      { mode: 0o755 },
    );
    writeFileSync(join(repo, "proof.txt"), "fixture\n");
    await git("add", "proof.txt");
    await git(
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "commit",
      "-qm",
      "fixture",
    );
    assert.equal((await git("status", "--porcelain")).stdout, "");
    assert.ok(!existsSync(join(repo, "unsafe-hook-ran")));
    assert.ok(!existsSync(join(repo, ".git/objects/info/alternates")));
    assert.ok(!existsSync(join(repo, ".morro/leases")));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("artifact publication requires regular bounded files and a clean token scan", () => {
  const directory = mkdtempSync(join(tmpdir(), "merged-retirement-artifact-"));
  try {
    writeFileSync(
      join(directory, "result.json"),
      JSON.stringify({ status: "NOT_PROVEN" }),
    );
    sealEvidence(directory, "fixture-token");
    const manifest = JSON.parse(
      readFileSync(join(directory, "artifact-manifest.json")),
    );
    assert.equal(manifest.publicationAuthorized, false);
    assert.equal(manifest.classification, "VERIFICATION_INPUT_NOT_CERTIFICATE");
    assert.equal(manifest.members.length, 1);
    assert.throws(() => sealEvidence(directory, "fixture-token"));
    rmSync(join(directory, "artifact-manifest.json"));
    writeFileSync(join(directory, "result.json"), "fixture-token");
    assert.throws(() => sealEvidence(directory, "fixture-token"));
    writeFileSync(join(directory, "result.json"), "safe");
    symlinkSync(join(directory, "result.json"), join(directory, "redirect"));
    assert.throws(() => sealEvidence(directory, "fixture-token"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
