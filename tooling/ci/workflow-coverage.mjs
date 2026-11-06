import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifySuiteResults } from "./suite-scheduler.mjs";

const require = createRequire(import.meta.url);
const registryPath = "tooling/ci/scheduled-suites.json";
const coveragePath = "tooling/ci/workflow-coverage.json";
const attemptSuffix = "-${{ github.run_id }}-${{ github.run_attempt }}";
const uploadAction =
  "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02";
const fail = (message) => {
  throw new Error("CI_EXECUTION_UNPROVEN:" + message);
};
export const hash = (value) =>
  "sha256:" + createHash("sha256").update(value).digest("hex");
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        )
      : value;
export const digest = (value) => hash(JSON.stringify(canonical(value)));
const equal = (a, b) => digest(a) === digest(b);
const exactSha = (value) => /^[a-f0-9]{40}$/.test(value ?? "");
const exactDigest = (value) => /^sha256:[a-f0-9]{64}$/.test(value ?? "");

export function receiptSteps(workflow) {
  const selection =
    "${{ inputs.ci_selected_suites || '[\"" + workflow + "\"]' }}";
  return [
    {
      name: "Record managed suite execution",
      id: "ci_receipt",
      if:
        "success() && contains(fromJSON(inputs.ci_selected_suites || '[\"" +
        workflow +
        "\"]'), '" +
        workflow +
        "')",
      env: {
        CI_SELECTED_SUITES: selection,
        CI_STEP_RESULTS: "${{ toJSON(steps) }}",
      },
      run: "node tooling/ci/workflow-coverage.mjs --receipt " + workflow,
    },
    {
      name: "Upload managed suite execution",
      id: "ci_receipt_upload",
      if: "success() && steps.ci_receipt.outcome == 'success'",
      uses: uploadAction,
      with: {
        name: "ci-suite-" + workflow.replace(/\.yml$/, "") + attemptSuffix,
        path: "ci-suite-receipt.json",
        "if-no-files-found": "error",
        "retention-days": 30,
      },
    },
  ];
}

export function validateCoverage(registry, coverage, workflows) {
  const expected = registry.suites.map((suite) => suite.workflow).sort();
  if (
    coverage.schemaVersion !== 1 ||
    coverage.selector !== registryPath ||
    new Set(expected).size !== expected.length ||
    !equal(Object.keys(coverage.workflows).sort(), expected) ||
    !equal(Object.keys(workflows).sort(), expected)
  )
    fail("coverage must match the single scheduler registry");
  for (const workflow of expected) {
    const contract = coverage.workflows[workflow];
    const document = structuredClone(workflows[workflow]);
    if (!equal(Object.keys(document.jobs), [contract.jobId]))
      fail(workflow + ": execution job changed");
    const job = document.jobs[contract.jobId];
    if (job["continue-on-error"]) fail(workflow + ": continue-on-error");
    if (
      !equal(document.on.workflow_call?.inputs?.ci_selected_suites, {
        type: "string",
        required: true,
      }) ||
      !equal(job.steps.slice(-2), receiptSteps(workflow))
    )
      fail(workflow + ": receipt wiring changed");
    delete document.on.workflow_call.inputs.ci_selected_suites;
    if (!Object.keys(document.on.workflow_call.inputs).length)
      delete document.on.workflow_call.inputs;
    if (!Object.keys(document.on.workflow_call).length)
      document.on.workflow_call = null;
    job.steps.splice(-2);
    const commands = job.steps.filter((step) => typeof step.run === "string");
    if (
      contract.commands.length !== commands.length ||
      !contract.commands.some((command) => command.semantic)
    )
      fail(workflow + ": missing command or semantic assertion");
    commands.forEach((step, index) => {
      const command = contract.commands[index];
      if (
        step.id !== "ci_command_" + String(index + 1).padStart(2, "0") ||
        command.id !== step.id ||
        command.name !== step.name ||
        typeof command.semantic !== "boolean" ||
        command.required !== (step.if === undefined) ||
        (command.semantic && !command.required) ||
        (command.required && step["continue-on-error"])
      )
        fail(workflow + ": required command contract changed");
      delete step.id;
    });
    for (const step of job.steps.filter((step) => step.uses === uploadAction)) {
      if (!step.with.name.endsWith(attemptSuffix))
        fail(workflow + ": artifact must identify run and attempt");
      step.with.name = step.with.name.slice(0, -attemptSuffix.length);
    }
    if (digest(document) !== contract.preservedExecutionDigest)
      fail(workflow + ": original execution contract changed");
  }
  return { workflows: expected.length, result: "PASS" };
}

export function loadCoverage(root = process.cwd()) {
  // Impact selection stays dependency-free; YAML is needed only for execution proof.
  const { load } = require("js-yaml");
  const read = (path) => readFileSync(join(root, path), "utf8");
  const registry = JSON.parse(read(registryPath));
  const coverage = JSON.parse(read(coveragePath));
  const workflows = Object.fromEntries(
    registry.suites.map(({ workflow }) => [
      workflow,
      load(read(".github/workflows/" + workflow)),
    ]),
  );
  validateCoverage(registry, coverage, workflows);
  return {
    registry,
    coverage,
    workflows,
    registryDigest: hash(read(registryPath)),
    coverageDigest: hash(read(coveragePath)),
    executionDigest: digest(workflows),
  };
}

const identityFields = [
  "sourceSha",
  "treeSha",
  "lockfileDigest",
  "repository",
  "runId",
  "runAttempt",
];
export function executionPlan(selected, identity, context = loadCoverage()) {
  const known = context.registry.suites.map((suite) => suite.workflow);
  if (
    !Array.isArray(selected) ||
    selected.length !== new Set(selected).size ||
    selected.some((suite) => !known.includes(suite))
  )
    fail("invalid selected suite set");
  if (
    !exactSha(identity.sourceSha) ||
    !exactSha(identity.treeSha) ||
    !exactDigest(identity.lockfileDigest) ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(identity.repository ?? "") ||
    !/^[1-9][0-9]*$/.test(identity.runId ?? "") ||
    typeof identity.runId !== "string" ||
    !Number.isSafeInteger(identity.runAttempt) ||
    identity.runAttempt < 1
  )
    fail("invalid source or run identity");
  const plan = {
    ...Object.fromEntries(identityFields.map((key) => [key, identity[key]])),
    registryDigest: context.registryDigest,
    coverageDigest: context.coverageDigest,
    executionDigest: context.executionDigest,
    selected: [...selected].sort(),
  };
  // Rerunning failed jobs preserves the plan, never the current needs result.
  const { runAttempt: _attempt, ...stable } = plan;
  return { ...plan, planDigest: digest(stable) };
}

export function sourceIdentity(root = process.cwd(), env = process.env) {
  const git = (...args) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  const sourceSha = git("rev-parse", "HEAD");
  if (sourceSha !== env.GITHUB_SHA) fail("checkout differs from GITHUB_SHA");
  git("diff", "--quiet", "HEAD", "--");
  return {
    sourceSha,
    treeSha: git("rev-parse", "HEAD^{tree}"),
    lockfileDigest: hash(readFileSync(join(root, "pnpm-lock.yaml"))),
    repository: env.GITHUB_REPOSITORY,
    runId: env.GITHUB_RUN_ID,
    runAttempt: Number(env.GITHUB_RUN_ATTEMPT),
  };
}

export function buildReceipt(workflow, plan, steps, context = loadCoverage()) {
  if (!equal(plan, executionPlan(plan.selected, plan, context)))
    fail("plan identity changed");
  if (!plan.selected.includes(workflow)) fail("receipt for unselected suite");
  const contract = context.coverage.workflows[workflow];
  const sourceSteps = context.workflows[workflow].jobs[contract.jobId].steps;
  const commands = contract.commands
    .filter((command) => command.required)
    .map(({ id }) => {
      if (
        steps?.[id]?.outcome !== "success" ||
        steps?.[id]?.conclusion !== "success"
      )
        fail(workflow + ":" + id + ": command did not execute successfully");
      return {
        id,
        commandDigest: hash(sourceSteps.find((step) => step.id === id).run),
        outcome: steps[id].outcome,
        conclusion: steps[id].conclusion,
      };
    });
  // These assertions identify executed reviewed steps, not individual test counts.
  const semanticAssertions = contract.commands
    .filter((command) => command.semantic)
    .map(({ id, name }) => ({ id, name, result: "PASS" }));
  const body = {
    schemaVersion: 1,
    kind: "managed-suite-execution",
    authority: "execution-evidence-only",
    ...plan,
    workflow,
    jobId: contract.jobId,
    commands,
    semanticAssertions,
    result: "PASS",
  };
  // A content digest binds execution identities; it grants no authorization.
  return { ...body, receiptDigest: digest(body) };
}

export function verifyReceipts(
  plan,
  receipts,
  needs,
  context = loadCoverage(),
) {
  if (!equal(plan, executionPlan(plan.selected, plan, context)))
    fail("plan identity changed");
  verifySuiteResults(plan.selected, needs, context.registry);
  if (!Array.isArray(receipts)) fail("missing execution receipts");
  const latest = new Map();
  const attempts = new Set();
  for (const receipt of receipts) {
    if (
      !receipt ||
      !plan.selected.includes(receipt.workflow) ||
      !Number.isSafeInteger(receipt.runAttempt) ||
      receipt.runAttempt < 1 ||
      receipt.runAttempt > plan.runAttempt ||
      !Array.isArray(receipt.commands)
    )
      fail("unexpected receipt identity or future attempt");
    const key = receipt.workflow + ":" + receipt.runAttempt;
    if (attempts.has(key)) fail("duplicate execution receipt");
    attempts.add(key);
    const expected = buildReceipt(
      receipt.workflow,
      { ...plan, runAttempt: receipt.runAttempt },
      Object.fromEntries(
        receipt.commands.map((command) => [command.id, command]),
      ),
      context,
    );
    if (!equal(receipt, expected))
      fail("receipt content or source identity mismatch");
    if ((latest.get(receipt.workflow)?.runAttempt ?? 0) < receipt.runAttempt)
      latest.set(receipt.workflow, receipt);
  }
  if (!equal([...latest.keys()].sort(), plan.selected))
    fail("receipt set differs from selected suite set");
  return {
    plan,
    receipts: plan.selected.map((workflow) => latest.get(workflow)),
    result: "PASS",
  };
}

export function verifyExecutionProof(
  proof,
  selected,
  needs,
  context = loadCoverage(),
) {
  if (!proof || !equal(proof.plan?.selected, [...selected].sort()))
    fail("missing execution proof or selected set mismatch");
  const verified = verifyReceipts(proof.plan, proof.receipts, needs, context);
  if (!equal(proof, verified)) fail("invalid aggregate execution proof");
  return verified;
}

export function readReceipts(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) =>
      JSON.parse(readFileSync(join(entry.parentPath, entry.name), "utf8")),
    );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const context = loadCoverage();
  if (process.argv[2] === "--receipt") {
    const plan = executionPlan(
      JSON.parse(process.env.CI_SELECTED_SUITES || "null"),
      sourceIdentity(),
      context,
    );
    const receipt = buildReceipt(
      process.argv[3],
      plan,
      JSON.parse(process.env.CI_STEP_RESULTS || "null"),
      context,
    );
    writeFileSync(
      "ci-suite-receipt.json",
      JSON.stringify(receipt, null, 2) + "\n",
    );
    console.log(
      JSON.stringify({ workflow: receipt.workflow, result: receipt.result }),
    );
  } else if (process.argv[2] === "--check") {
    console.log(
      JSON.stringify(
        validateCoverage(context.registry, context.coverage, context.workflows),
      ),
    );
  } else fail("expected --check or --receipt");
}
