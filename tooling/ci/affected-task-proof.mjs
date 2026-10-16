import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";

export function workspaceCommand(command, args, runtime, cwd = process.cwd()) {
  const mappedCommand =
    runtime === "debian-proot" && command === process.execPath
      ? "node"
      : command;
  return runtime === "debian-proot"
    ? {
        command: "proot-distro",
        args: [
          "login",
          "debian",
          "--",
          "bash",
          "-lc",
          'cd "$1"; shift; exec "$@"',
          "_",
          cwd,
          mappedCommand,
          ...args,
        ],
      }
    : { command: mappedCommand, args };
}

function execute(command, args, runtime = "native", { capture = false } = {}) {
  console.log([runtime, command, ...args].join(" "));
  const invocation = workspaceCommand(command, args, runtime);
  const result = spawnSync(invocation.command, invocation.args, {
    stdio: capture ? "pipe" : "inherit",
    encoding: capture ? "utf8" : undefined,
    maxBuffer: capture ? 8 * 1024 * 1024 : undefined,
    timeout: capture ? 30000 : undefined,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("FAST_GATE_COMMAND_FAILED");
  return result.stdout;
}

export { execute as executeWorkspaceCommand };

export function requestedAffectedTaskKinds(args) {
  assert.ok(Array.isArray(args), "FAST_GATE_AFFECTED_ARGS_INVALID");
  assert.deepEqual(
    args.slice(0, 3),
    ["exec", "turbo", "run"],
    "FAST_GATE_AFFECTED_ARGS_INVALID",
  );
  assert.ok(
    args.every((arg) => typeof arg === "string"),
    "FAST_GATE_AFFECTED_ARGS_INVALID",
  );
  const option = args.findIndex(
    (arg, index) => index >= 3 && arg.startsWith("--"),
  );
  const tasks = args.slice(3, option < 0 ? undefined : option);
  assert.ok(
    tasks.length > 0 && tasks.every((task) => /^[a-z][a-z0-9:-]*$/u.test(task)),
    "FAST_GATE_AFFECTED_TASKS_INVALID",
  );
  assert.equal(
    new Set(tasks).size,
    tasks.length,
    "FAST_GATE_AFFECTED_TASKS_INVALID",
  );
  return tasks;
}

export function validateAffectedTaskGraph(stdout, args) {
  const requestedTaskKinds = requestedAffectedTaskKinds(args);
  assert.equal(typeof stdout, "string", "FAST_GATE_AFFECTED_GRAPH_INVALID");
  let graph;
  try {
    graph = JSON.parse(stdout);
  } catch {
    throw new Error("FAST_GATE_AFFECTED_GRAPH_INVALID");
  }
  assert.ok(graph && !Array.isArray(graph), "FAST_GATE_AFFECTED_GRAPH_INVALID");
  assert.equal(
    graph.version,
    "1",
    "FAST_GATE_AFFECTED_GRAPH_SCHEMA_UNSUPPORTED",
  );
  assert.ok(
    typeof graph.turboVersion === "string" && graph.turboVersion.trim(),
    "FAST_GATE_AFFECTED_GRAPH_INVALID",
  );
  assert.ok(Array.isArray(graph.tasks), "FAST_GATE_AFFECTED_GRAPH_INVALID");
  assert.ok(graph.tasks.length > 0, "FAST_GATE_AFFECTED_GRAPH_EMPTY");
  const ids = new Set();
  const covered = new Set();
  for (const task of graph.tasks) {
    assert.ok(
      task && typeof task === "object" && !Array.isArray(task),
      "FAST_GATE_AFFECTED_TASK_INVALID",
    );
    assert.ok(
      typeof task.package === "string" &&
        task.package.trim() &&
        !task.package.includes("#"),
      "FAST_GATE_AFFECTED_TASK_INVALID",
    );
    assert.ok(
      typeof task.task === "string" && /^[a-z][a-z0-9:-]*$/u.test(task.task),
      "FAST_GATE_AFFECTED_TASK_INVALID",
    );
    assert.equal(
      task.taskId,
      `${task.package}#${task.task}`,
      "FAST_GATE_AFFECTED_TASK_ID_INVALID",
    );
    assert.ok(!ids.has(task.taskId), "FAST_GATE_AFFECTED_TASK_DUPLICATE");
    assert.ok(
      typeof task.command === "string" &&
        task.command.trim() &&
        !/^<[^>]*>$/u.test(task.command.trim()),
      "FAST_GATE_AFFECTED_TASK_COMMAND_INVALID",
    );
    // Turbo represents the workspace root package (//) with an empty directory.
    // Other packages must name canonical, relative POSIX directory components.
    assert.ok(
      typeof task.directory === "string" &&
        (task.package === "//"
          ? task.directory === ""
          : task.directory.length > 0 &&
            !/^[A-Za-z]:/u.test(task.directory) &&
            task.directory
              .split("/")
              .every(
                (part) =>
                  part.length > 0 &&
                  part !== "." &&
                  part !== ".." &&
                  !/[\\\x00-\x1f\x7f]/u.test(part),
              )),
      "FAST_GATE_AFFECTED_TASK_DIRECTORY_INVALID",
    );
    ids.add(task.taskId);
    covered.add(task.task);
  }
  for (const kind of requestedTaskKinds)
    assert.ok(covered.has(kind), `FAST_GATE_AFFECTED_KIND_UNCOVERED:${kind}`);
  return {
    schemaVersion: graph.version,
    turboVersion: graph.turboVersion,
    requestedTaskKinds,
    taskCount: ids.size,
    taskIds: [...ids],
  };
}

export function runAffectedProof(plan, domains, runtime, adapters = {}) {
  assert.equal(plan.mode, "AFFECTED", "FAST_GATE_AFFECTED_PLAN_REQUIRED");
  requestedAffectedTaskKinds(plan.affectedQualityArgs);
  const run = adapters.run ?? execute;
  const tests = (adapters.testsForDomains ?? nonRuntimeTests)(domains);
  if (
    domains.some((domain) =>
      ["ci-tooling", "cicd", "control-plane", "governance"].includes(domain),
    )
  )
    assert.ok(tests.length > 0, "FAST_GATE_ROOT_TESTS_MISSING");
  if (tests.length > 0) run(process.execPath, ["--test", ...tests], runtime);
  const stdout = run(
    "pnpm",
    [...plan.affectedQualityArgs, "--dry=json"],
    runtime,
    { capture: true },
  );
  const summary = validateAffectedTaskGraph(stdout, plan.affectedQualityArgs);
  run("pnpm", plan.affectedQualityArgs, runtime);
  return summary;
}

export function nonRuntimeTests(domains) {
  const patterns = new Set();
  if (
    domains.some((domain) =>
      ["ci-tooling", "cicd", "control-plane"].includes(domain),
    )
  ) {
    patterns.add("tooling/ci/*.test.mjs");
    patterns.add("tooling/control-state/*.test.mjs");
  }
  if (domains.includes("control-plane")) {
    patterns.add("tooling/mdctl/*.test.mjs");
    patterns.add("tooling/tdp-max/*.test.mjs");
    patterns.add("tooling/failure-learning/*.test.mjs");
  }
  if (
    domains.some((domain) => ["governance", "control-plane"].includes(domain))
  ) {
    patterns.add("tooling/fabric/*.test.mjs");
    patterns.add("tooling/workspace/*.test.mjs");
    patterns.add(".github/agents/*.test.mjs");
    patterns.add(".github/hooks/*.test.mjs");
  }
  if (patterns.size === 0) return [];
  const output = execFileSync("git", ["ls-files", "-z", "--", ...patterns], {
    encoding: "utf8",
  });
  return output.split("\0").filter(Boolean);
}
