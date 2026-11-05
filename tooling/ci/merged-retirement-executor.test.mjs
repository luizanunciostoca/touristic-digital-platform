import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import {
  repository,
  workflowPath,
  metadataPaths,
} from "./merged-retirement-executor.mjs";
import {
  buildClaimAcquisition,
  buildClaimRetirement,
} from "../mdctl/claim-lifecycle.mjs";

// The driver and five canonical claim modules are copied byte for byte.
// Git history, the retirement producer, patch application and bundle are real.
// Only REST/remote Git transport and the workspace/dependency/gate commands are
// fixtures; this suite is orchestration proof, not hosted certification.
async function driverFixture(t, scenario) {
  const root = mkdtempSync(join(tmpdir(), "retirement-driver-"));
  const trusted = join(root, "trusted");
  const remote = join(root, "remote.git");
  const source = fileURLToPath(new URL("../../", import.meta.url));
  const engine = "tooling/ci/merged-retirement-executor.mjs";
  const id = "MD-RETIREMENT-DRIVER";
  const paths = metadataPaths(id);
  const manifestPath = `.morro/changesets/${id}.json`;
  const ledgerPath = ".github/morro-control/events.ndjson";
  const registryPath = ".github/morro-control/claims.json";
  const requests = [];
  let base, material, materialTree, moved;
  const git = (cwd, ...args) =>
    execFileSync("/usr/bin/git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  const write = (path, text) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  };
  const writeJson = (path, value) =>
    write(path, JSON.stringify(value, null, 2) + "\n");
  const prefix = `/repos/${repository}`;
  const pull = () => ({
    id: 12,
    number: 12,
    merged: true,
    state: "closed",
    merged_at: "2026-01-01T00:00:00Z",
    merge_commit_sha: material,
    base: { ref: "main", repo: { full_name: repository } },
    head: {
      sha: material,
      ref: "feat/driver-material",
      repo: { full_name: repository },
    },
  });
  const server = createServer((request, response) => {
    const url = new URL(request.url, "http://fixture");
    if (url.pathname.startsWith("/git/")) {
      const path = resolve(root, decodeURIComponent(url.pathname.slice(5)));
      if (!path.startsWith(remote + "/") || !existsSync(path)) {
        response.writeHead(404).end();
        return;
      }
      response.end(readFileSync(path));
      return;
    }
    requests.push({ path: url.pathname + url.search, method: request.method });
    assert.equal(request.method, "GET");
    const path = url.pathname.slice(4);
    let value;
    if (path === prefix)
      value = {
        id: 456,
        full_name: repository,
        private: false,
        default_branch: "main",
      };
    else if (path === prefix + "/git/ref/heads/main") {
      if (existsSync(join(root, "main-moved"))) {
        git(remote, "update-ref", "refs/heads/main", moved);
        git(remote, "update-server-info");
      }
      value = {
        object: { sha: existsSync(join(root, "main-moved")) ? moved : base },
      };
    } else if (path === prefix + "/pulls/12") value = pull();
    else if (path === prefix + "/pulls")
      value = url.searchParams.get("state") === "open" ? [] : [pull()];
    else if (path === prefix + "/pulls/12/files")
      value = [{ filename: "material.txt", status: "modified" }];
    else if (path === prefix + "/git/commits/" + material)
      value = { sha: material, tree: { sha: materialTree } };
    else if (path === prefix + `/compare/${material}...${base}`)
      value = {
        status: "ahead",
        base_commit: { sha: material },
        merge_base_commit: { sha: material },
      };
    else if (path.startsWith(prefix + "/git/ref/heads/chore")) {
      response.writeHead(404).end("{}");
      return;
    } else {
      response.writeHead(500).end(JSON.stringify({ unexpected: request.url }));
      return;
    }
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify(value));
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
    rmSync(root, { recursive: true, force: true });
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const actualFetch = globalThis.fetch;
  t.mock.method(globalThis, "fetch", (url, options) => {
    assert.ok(url.startsWith("https://api.github.com/"));
    assert.equal(options.method, "GET");
    return actualFetch(
      origin + "/api" + new URL(url).pathname + new URL(url).search,
      options,
    );
  });
  const copied = new Set();
  function copyModule(path) {
    if (copied.has(path)) return;
    copied.add(path);
    const text = readFileSync(join(source, path), "utf8");
    write(join(trusted, path), text);
    for (const match of text.matchAll(
      /(?:from\s+|import\(\s*)["'](\.[^"']+)["']/gu,
    )) {
      const dependency = resolve(dirname(join(source, path)), match[1]);
      copyModule(dependency.slice(source.length));
    }
  }
  copyModule(engine);
  copyModule("tooling/mdctl/claim-lifecycle.mjs");
  write(
    join(trusted, "tooling/mdctl/mdctl.mjs"),
    `
import { runClaimCli } from './claim-lifecycle.mjs';
const fetchImpl = (url, options) => {
  if (!url.startsWith('https://api.github.com/')) throw Error('FIXTURE_API_TARGET');
  const parsed = new URL(url);
  return fetch(${JSON.stringify(origin)} + '/api' + parsed.pathname + parsed.search, options);
};
console.log(JSON.stringify(await runClaimCli(process.argv.slice(3), { fetchImpl })));
`,
  );
  write(
    join(trusted, "tooling/workspace/morro-workspace.mjs"),
    `
import { execFileSync } from 'node:child_process';
const git = (...args) => execFileSync('git', args, {encoding:'utf8'}).trim();
console.log(JSON.stringify({
  ready: true, exactBaseSha: process.argv[4], headSha: git('rev-parse','HEAD'),
  branch: git('branch','--show-current'), runtime: 'native',
  fallbackUsed: false, dependenciesReady: true,
}));
`,
  );
  write(
    join(trusted, "tooling/ci/local-fast-gate.mjs"),
    `
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const git = (...args) => execFileSync('git', args, {encoding:'utf8'}).trim();
const mode = process.argv[2], baseSha = process.argv[4];
const headSha = git('rev-parse','HEAD'), treeSha = git('rev-parse','HEAD^{tree}');
if (mode === '--prepare') {
  console.log(JSON.stringify({mode:'PREPARED',baseSha,headSha,files:${JSON.stringify(paths)}}));
} else {
  console.log(JSON.stringify({mode:'NON_RUNTIME',baseSha,headSha,treeSha}));
  const terminal = {
    mode: mode === '--certify' ? 'CERTIFIED' : 'ADMISSION_PASS',
    baseSha, headSha, treeSha, claimId: ${JSON.stringify(id)},
    workspaceRuntime: 'native', workspaceFallbackUsed: false,
  };
  console.log(JSON.stringify(terminal));
  if (mode === '--certify') {
    writeFileSync(${JSON.stringify(join(root, "certify-started"))}, 'executed');
    console.log('# tests 1\\n# pass 1\\n# fail 0\\n# cancelled 0\\n# skipped 0\\n# todo 0');
    if (${JSON.stringify(scenario)} === 'main-moved') writeFileSync(${JSON.stringify(join(root, "main-moved"))}, 'advance');
    if (${JSON.stringify(scenario)} === 'gate-fails') process.exitCode = 7;
    if (${JSON.stringify(scenario)} === 'conflicting-terminal') console.log(JSON.stringify({...terminal, headSha:'f'.repeat(40)}));
  }
}
`,
  );
  write(join(trusted, ".gitignore"), "node_modules/\n");
  writeJson(join(trusted, "package.json"), { private: true, type: "module" });
  git(trusted, "init", "-q", "-b", "main");
  git(trusted, "config", "user.name", "Retirement driver fixture");
  git(trusted, "config", "user.email", "fixture@example.invalid");
  const commit = (message) => {
    git(trusted, "add", ".");
    git(trusted, "commit", "-qm", message);
    return git(trusted, "rev-parse", "HEAD");
  };
  const claimBase = commit("fixture tooling base");
  const manifest = {
    schemaVersion: 2,
    id,
    objective: "retirement-driver-proof",
    baseSha: claimBase,
    branch: "feat/driver-material",
    state: "IMPLEMENTING",
    risk: "high",
    scope: "PLATFORM",
    owns: { paths: ["material.txt"], contracts: ["DRIVER"] },
    reads: { contracts: ["MAIN"] },
    produces: { events: ["CLAIM_ACQUIRED"], routes: [] },
    database: { tables: [] },
    auth: { capabilities: [] },
    dependencies: [],
    requiredEvidence: ["remote-proof"],
    requiredCapabilities: ["github:read"],
    contextPack: {
      maxBytes: 65536,
      include: ["changeset", "git-identity", "proof-plan"],
    },
    proof: {
      budget: { maxCommands: 1, maxSeconds: 60 },
      commands: [
        {
          id: "proof",
          argv: ["node", "--test", "tooling/fabric/claim-guard.test.mjs"],
          timeoutSeconds: 30,
        },
      ],
      requiredRemoteEvidence: ["remote-proof"],
    },
    stopAt: "REMOTE_PROVEN",
  };
  const now = new Date().toISOString();
  let state = buildClaimAcquisition({
    registry: {
      schemaVersion: 1,
      registryAuthority: "ORCHESTRATOR",
      claims: {},
    },
    ledgerText: "",
    manifest,
    observedAt: now,
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    domains: ["ci-release"],
  });
  const saveState = () => {
    writeJson(join(trusted, registryPath), state.registry);
    writeJson(join(trusted, manifestPath), state.manifest);
    write(join(trusted, ledgerPath), state.ledgerText);
  };
  saveState();
  commit("fixture admitted claim");
  write(join(trusted, "material.txt"), "merged material\n");
  material = commit("fixture merged material");
  materialTree = git(trusted, "rev-parse", "HEAD^{tree}");
  write(join(trusted, "later.txt"), "main after material merge\n");
  base = commit("fixture later main");
  if (scenario === "already-retired") {
    state = buildClaimRetirement({
      ...state,
      observedAt: now,
      retirementBaseSha: base,
      retirementBranch: "chore/previous-retirement",
      evidence: {
        id,
        reason: "MERGED_PR",
        branch: manifest.branch,
        baseSha: claimBase,
        prNumber: 12,
        mergeSha: material,
        mergeShaAncestorOfBase: true,
        claimBaseAncestorOfMerge: true,
        historicalManifestMatches: true,
        materialPaths: ["material.txt"],
      },
    });
    saveState();
    base = commit("fixture previous retirement");
  }
  git(root, "clone", "-q", "--bare", trusted, remote);
  moved = git(
    trusted,
    "commit-tree",
    git(trusted, "rev-parse", "HEAD^{tree}"),
    "-p",
    base,
    "-m",
    "later concurrent main",
  );
  git(remote, "fetch", "-q", trusted, moved);
  git(remote, "update-server-info");
  const bin = join(root, "bin");
  write(
    join(bin, "git"),
    `#!${process.execPath}\nimport('node:child_process').then(({spawnSync}) => { const result=spawnSync('/usr/bin/git',['-c',${JSON.stringify(`url.${origin}/git/remote.git.insteadOf=https://github.com/${repository}.git`)},...process.argv.slice(2)],{stdio:'inherit'}); process.exit(result.status ?? 1); });\n`,
  );
  write(join(bin, "pnpm"), "#!/bin/sh\nexit 0\n");
  execFileSync("chmod", ["+x", join(bin, "git"), join(bin, "pnpm")]);
  const eventPath = join(root, "event.json"),
    output = join(root, "output");
  const request = {
    claim_id: id,
    expected_main: base,
    material_head: material,
    merge_sha: material,
    merged_pr: "12",
    nonce: "abcdef012345",
  };
  writeJson(eventPath, {
    inputs: request,
    repository: {
      id: 456,
      full_name: repository,
      private: false,
      owner: { login: "luizanunciostoca" },
    },
    sender: { login: "luizanunciostoca" },
  });
  write(output, "");
  mkdirSync(join(root, "temp"));
  mkdirSync(join(root, "home"));
  const env = {
    PATH: `${bin}:${process.env.PATH}`,
    HOME: join(root, "home"),
    GITHUB_EVENT_PATH: eventPath,
    GITHUB_OUTPUT: output,
    GITHUB_WORKSPACE: trusted,
    RUNNER_TEMP: join(root, "temp"),
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_REPOSITORY: repository,
    GITHUB_REPOSITORY_ID: "456",
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
    GITHUB_SHA: base,
    GITHUB_WORKFLOW_SHA: base,
    GITHUB_RUN_ID: "1001",
    GITHUB_TOKEN: "driver-fixture-read-token",
  };
  const { prepareMergedRetirement } = await import(
    pathToFileURL(join(trusted, engine))
  );
  return {
    root,
    trusted,
    base,
    paths,
    id,
    env,
    output,
    requests,
    git,
    state,
    run: () => prepareMergedRetirement(env),
  };
}

for (const scenario of [
  "active",
  "already-retired",
  "main-moved",
  "gate-fails",
  "conflicting-terminal",
]) {
  test(`retirement driver: ${scenario}`, async (t) => {
    const fixture = await driverFixture(t, scenario);
    let outcome;
    if (["active", "already-retired"].includes(scenario))
      outcome = await fixture.run();
    else
      await assert.rejects(
        fixture.run,
        /MERGED_RETIREMENT_PREPARATION_FAILED/u,
      );
    const evidence = readFileSync(fixture.output, "utf8")
      .trim()
      .replace(/^evidence_dir=/u, "");
    const files = readdirSync(evidence);
    const seal = JSON.parse(
      readFileSync(join(evidence, "artifact-manifest.json")),
    );
    assert.equal(seal.publicationAuthorized, false);
    assert.equal(seal.classification, "VERIFICATION_INPUT_NOT_CERTIFICATE");
    assert.ok(fixture.requests.every(({ method }) => method === "GET"));
    const result = JSON.parse(
      readFileSync(join(evidence, outcome ? "result.json" : "failure.json")),
    );
    assert.ok(result.executions.every(({ args }) => !args.includes("push")));
    assert.equal(
      existsSync(join(fixture.root, "certify-started")),
      scenario !== "already-retired",
    );
    assert.equal(fixture.git(fixture.trusted, "status", "--porcelain"), "");
    if (scenario !== "active") {
      assert.ok(!files.includes("candidate.patch"));
      assert.ok(!files.includes("verification-input.bundle"));
      if (outcome) {
        assert.equal(outcome.status, "ALREADY_RETIRED_VERIFIED");
        assert.equal(outcome.candidate, undefined);
      } else {
        assert.equal(result.status, "NOT_PROVEN");
        assert.ok(!files.includes("result.json"));
      }
      return;
    }
    assert.equal(outcome.status, "LOCAL_CANONICAL_GATES_PASS_REVIEW_PENDING");
    assert.equal(outcome.publicationAuthorized, false);
    assert.equal(outcome.independentReview, "PENDING");
    assert.deepEqual(outcome.transition.paths, fixture.paths);
    assert.deepEqual(
      result.executions
        .filter(({ name }) =>
          [
            "workspace",
            "canonical-producer",
            "prepare",
            "admission",
            "certify",
          ].includes(name),
        )
        .map(({ name }) => name),
      ["workspace", "canonical-producer", "prepare", "admission", "certify"],
    );
    const patch = join(evidence, "candidate.patch");
    const replay = join(fixture.root, "replay");
    fixture.git(
      fixture.root,
      "clone",
      "-q",
      "--no-hardlinks",
      fixture.trusted,
      replay,
    );
    fixture.git(replay, "apply", "--check", patch);
    assert.ok(readFileSync(patch, "utf8").endsWith("\n"));
    fixture.git(replay, "apply", patch);
    assert.deepEqual(
      fixture.git(replay, "diff", "--name-only").split("\n").sort(),
      fixture.paths,
    );
    assert.ok(
      readFileSync(
        join(replay, ".github/morro-control/events.ndjson"),
        "utf8",
      ).startsWith(fixture.state.ledgerText),
    );
    fixture.git(replay, "add", "--", ...fixture.paths);
    assert.equal(fixture.git(replay, "write-tree"), outcome.candidate.tree);
  });
}
