import assert from "node:assert/strict";
import {
  readFileSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  chmodSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import test from "node:test";
import { analyzeFiles } from "./impact-analyzer.mjs";
import { buildAffectedTurboArgs } from "./affected-quality.mjs";
import {
  assertOwnershipCoverage,
  chooseCanonicalBase,
  fastGatePlan,
  nonRuntimeTests,
  requestedAffectedTaskKinds,
  runAffectedProof,
  validateAffectedTaskGraph,
  workspaceCommand,
  executeWorkspaceCommand,
} from "./local-fast-gate.mjs";

const BASE = "a".repeat(40);

const affectedArgs = buildAffectedTurboArgs(BASE);
const requestedKinds = ["lint", "typecheck", "test", "build"];
function taskGraph(kinds = requestedKinds) {
  return {
    version: "1",
    turboVersion: "2.10.8",
    packages: ["@touristic/core"],
    tasks: kinds.map((task) => ({
      taskId: `@touristic/core#${task}`,
      task,
      package: "@touristic/core",
      command: "node -e 'process.exit(0)'",
      directory: "packages/core",
    })),
  };
}

test("affected proof derives requested kinds from unchanged canonical argv", () => {
  assert.deepEqual(requestedAffectedTaskKinds(affectedArgs), requestedKinds);
  const custom = buildAffectedTurboArgs(BASE, ["lint", "test"]);
  assert.deepEqual(requestedAffectedTaskKinds(custom), ["lint", "test"]);
  assert.equal(
    validateAffectedTaskGraph(
      JSON.stringify(taskGraph(["lint", "test"])),
      custom,
    ).taskCount,
    2,
  );
  for (const args of [
    [],
    ["turbo", "run", "build"],
    ["exec", "turbo", "run", "--filter=x"],
    ["exec", "turbo", "run", "test", "test"],
  ])
    assert.throws(
      () => requestedAffectedTaskKinds(args),
      /FAST_GATE_AFFECTED_/,
    );
});

test("real empty accounting dry graph rejects despite exit-zero package selection", () => {
  const graph = {
    version: "1",
    turboVersion: "2.10.8",
    packages: ["//"],
    tasks: [],
  };
  assert.throws(
    () => validateAffectedTaskGraph(JSON.stringify(graph), affectedArgs),
    /FAST_GATE_AFFECTED_GRAPH_EMPTY/,
  );
});

for (const missing of requestedKinds) {
  test(`affected graph cannot omit requested ${missing} even with extra dependency kinds`, () => {
    const graph = taskGraph([
      ...requestedKinds.filter((kind) => kind !== missing),
      "prepare",
    ]);
    assert.throws(
      () => validateAffectedTaskGraph(JSON.stringify(graph), affectedArgs),
      /FAST_GATE_AFFECTED_KIND_UNCOVERED/,
    );
  });
}

test("only-build graph is not complete affected proof", () => {
  assert.throws(
    () =>
      validateAffectedTaskGraph(
        JSON.stringify(taskGraph(["build"])),
        affectedArgs,
      ),
    /FAST_GATE_AFFECTED_KIND_UNCOVERED/,
  );
});

test("requested kinds can be distributed across packages without requiring each kind per package", () => {
  const graph = taskGraph();
  graph.packages = graph.tasks.map((task, i) => {
    task.package = `@touristic/package-${i}`;
    task.taskId = `${task.package}#${task.task}`;
    return task.package;
  });
  const summary = validateAffectedTaskGraph(
    JSON.stringify(graph),
    affectedArgs,
  );
  assert.deepEqual(summary.requestedTaskKinds, requestedKinds);
  assert.equal(summary.taskCount, 4);
  assert.equal(summary.turboVersion, "2.10.8");
  assert.equal("environmentVariables" in summary, false);
});

for (const [name, mutate] of [
  [
    "unsupported numeric schema",
    (graph) => {
      graph.version = 1;
    },
  ],
  [
    "absent schema",
    (graph) => {
      delete graph.version;
    },
  ],
  [
    "absent Turbo identity",
    (graph) => {
      delete graph.turboVersion;
    },
  ],
  [
    "non-array tasks",
    (graph) => {
      graph.tasks = {};
    },
  ],
  [
    "missing tasks",
    (graph) => {
      delete graph.tasks;
    },
  ],
  [
    "null task",
    (graph) => {
      graph.tasks[0] = null;
    },
  ],
  [
    "duplicate task identity",
    (graph) => {
      graph.tasks.push({ ...graph.tasks[0] });
    },
  ],
  [
    "inconsistent task identity",
    (graph) => {
      graph.tasks[0].taskId = "@touristic/other#lint";
    },
  ],
  [
    "absent command",
    (graph) => {
      delete graph.tasks[0].command;
    },
  ],
  [
    "whitespace command",
    (graph) => {
      graph.tasks[0].command = " \n ";
    },
  ],
  [
    "non-executable placeholder",
    (graph) => {
      graph.tasks[0].command = "<NONEXISTENT>";
    },
  ],
]) {
  test(`affected graph rejects ${name}`, () => {
    const graph = taskGraph();
    mutate(graph);
    assert.throws(
      () => validateAffectedTaskGraph(JSON.stringify(graph), affectedArgs),
      /FAST_GATE_AFFECTED_/,
    );
  });
}

test("affected graph rejects malformed JSON rather than parsing stdout banners", () => {
  for (const output of ["", "Turbo banner\n{}", "null", "[]"])
    assert.throws(
      () => validateAffectedTaskGraph(output, affectedArgs),
      /FAST_GATE_AFFECTED_/,
    );
});

function affectedHarness(
  output = JSON.stringify(taskGraph()),
  fail = null,
  runtime = "native",
) {
  const calls = [];
  const plan = { mode: "AFFECTED", affectedQualityArgs: affectedArgs };
  const adapters = {
    testsForDomains: () => ["tooling/ci/local-fast-gate.test.mjs"],
    run(command, args, selectedRuntime, options) {
      const phase =
        command === process.execPath
          ? "root"
          : options?.capture
            ? "dry"
            : "workspace";
      calls.push({
        phase,
        command,
        args: [...args],
        runtime: selectedRuntime,
        options,
      });
      if (phase === fail) throw new Error(`FAILED_${phase}`);
      if (phase === "dry") return output;
    },
  };
  return {
    calls,
    run: () =>
      runAffectedProof(
        plan,
        ["ci-tooling", "performance-assets"],
        runtime,
        adapters,
      ),
  };
}

test("AFFECTED mixed proof runs selected root tests before same-runtime dry and unchanged workspace argv", () => {
  for (const runtime of ["native", "debian-proot"]) {
    const harness = affectedHarness(undefined, null, runtime);
    const summary = harness.run();
    assert.equal(summary.taskCount, 4);
    assert.deepEqual(
      harness.calls.map((call) => call.phase),
      ["root", "dry", "workspace"],
    );
    assert.deepEqual(harness.calls[0].args, [
      "--test",
      "tooling/ci/local-fast-gate.test.mjs",
    ]);
    assert.deepEqual(harness.calls[1].args, [...affectedArgs, "--dry=json"]);
    assert.deepEqual(harness.calls[2].args, affectedArgs);
    assert.ok(harness.calls.every((call) => call.runtime === runtime));
    assert.deepEqual(harness.calls[1].options, { capture: true });
  }
});

for (const phase of ["root", "dry", "workspace"]) {
  test(`failure in ${phase} cannot produce successful affected proof`, () => {
    const harness = affectedHarness(undefined, phase);
    assert.throws(harness.run, new RegExp(`FAILED_${phase}`));
    assert.equal(harness.calls.at(-1).phase, phase);
  });
}

for (const output of [
  JSON.stringify(taskGraph([])),
  JSON.stringify(taskGraph(["build"])),
  "not-json",
]) {
  test(`invalid dry output stops before workspace: ${output}`, () => {
    const harness = affectedHarness(output);
    assert.throws(harness.run, /FAST_GATE_AFFECTED_/);
    assert.deepEqual(
      harness.calls.map((call) => call.phase),
      ["root", "dry"],
    );
  });
}

test("missing selected root tests cannot be rescued by workspace proof", () => {
  assert.throws(
    () =>
      runAffectedProof(
        { mode: "AFFECTED", affectedQualityArgs: affectedArgs },
        ["ci-tooling"],
        "native",
        {
          testsForDomains: () => [],
          run: () => assert.fail("must not execute"),
        },
      ),
    /FAST_GATE_ROOT_TESTS_MISSING/,
  );
});

test("runtime accounting mixed impact remains AFFECTED and selects actual tracked root CI tests", () => {
  const report = analyzeFiles([
    "tooling/performance/check-morro-digital-budget.mjs",
    "tooling/ci/performance-budget-accounting.test.mjs",
  ]);
  assert.equal(report.nonRuntime, false);
  assert.equal(report.risk, "HIGH");
  assert.equal(fastGatePlan(report, BASE).mode, "AFFECTED");
  assert.ok(
    nonRuntimeTests(report.domains).includes(
      "tooling/ci/local-fast-gate.test.mjs",
    ),
  );
});

test("captured and inherited commands share safe native/fallback invocation mapping", () => {
  assert.deepEqual(
    workspaceCommand("pnpm", affectedArgs, "native", "/path with spaces"),
    { command: "pnpm", args: affectedArgs },
  );
  const mapped = workspaceCommand(
    process.execPath,
    ["--test", "file with spaces.mjs"],
    "debian-proot",
    "/path with spaces",
  );
  assert.equal(mapped.command, "proot-distro");
  assert.deepEqual(mapped.args.slice(-4), [
    "/path with spaces",
    "node",
    "--test",
    "file with spaces.mjs",
  ]);
  assert.equal(mapped.args[5], 'cd "$1"; shift; exec "$@"');
});

test("actual captured process separates JSON stdout from stderr and rejects nonzero status", () => {
  const stdout = executeWorkspaceCommand(
    process.execPath,
    [
      "-e",
      'process.stderr.write("banner\\n");process.stdout.write("{\\"tasks\\":[]}")',
    ],
    "native",
    { capture: true },
  );
  assert.deepEqual(JSON.parse(stdout), { tasks: [] });
  assert.throws(
    () =>
      executeWorkspaceCommand(
        process.execPath,
        ["-e", 'process.stdout.write("{}");process.exit(1)'],
        "native",
        { capture: true },
      ),
    /FAST_GATE_COMMAND_FAILED/,
  );
});

// The entrypoint and its dispatch are real; admission, impact and workspace
// discovery are explicit fixture boundaries, not an authority certification.
test("real --certify CLI rejects zero tasks; reverting its dispatch restores false certification", (t) => {
  const root = mkdtempSync(join(tmpdir(), "fast-gate-cli-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (path, value) => {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(
      target,
      typeof value === "string" ? value : JSON.stringify(value),
    );
  };
  const git = (...args) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  const source = readFileSync(
    new URL("./local-fast-gate.mjs", import.meta.url),
    "utf8",
  );
  put("tooling/ci/local-fast-gate.mjs", source);
  put(
    "tooling/ci/affected-quality.mjs",
    readFileSync(new URL("./affected-quality.mjs", import.meta.url), "utf8"),
  );
  put(
    "tooling/ci/affected-task-proof.mjs",
    readFileSync(new URL("./affected-task-proof.mjs", import.meta.url), "utf8"),
  );
  put(
    "tooling/fabric/ownership-path.mjs",
    "export const matchesOwnershipPath=(path,prefix)=>path.startsWith(prefix);\n",
  );
  put(
    "tooling/fabric/claim-guard.mjs",
    "export const buildClaimGuardProof=()=>({claimId:'FIXTURE'});\n",
  );
  put(
    "tooling/fabric/claim-retirement-proof.mjs",
    "export const removedClaimIds=()=>[]; export const assertCanonicalRetirementTransition=()=>{throw Error('UNEXPECTED_RETIREMENT')}; export const buildClaimRetirementProof=()=>{throw Error('UNEXPECTED_RETIREMENT')};\n",
  );
  put(
    "tooling/workspace/morro-workspace.mjs",
    "export const probeWorkspaceRuntime=()=>({}); export const chooseWorkspaceRuntime=()=>({result:'PASS',runtime:'native',fallbackUsed:false});\n",
  );
  put(
    "tooling/ci/impact-analyzer.mjs",
    `console.log(JSON.stringify({base:process.argv[2],head:process.argv[3],files:["fixture.txt"],domains:["ci-tooling"],risk:"HIGH",qualityProfile:"BUGFIX_FAST",nonRuntime:false}));`,
  );
  put(
    "tooling/ci/fixture.test.mjs",
    "import test from 'node:test'; test('actual selected root test',()=>console.log('ROOT_EXECUTED'));\n",
  );
  put(".github/morro-control/claims.json", {
    claims: { FIXTURE: { branch: "fix/fixture" } },
  });
  put(".github/morro-control/events.ndjson", "");
  put(".morro/changesets/FIXTURE.json", { state: "IMPLEMENTING" });
  put(".morro/ownership.json", {
    domains: [{ pathPrefixes: ["fixture.txt", "tooling/"] }],
  });
  // Only the external pnpm producer is substituted. Node executes the real
  // tracked root test; the gate performs real Git/base/blob/clean checks.
  put(
    "bin/pnpm",
    `#!/bin/sh
case "$*" in
  *--dry=json*) printf '%s' '${JSON.stringify(taskGraph([]))}';;
  'exec turbo run '*) printf 'WORKSPACE_EXECUTED\\n';;
esac
`,
  );
  chmodSync(join(root, "bin/pnpm"), 0o755);
  put("fixture.txt", "base\n");
  git("init", "-q", "-b", "main");
  git("config", "user.email", "fixture@example.test");
  git("config", "user.name", "Fixture");
  git("add", ".");
  git("commit", "-qm", "base");
  const base = git("rev-parse", "HEAD");
  git("remote", "add", "origin", root);
  git("update-ref", "refs/remotes/origin/main", base);
  git("switch", "-qc", "fix/fixture");
  put("fixture.txt", "candidate\n");
  git("add", ".");
  git("commit", "-qm", "candidate");
  const cliEnv = {
    ...process.env,
    PATH: join(root, "bin") + ":" + process.env.PATH,
  };
  // A nested Node test runner must start as a standalone CLI process.
  delete cliEnv.NODE_TEST_CONTEXT;
  const invoke = () =>
    spawnSync(
      process.execPath,
      [
        join(root, "tooling/ci/local-fast-gate.mjs"),
        "--certify",
        "--base",
        base,
      ],
      { cwd: root, encoding: "utf8", timeout: 10000, env: cliEnv },
    );
  const result = invoke();
  assert.ifError(result.error);
  assert.equal(result.status, 2, result.stdout + result.stderr);
  assert.match(result.stdout, /ROOT_EXECUTED/);
  assert.match(result.stderr, /FAST_GATE_AFFECTED_GRAPH_EMPTY/);
  assert.doesNotMatch(
    result.stdout,
    /"mode":\s*"CERTIFIED"|WORKSPACE_EXECUTED/,
  );
  const start = source.indexOf("      const affectedProof = runAffectedProof(");
  const end = source.indexOf("\n    }\n\n    assert.equal(", start);
  assert.ok(
    start >= 0 && end > start,
    "mutation must replace the actual CLI else branch",
  );
  put(
    "tooling/ci/local-fast-gate.mjs",
    source.slice(0, start) +
      '      execute("pnpm", plan.affectedQualityArgs, workspace.runtime);' +
      source.slice(end),
  );
  git("add", ".");
  git("commit", "-qm", "historical dispatch mutation");
  const mutated = invoke();
  assert.ifError(mutated.error);
  assert.equal(mutated.status, 0, mutated.stdout + mutated.stderr);
  assert.match(mutated.stdout, /WORKSPACE_EXECUTED/);
  assert.match(mutated.stdout, /"mode":"CERTIFIED"/);
  assert.doesNotMatch(mutated.stdout, /ROOT_EXECUTED/);
});

for (const directory of [
  undefined,
  null,
  42,
  "/packages/core",
  "../core",
  "packages/../core",
  "./packages/core",
  "packages//core",
  "packages/core/",
  "C:/core",
  "packages\\core",
  "",
]) {
  test(`affected graph rejects noncanonical directory ${JSON.stringify(directory)}`, () => {
    const graph = taskGraph();
    graph.tasks[0].directory = directory;
    assert.throws(
      () => validateAffectedTaskGraph(JSON.stringify(graph), affectedArgs),
      /FAST_GATE_AFFECTED_TASK_DIRECTORY_INVALID/,
    );
  });
}
test("canonical relative POSIX directories can contain spaces", () => {
  const graph = taskGraph();
  graph.tasks[0].directory = "packages/core with spaces";
  assert.equal(
    validateAffectedTaskGraph(JSON.stringify(graph), affectedArgs).taskCount,
    4,
  );
});

test("Turbo workspace-root package uses the empty directory, not an absolute or traversal path", () => {
  const graph = taskGraph();
  for (const task of graph.tasks) {
    task.package = "//";
    task.taskId = `//#${task.task}`;
    task.directory = "";
  }
  assert.equal(
    validateAffectedTaskGraph(JSON.stringify(graph), affectedArgs).taskCount,
    4,
  );
  graph.tasks[0].directory = ".";
  assert.throws(
    () => validateAffectedTaskGraph(JSON.stringify(graph), affectedArgs),
    /FAST_GATE_AFFECTED_TASK_DIRECTORY_INVALID/,
  );
});

test("classification block stops locally without full-everything fallback", () => {
  const report = analyzeFiles(["unexpected/file.ts"]);
  const plan = fastGatePlan(report, BASE);
  assert.equal(plan.mode, "CLASSIFICATION_BLOCK");
  assert.equal(plan.needsBrowser, false);
  assert.equal(plan.needsDatabase, false);
  assert.equal(plan.affectedQualityArgs, null);
});

test("critical known impact uses deep proof", () => {
  const report = analyzeFiles(["services/financial/src/provider.ts"]);
  const plan = fastGatePlan(report, BASE);
  assert.equal(report.qualityProfile, "DEEP_PROOF");
  assert.equal(plan.mode, "DEEP_PROOF");
});

test("proven non-runtime changes avoid runtime quality", () => {
  const report = analyzeFiles(["tooling/mdctl/reconcile.mjs"]);
  const plan = fastGatePlan(report, BASE);
  assert.equal(report.qualityProfile, "NON_RUNTIME");
  assert.equal(plan.mode, "NON_RUNTIME");
  assert.equal(plan.affectedQualityArgs, null);
});

test("runtime fast profiles reuse exact-base Turbo affected quality", () => {
  for (const file of [
    "apps/morro-digital-platform/src/navigation/router.ts",
    "packages/business/src/catalog.ts",
  ]) {
    const report = analyzeFiles([file]);
    const plan = fastGatePlan(report, BASE);
    assert.equal(plan.mode, "AFFECTED", file);
    assert.deepEqual(
      plan.affectedQualityArgs,
      buildAffectedTurboArgs(BASE),
      file,
    );
  }
});

test("fast gate rejects non-exact base identities", () => {
  const report = analyzeFiles([
    "apps/morro-digital-platform/src/navigation/router.ts",
  ]);
  assert.throws(
    () => fastGatePlan(report, "main"),
    /FAST_GATE_BASE_SHA_INVALID/u,
  );
});

test("plan-only mode cannot bypass classification blocking", () => {
  const source = readFileSync("tooling/ci/local-fast-gate.mjs", "utf8");
  const block = source.indexOf('if (plan.mode === "CLASSIFICATION_BLOCK")');
  const planOnly = source.indexOf('if (process.argv.includes("--plan"))');
  assert.ok(block >= 0 && planOnly >= 0 && block < planOnly);
});

test("deletion-only impact remains visible to the Fast Gate", () => {
  const source = readFileSync("tooling/ci/local-fast-gate.mjs", "utf8");
  assert.match(source, /--diff-filter=ACDMRTUXB/u);
});

test("non-runtime control-plane and governance coverage includes canonical test trees", () => {
  const control = nonRuntimeTests(["control-plane"]);
  assert.ok(control.some((file) => file.startsWith("tooling/tdp-max/")));
  assert.ok(
    control.some((file) => file.startsWith("tooling/failure-learning/")),
  );

  const governance = nonRuntimeTests(["governance"]);
  assert.ok(governance.some((file) => file.startsWith("tooling/workspace/")));
});

test("local fast gate has no second workspace dependency graph", () => {
  const source = readFileSync("tooling/ci/local-fast-gate.mjs", "utf8");
  assert.doesNotMatch(source, /affectedPackages/u);
  assert.doesNotMatch(source, /readdirSync/u);
  assert.doesNotMatch(source, /dependencies\.some/u);
  assert.match(source, /impact-analyzer\.mjs/u);
  assert.match(source, /buildAffectedTurboArgs/u);
});

test("prepare includes dirty and untracked candidate paths before commit", () => {
  const source = readFileSync("tooling/ci/local-fast-gate.mjs", "utf8");
  assert.match(source, /workingCandidateFiles/u);
  assert.match(
    source,
    /"diff", "--name-only", "--diff-filter=ACDMRTUXB", "-z", baseSha/u,
  );
  assert.match(source, /"ls-files", "--others", "--exclude-standard", "-z"/u);
  assert.ok(
    source.indexOf("if (prepare)") <
      source.indexOf("analyzeExactHead(baseSha, headSha)"),
  );
});

test("canonical main selection rejects stale-only local refs", () => {
  const live = "b".repeat(40);
  assert.equal(
    chooseCanonicalBase(live, [
      { ref: "refs/remotes/origin/main", sha: "a".repeat(40) },
      { ref: "refs/heads/main", sha: live },
    ]),
    live,
  );
  assert.throws(
    () =>
      chooseCanonicalBase(live, [
        { ref: "refs/remotes/origin/main", sha: "a".repeat(40) },
      ]),
    /FAST_GATE_LOCAL_MAIN_STALE/u,
  );
});

test("admission is distinct, exact-head, claim-aware and pre-proof", () => {
  const source = readFileSync("tooling/ci/local-fast-gate.mjs", "utf8");
  assert.match(source, /--admission/u);
  assert.match(source, /ADMISSION_PASS/u);
  assert.match(source, /buildClaimGuardProof/u);
  assert.match(source, /assertOwnershipCoverage/u);
  assert.doesNotMatch(source, /: "origin\/main"/u);
  assert.ok(
    source.indexOf("validateAdmission(baseSha, headSha, files)") <
      source.indexOf('if (plan.mode === "DEEP_PROOF")'),
  );
});

test("canonical ownership binds Wave 5 paths to geospatial-routing", () => {
  const ownership = JSON.parse(readFileSync(".morro/ownership.json", "utf8"));
  const domain = ownership.domains.find(
    (candidate) => candidate.id === "geospatial-routing",
  );
  assert.ok(domain);
  assert.deepEqual(domain.pathPrefixes, [
    "packages/geospatial/",
    "tooling/geospatial/",
    "apps/morro-digital-platform/src/config/destination.test.ts",
    "docs/adr/0003-geospatial-provider-strategy.md",
  ]);
  assert.deepEqual(
    assertOwnershipCoverage(
      [
        "apps/morro-digital-platform/src/config/destination.test.ts",
        "docs/adr/0003-geospatial-provider-strategy.md",
        "packages/geospatial/src/index.ts",
        "packages/geospatial/src/routing-policy.test.ts",
        "tooling/geospatial/routing-policy-promotion.contract.mjs",
      ],
      { domains: [domain] },
    ),
    { covered: 5 },
  );
});

test("ownership admission fails closed for uncovered paths", () => {
  const ownership = {
    domains: [{ id: "ci", pathPrefixes: ["tooling/ci/", "package.json"] }],
  };
  assert.deepEqual(
    assertOwnershipCoverage(["tooling/ci/x.mjs", "package.json"], ownership),
    { covered: 2 },
  );
  assert.throws(
    () => assertOwnershipCoverage(["tooling/mdctl/x.mjs"], ownership),
    /FAST_GATE_OWNERSHIP_UNCOVERED/u,
  );
});

test("prepare admission and certify modes are explicit and certification is clean", () => {
  const source = readFileSync("tooling/ci/local-fast-gate.mjs", "utf8");
  for (const flag of ["--prepare", "--admission", "--certify"])
    assert.match(source, new RegExp(flag));
  assert.match(source, /FAST_GATE_CERTIFY_DIRTY_AFTER_PROOF/u);
  assert.match(source, /"diff", "--check"/u);
  assert.match(source, /treeSha/u);
});

test("quality starts heavy work only after successful impact classification", () => {
  const workflow = readFileSync(".github/workflows/quality.yml", "utf8");
  assert.match(
    workflow,
    /core-quality:\n\s+needs: impact\n\s+if: needs\.impact\.result == 'success'/u,
  );
  assert.match(workflow, /quality:\n\s+name: quality\n\s+if: always\(\)/u);
});

test("certify uses executable workspace runtime fallback", () => {
  const source = readFileSync("tooling/ci/local-fast-gate.mjs", "utf8");
  assert.match(source, /probeWorkspaceRuntime/u);
  assert.match(source, /chooseWorkspaceRuntime/u);
  assert.match(source, /workspaceFallbackUsed/u);
  assert.match(source, /debian-proot/u);
  assert.match(source, /execute\("pnpm", \["check"\], workspace\.runtime\)/u);
});

for (const [id, file] of [
  [
    "ticketing",
    "apps/morro-digital-platform/tooling/ticketing-api-startup.test.mjs",
  ],
  ["auth", "apps/morro-digital-platform/tooling/admin-api.test.mjs"],
]) {
  test(id + " owns its exact existing app handler regression", () => {
    const ownership = JSON.parse(readFileSync(".morro/ownership.json", "utf8"));
    const domain = ownership.domains.find((item) => item.id === id);
    assert.ok(domain);
    assert.ok(domain.pathPrefixes.includes(file));
    assert.equal(
      ownership.domains.filter((item) => item.pathPrefixes.includes(file))
        .length,
      1,
    );
    assert.deepEqual(assertOwnershipCoverage([file], { domains: [domain] }), {
      covered: 1,
    });
  });
  test(
    id + " handler ownership does not grant neighboring or nested paths",
    () => {
      const ownership = JSON.parse(
        readFileSync(".morro/ownership.json", "utf8"),
      );
      for (const neighbor of [
        file + ".unmapped",
        file + "/nested.mjs",
        file.replace(".test.mjs", ".other.test.mjs"),
      ]) {
        assert.throws(
          () => assertOwnershipCoverage([neighbor], ownership),
          /FAST_GATE_OWNERSHIP_UNCOVERED/u,
        );
      }
    },
  );
}
