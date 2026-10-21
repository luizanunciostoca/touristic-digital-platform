import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  writeFileSync,
  rmSync,
  chmodSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runGithubAuthExec } from "./github-auth-exec.mjs";

const fixtureToken = "fixture-private-" + "value-for-auth-tests";
const repository = "example/workspace-proof";
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "auth-exec-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const env = {
    ...process.env,
    GH_TOKEN: "",
    GITHUB_TOKEN: "",
    GH_HOST: "github.com",
    GH_REPO: repository,
    GITHUB_REPOSITORY: repository,
    GITHUB_SERVER_URL: "https://github.com",
    GITHUB_API_URL: "https://api.github.com",
  };
  const git = (...args) => {
    const result = spawnSync("git", args, { cwd: root, env, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git("init", "--quiet");
  git("config", "user.email", "proof@example.invalid");
  git("config", "user.name", "Auth proof");
  git("config", "commit.gpgsign", "false");
  git("config", "core.hooksPath", "/dev/null");
  writeFileSync(join(root, "tracked"), "initial\n");
  git("add", "tracked");
  git("commit", "--quiet", "-m", "fixture");
  git("remote", "add", "origin", `https://github.com/${repository}.git`);
  const head = git("rev-parse", "HEAD");
  const options = {
    runtime: "native",
    root,
    repository,
    expectedHead: head,
    expectedMain: head,
    command: process.execPath,
    args: ["-e", "process.stdout.write('executed')"],
  };
  const calls = [];
  let ghBehavior;
  const spawn = (program, args, opts) => {
    calls.push({ program, args, opts });
    if (program === "gh") {
      if (ghBehavior) return ghBehavior(args, opts);
      return {
        status: 0,
        stdout:
          args[0] === "auth"
            ? fixtureToken + "\n"
            : JSON.stringify({ sha: head }),
        stderr: "",
      };
    }
    return spawnSync(program, args, opts);
  };
  const run = (change = {}, overrides = {}) =>
    runGithubAuthExec({ ...options, ...change }, { env, spawn, ...overrides });
  return {
    root,
    head,
    env,
    options,
    calls,
    spawn,
    run,
    git,
    setGh: (fn) => {
      ghBehavior = fn;
    },
  };
}

test("stored credential reaches native command privately; child stdin is empty", (t) => {
  const f = fixture(t);
  f.env.GH_REPO = `github.com/${repository}`;
  f.env.NODE_OPTIONS = "--require=/must-not-load";
  f.env.NODE_PATH = "/must-not-load";
  f.env.GIT_DIR = "/must-not-use";
  const result = f.run({
    args: [
      "-e",
      `const fs=require('node:fs');console.log(JSON.stringify({credential:!!process.env.GH_TOKEN,same:process.env.GH_TOKEN===process.env.GITHUB_TOKEN,repo:process.env.GITHUB_REPOSITORY,ghRepo:process.env.GH_REPO,stdin:fs.readFileSync(0,'utf8'),preload:process.env.NODE_OPTIONS??null}));`,
    ],
  });
  assert.equal(result.exitCode, 0);
  assert.equal(result.credentialSource, "gh-store");
  assert.deepEqual(JSON.parse(result.stdout), {
    credential: true,
    same: true,
    repo: repository,
    ghRepo: repository,
    stdin: "",
    preload: null,
  });
  const launch = f.calls.at(-1);
  assert.equal(launch.program, process.execPath);
  assert.equal(launch.opts.env.GH_TOKEN, undefined);
  assert.equal(launch.opts.env.GITHUB_TOKEN, undefined);
  assert.equal(launch.opts.env.NODE_PATH, undefined);
  assert.equal(launch.opts.env.GIT_DIR, undefined);
  assert.equal(JSON.parse(launch.opts.input).token, fixtureToken);
  assert.equal(
    f.calls.some((call) => JSON.stringify(call.args).includes(fixtureToken)),
    false,
  );
  assert.equal(JSON.stringify(result).includes(fixtureToken), false);
  delete f.env.GIT_DIR;
  assert.equal(f.git("status", "--porcelain"), "");
});

test("environment credential avoids fallback; command nonzero and redaction are preserved", (t) => {
  const f = fixture(t);
  f.env.GITHUB_TOKEN = fixtureToken;
  const r = f.run({
    args: [
      "-e",
      "process.stdout.write(process.env.GH_TOKEN);process.stderr.write(process.env.GITHUB_TOKEN);process.exitCode=17;",
    ],
  });
  assert.equal(r.credentialSource, "environment");
  assert.equal(r.exitCode, 17);
  assert.equal(r.stdout, "[REDACTED]");
  assert.equal(r.stderr, "[REDACTED]");
  assert.equal(
    f.calls.some((c) => c.program === "gh" && c.args[0] === "auth"),
    false,
  );
});

test("Debian launch uses Debian node and stdin, without credential or preload argv/env", (t) => {
  const f = fixture(t);
  f.env.GH_TOKEN = fixtureToken;
  const spawn = (program, args, opts) => {
    if (program !== "proot-distro") return f.spawn(program, args, opts);
    assert.deepEqual(args.slice(0, 6), [
      "login",
      "debian",
      "--",
      "node",
      "--input-type=module",
      "-e",
    ]);
    assert.equal(JSON.stringify(args).includes(fixtureToken), false);
    assert.equal(opts.env.GH_TOKEN, undefined);
    assert.equal(opts.env.GITHUB_TOKEN, undefined);
    assert.equal(JSON.parse(opts.input).token, fixtureToken);
    // Execute the same static wrapper locally; actual PRoot is a separate runtime proof.
    return spawnSync(process.execPath, args.slice(4), {
      ...opts,
      cwd: tmpdir(),
    });
  };
  const r = f.run({ runtime: "debian-proot" }, { spawn });
  assert.equal(r.exitCode, 0);
  assert.equal(r.stdout, "executed");
});

test("missing, conflicting and whitespace credentials fail before command dispatch", (t) => {
  for (const scenario of ["missing", "conflict", "whitespace"]) {
    const f = fixture(t);
    if (scenario === "missing")
      f.setGh(() => ({ status: 1, stdout: "", stderr: fixtureToken }));
    if (scenario === "conflict") {
      f.env.GITHUB_TOKEN = fixtureToken;
      f.env.GH_TOKEN = "different-fixture-value";
    }
    if (scenario === "whitespace") f.env.GITHUB_TOKEN = " " + fixtureToken;
    assert.throws(() => f.run(), /AUTH_EXEC_CREDENTIAL_/);
    assert.equal(
      f.calls.some((c) => c.program === process.execPath),
      false,
    );
  }
});

test("wrong host, repository, origin, SHA and dirty worktree fail closed", (t) => {
  for (const scenario of [
    "host",
    "repository",
    "gh-repo",
    "api",
    "server",
    "origin",
    "head",
    "main",
    "dirty",
  ]) {
    const f = fixture(t);
    let change = {};
    if (scenario === "host") f.env.GH_HOST = "example.invalid";
    if (scenario === "repository") f.env.GITHUB_REPOSITORY = "other/repo";
    if (scenario === "gh-repo") f.env.GH_REPO = "other/repo";
    if (scenario === "api") f.env.GITHUB_API_URL = "https://example.invalid";
    if (scenario === "server")
      f.env.GITHUB_SERVER_URL = "https://example.invalid";
    if (scenario === "origin")
      f.git(
        "remote",
        "set-url",
        "origin",
        `https://user:${fixtureToken}@github.com/${repository}`,
      );
    if (scenario === "head") change.expectedHead = "a".repeat(40);
    if (scenario === "main")
      f.setGh((args) => ({
        status: 0,
        stdout:
          args[0] === "auth"
            ? fixtureToken
            : JSON.stringify({ sha: "b".repeat(40) }),
        stderr: "",
      }));
    if (scenario === "dirty") writeFileSync(join(f.root, "tracked"), "changed");
    assert.throws(
      () => f.run(change),
      (error) =>
        /^AUTH_EXEC_[A-Z_]+$/u.test(error.message) &&
        !error.message.includes(fixtureToken),
    );
    assert.equal(
      f.calls.some((c) => c.program === process.execPath),
      false,
    );
  }
});

test("API failure, malformed response and thrown diagnostics never expose credential", (t) => {
  for (const scenario of ["status", "json", "throw"]) {
    const f = fixture(t);
    f.env.GITHUB_TOKEN = fixtureToken;
    f.setGh(() => {
      if (scenario === "throw") throw new Error(fixtureToken);
      return {
        status: scenario === "status" ? 1 : 0,
        stdout: fixtureToken,
        stderr: fixtureToken,
      };
    });
    assert.throws(
      () => f.run(),
      (error) =>
        /^AUTH_EXEC_/u.test(error.message) &&
        !error.message.includes(fixtureToken),
    );
    assert.equal(
      f.calls.some((c) => c.program === process.execPath),
      false,
    );
  }
});

test("identity is checked again after network preflight", (t) => {
  for (const scenario of ["dirty", "head", "origin"]) {
    const f = fixture(t);
    f.env.GITHUB_TOKEN = fixtureToken;
    f.setGh(() => {
      if (scenario === "origin")
        f.git(
          "remote",
          "set-url",
          "origin",
          "https://github.com/other/repo.git",
        );
      else writeFileSync(join(f.root, "tracked"), "changed");
      if (scenario === "head") {
        f.git("add", "tracked");
        f.git("commit", "--quiet", "-m", "race");
      }
      return { status: 0, stdout: JSON.stringify({ sha: f.head }), stderr: "" };
    });
    assert.throws(
      () => f.run(),
      /AUTH_EXEC_(WORKTREE_DIRTY|HEAD_MISMATCH|ORIGIN_MISMATCH)/,
    );
    assert.equal(
      f.calls.some((c) => c.program === process.execPath),
      false,
    );
  }
});

test("runtime identity check blocks a change after parent preflight", (t) => {
  for (const change of ["dirty", "origin"]) {
    const f = fixture(t);
    const spawn = (program, args, opts) => {
      if (program === process.execPath) {
        if (change === "dirty") writeFileSync(join(f.root, "race"), "changed");
        else
          f.git(
            "remote",
            "set-url",
            "origin",
            "https://github.com/other/repo.git",
          );
      }
      return f.spawn(program, args, opts);
    };
    const r = f.run({}, { spawn });
    assert.equal(r.exitCode, 125);
    assert.equal(r.stdout, "");
    assert.match(r.stderr, /AUTH_EXEC_RUNTIME_FAILED/);
  }
});

test("timeout forcibly terminates the owned command group even when SIGTERM is ignored", (t) => {
  const f = fixture(t);
  const evidence = mkdtempSync(join(tmpdir(), "auth-exec-pids-"));
  const file = join(evidence, "pids.json");
  t.after(() => {
    try {
      for (const pid of JSON.parse(readFileSync(file, "utf8"))) {
        try {
          process.kill(pid, "SIGKILL");
        } catch {}
      }
    } catch {}
    rmSync(evidence, { recursive: true, force: true });
  });
  const code = `const {spawn}=require('node:child_process');const fs=require('node:fs');const worker=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],{stdio:'ignore'});fs.writeFileSync(process.argv[1],JSON.stringify([process.pid,worker.pid]));process.on('SIGTERM',()=>{});setInterval(()=>{},1000);`;
  const started = Date.now();
  const result = f.run({ timeoutMs: 3000, args: ["-e", code, file] });
  assert.equal(result.exitCode, 125);
  assert.equal(result.stdout, "");
  assert.ok(
    Date.now() - started < 15000,
    "authenticated command timeout must be bounded",
  );
  const pids = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(pids.length, 2);
  for (const pid of pids) {
    try {
      const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
      assert.ok(
        ["Z", "X"].includes(
          stat.slice(stat.lastIndexOf(")") + 2).split(" ")[0],
        ),
        "owned process must not survive",
      );
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
});

test("command timeout and signal cannot become success or leak partial output", (t) => {
  const f = fixture(t);
  const timeout = f.run({
    timeoutMs: 50,
    args: [
      "-e",
      "process.stdout.write(process.env.GH_TOKEN);setInterval(()=>{},1000)",
    ],
  });
  assert.equal(timeout.exitCode, 125);
  assert.equal(timeout.stdout, "");
  const signal = f.run({ args: ["-e", "process.kill(process.pid,'SIGTERM')"] });
  assert.equal(signal.exitCode, 125);
  for (const result of [
    { status: null, signal: "SIGTERM" },
    { status: null, error: new Error(fixtureToken) },
  ]) {
    const spawn = (program, args, opts) =>
      program === process.execPath ? result : f.spawn(program, args, opts);
    assert.throws(
      () => f.run({}, { spawn }),
      /^Error: AUTH_EXEC_PROCESS_FAILED$/u,
    );
  }
});

test("credentials in command arguments and oversized private payload are rejected", (t) => {
  const f = fixture(t);
  assert.throws(
    () => f.run({ args: [fixtureToken] }),
    /AUTH_EXEC_CREDENTIAL_IN_ARGUMENTS/,
  );
  assert.throws(
    () => f.run({ args: ["x".repeat(65536)] }),
    /AUTH_EXEC_INPUT_TOO_LARGE/,
  );
  assert.equal(
    f.calls.some((c) => c.program === process.execPath),
    false,
  );
});

test("runtime refuses an exhausted shared deadline before authenticated command dispatch", (t) => {
  const f = fixture(t);
  const spawn = (program, args, opts) => {
    if (program === process.execPath) {
      const payload = JSON.parse(opts.input);
      assert.ok(opts.timeout >= payload.timeoutMs + 4 * 30000 + 5000);
      payload.deadlineAt = Date.now() - 1;
      return f.spawn(program, args, {
        ...opts,
        input: JSON.stringify(payload),
      });
    }
    return f.spawn(program, args, opts);
  };
  const result = f.run({}, { spawn });
  assert.equal(result.exitCode, 125);
  assert.equal(result.stdout, "");
});

test("CLI reports safe failure for invalid auth-exec", () => {
  const cli = new URL("./morro-workspace.mjs", import.meta.url);
  const r = spawnSync(
    process.execPath,
    [
      cli.pathname,
      "auth-exec",
      "other",
      "/",
      repository,
      "a".repeat(40),
      "a".repeat(40),
      "--",
      "node",
    ],
    { encoding: "utf8" },
  );
  assert.equal(r.status, 1);
  assert.equal(r.stderr.trim(), "AUTH_EXEC_RUNTIME_INVALID");
  assert.equal(r.stdout, "");
});

test("CLI preserves the executed command exit status and redacts its output", (t) => {
  const f = fixture(t);
  const bin = mkdtempSync(join(tmpdir(), "auth-exec-cli-"));
  t.after(() => rmSync(bin, { recursive: true, force: true }));
  const gh = join(bin, "gh");
  writeFileSync(
    gh,
    `#!${process.execPath}\nconsole.log(JSON.stringify({sha:process.env.AUTH_TEST_MAIN}));\n`,
  );
  chmodSync(gh, 0o700);
  const cli = new URL("./morro-workspace.mjs", import.meta.url);
  const r = spawnSync(
    process.execPath,
    [
      cli.pathname,
      "auth-exec",
      "native",
      f.root,
      repository,
      f.head,
      f.head,
      "--",
      process.execPath,
      "-e",
      "process.stdout.write(process.env.GH_TOKEN);process.exitCode=17",
    ],
    {
      env: {
        ...f.env,
        PATH: bin + ":" + f.env.PATH,
        GITHUB_TOKEN: fixtureToken,
        AUTH_TEST_MAIN: f.head,
      },
      encoding: "utf8",
    },
  );
  assert.equal(r.status, 17);
  assert.equal(r.stderr, "");
  const result = JSON.parse(r.stdout);
  assert.equal(result.exitCode, 17);
  assert.equal(result.stdout, "[REDACTED]");
  assert.equal(r.stdout.includes(fixtureToken), false);
});
