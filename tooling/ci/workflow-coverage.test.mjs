import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { load } from "js-yaml";
import {
  buildQualityProof,
  suiteManifest,
  verifyQualityProof,
} from "./suite-scheduler.mjs";
import {
  buildReceipt,
  digest,
  executionPlan,
  loadCoverage,
  readReceipts,
  sourceIdentity,
  validateCoverage,
  verifyExecutionProof,
  verifyReceipts,
} from "./workflow-coverage.mjs";

const context = loadCoverage();
const all = suiteManifest.suites.map((suite) => suite.workflow);
const identity = {
  sourceSha: "a".repeat(40),
  treeSha: "b".repeat(40),
  lockfileDigest: "sha256:" + "c".repeat(64),
  repository: "morro/ci-fixture",
  runId: "123",
  runAttempt: 1,
};
const needsFor = (selected) =>
  Object.fromEntries([
    ["impact", { result: "success" }],
    ["core-quality", { result: "success" }],
    ...suiteManifest.suites.map(({ workflow, jobId }) => [
      jobId,
      { result: selected.includes(workflow) ? "success" : "skipped" },
    ]),
  ]);
const stepsFor = (workflow) =>
  Object.fromEntries(
    context.coverage.workflows[workflow].commands
      .filter((command) => command.required)
      .map(({ id }) => [id, { outcome: "success", conclusion: "success" }]),
  );
const planFor = (selected = all, overrides = {}) =>
  executionPlan(selected, { ...identity, ...overrides }, context);
const receiptsFor = (plan) =>
  plan.selected.map((workflow) =>
    buildReceipt(workflow, plan, stepsFor(workflow), context),
  );
const resign = (receipt) => {
  const { receiptDigest: _digest, ...body } = receipt;
  return { ...body, receiptDigest: digest(body) };
};

test("impact artifacts remain distinct across attempts of the same run", () => {
  const workflow = load(
    readFileSync(".github/workflows/ci-impact.yml", "utf8"),
  );
  const upload = workflow.jobs.impact.steps.find(
    (step) => step.name === "Upload impact evidence",
  );
  const artifact = (attempt) =>
    upload.with.name
      .replaceAll("${{ github.run_id }}", "123")
      .replaceAll("${{ github.run_attempt }}", String(attempt));
  assert.notEqual(artifact(1), artifact(2));
});

test("the reviewed foundation preserves seven workflows and all 37 original run bodies", () => {
  assert.deepEqual(
    validateCoverage(context.registry, context.coverage, context.workflows),
    { workflows: 7, result: "PASS" },
  );
  const commands = Object.values(context.coverage.workflows).flatMap(
    (item) => item.commands,
  );
  assert.equal(commands.length, 37);
  assert.equal(commands.filter((item) => item.required).length, 32);
  assert.equal(commands.filter((item) => item.semantic).length, 19);
  assert.equal(context.coverage.selector, "tooling/ci/scheduled-suites.json");
});

for (const [label, mutate] of [
  [
    "command body",
    (doc, job) => {
      job.steps.find((step) => step.run).run = "echo bypass";
    },
  ],
  [
    "runner",
    (doc, job) => {
      job["runs-on"] = "unreviewed-runner";
    },
  ],
  [
    "service",
    (doc, job) => {
      job.services.mysql.image = "mysql:wrong";
    },
  ],
  [
    "event",
    (doc) => {
      doc.on.push = {};
    },
  ],
  [
    "job condition",
    (doc, job) => {
      job.if = "false";
    },
  ],
  [
    "step condition",
    (doc, job) => {
      job.steps.find((step) => step.run).if = "false";
    },
  ],
  [
    "continue-on-error",
    (doc, job) => {
      job.steps.find((step) => step.run)["continue-on-error"] = true;
    },
  ],
  [
    "job continue-on-error",
    (doc, job) => {
      job["continue-on-error"] = true;
    },
  ],
  [
    "receipt command",
    (doc, job) => {
      job.steps.at(-2).run = "echo PASS";
    },
  ],
  [
    "receipt upload condition",
    (doc, job) => {
      job.steps.at(-1).if = "always()";
    },
  ],
  [
    "artifact attempt",
    (doc, job) => {
      job.steps.at(-1).with.name = "reusable";
    },
  ],
  [
    "extra job",
    (doc) => {
      doc.jobs.bypass = {};
    },
  ],
]) {
  test("coverage rejects changed " + label, () => {
    const workflows = structuredClone(context.workflows);
    const doc = workflows[all[0]];
    mutate(doc, Object.values(doc.jobs)[0]);
    assert.throws(
      () => validateCoverage(context.registry, context.coverage, workflows),
      /CI_EXECUTION_UNPROVEN/,
    );
  });
}

test("coverage cannot silently enroll another workflow or demote required assertions", () => {
  const registry = structuredClone(context.registry);
  registry.suites.push({ workflow: "unmigrated.yml", jobId: "new-job" });
  assert.throws(() =>
    validateCoverage(registry, context.coverage, context.workflows),
  );
  for (const mutate of [
    (coverage) => {
      delete coverage.workflows[all[0]];
    },
    (coverage) => {
      coverage.workflows[all[0]].commands[0].required = false;
    },
    (coverage) => {
      coverage.workflows[all[0]].commands.forEach((cmd) => {
        cmd.semantic = false;
      });
    },
    (coverage) => {
      coverage.workflows[all[0]].commands.at(-1).semantic = true;
    },
  ]) {
    const coverage = structuredClone(context.coverage);
    mutate(coverage);
    assert.throws(() =>
      validateCoverage(context.registry, coverage, context.workflows),
    );
  }
});

test("Quality passes the exact scheduler selection and downloads isolated attempt artifacts", () => {
  const quality = load(readFileSync(".github/workflows/quality.yml", "utf8"));
  assert.deepEqual(
    Object.keys(quality.jobs).sort(),
    [
      "impact",
      "core-quality",
      "quality",
      ...suiteManifest.suites.map((suite) => suite.jobId),
    ].sort(),
  );
  for (const { workflow, jobId } of suiteManifest.suites) {
    assert.equal(quality.jobs[jobId].uses, "./.github/workflows/" + workflow);
    assert.deepEqual(quality.jobs[jobId].with, {
      ci_selected_suites: "${{ needs.impact.outputs.scheduled_suites }}",
    });
    assert.ok(quality.jobs.quality.needs.includes(jobId));
  }
  const steps = quality.jobs.quality.steps;
  const download = steps.find((step) =>
    step.uses?.startsWith("actions/download-artifact@"),
  );
  assert.equal(download.with.pattern, "ci-suite-*-${{ github.run_id }}-*");
  assert.equal(download.with["merge-multiple"], false);
  assert.equal(
    steps.at(-1).with.name,
    "ci-quality-${{ github.run_id }}-${{ github.run_attempt }}",
  );
  assert.ok(
    steps.some(
      (step) => step.run === "node tooling/ci/suite-scheduler.mjs --verify",
    ),
  );
});

test("all selected suites require actual commands and semantic assertions", () => {
  const plan = planFor();
  const receipts = receiptsFor(plan);
  assert.equal(
    verifyReceipts(plan, receipts, needsFor(all), context).result,
    "PASS",
  );
  for (const workflow of all) {
    const contract = context.coverage.workflows[workflow];
    for (const command of contract.commands.filter((item) => item.required)) {
      for (const result of [undefined, "skipped", "failure", "cancelled"]) {
        const steps = stepsFor(workflow);
        if (result === undefined) delete steps[command.id];
        else steps[command.id] = { outcome: result, conclusion: "success" };
        assert.throws(
          () => buildReceipt(workflow, plan, steps, context),
          /command did not execute successfully/,
          workflow + ":" + command.id + ":" + result,
        );
      }
      const steps = stepsFor(workflow);
      steps[command.id].conclusion = "failure";
      assert.throws(() => buildReceipt(workflow, plan, steps, context));
    }
  }
  assert.equal(
    receipts.reduce(
      (sum, receipt) => sum + receipt.semanticAssertions.length,
      0,
    ),
    19,
  );
  assert.ok(
    receipts.every(
      (receipt) => receipt.authority === "execution-evidence-only",
    ),
  );
});

test("diagnostics and cleanup never supply behavioral assertions", () => {
  for (const workflow of all) {
    const plan = planFor([workflow]);
    const steps = stepsFor(workflow);
    for (const command of context.coverage.workflows[workflow].commands.filter(
      (item) => !item.required,
    ))
      steps[command.id] = { outcome: "skipped", conclusion: "skipped" };
    assert.equal(buildReceipt(workflow, plan, steps, context).result, "PASS");
    assert.throws(() => buildReceipt(workflow, plan, {}, context));
  }
});

for (const [field, value] of [
  ["sourceSha", "d".repeat(40)],
  ["treeSha", "d".repeat(40)],
  ["lockfileDigest", "sha256:" + "d".repeat(64)],
  ["repository", "other/repository"],
  ["runId", "999"],
  ["registryDigest", "sha256:" + "d".repeat(64)],
  ["coverageDigest", "sha256:" + "d".repeat(64)],
  ["executionDigest", "sha256:" + "d".repeat(64)],
  ["planDigest", "sha256:" + "d".repeat(64)],
  ["jobId", "forged-job"],
  ["authority", "production-authorized"],
  ["result", "SKIPPED"],
]) {
  test("even a recomputed content digest cannot substitute " + field, () => {
    const plan = planFor([all[0]]);
    const receipt = receiptsFor(plan)[0];
    assert.throws(
      () =>
        verifyReceipts(
          plan,
          [resign({ ...receipt, [field]: value })],
          needsFor(plan.selected),
          context,
        ),
      /identity mismatch/,
    );
  });
}

test("missing, duplicate, surplus, future and incomplete receipts fail closed", () => {
  const plan = planFor();
  const receipts = receiptsFor(plan);
  for (const candidate of [
    null,
    [],
    receipts.slice(1),
    [...receipts, receipts[0]],
    [...receipts.slice(1), resign({ ...receipts[0], runAttempt: 2 })],
    [...receipts.slice(1), resign({ ...receipts[0], semanticAssertions: [] })],
    [
      ...receipts.slice(1),
      resign({ ...receipts[0], commands: receipts[0].commands.slice(1) }),
    ],
    [
      ...receipts.slice(1),
      resign({
        ...receipts[0],
        commands: [...receipts[0].commands, receipts[0].commands[0]],
      }),
    ],
  ])
    assert.throws(() =>
      verifyReceipts(plan, candidate, needsFor(all), context),
    );
  assert.throws(() =>
    verifyReceipts(planFor([all[0]]), receipts, needsFor([all[0]]), context),
  );
  assert.throws(() =>
    verifyReceipts(
      plan,
      receipts.map((receipt) => ({ ...receipt, receiptDigest: "forged" })),
      needsFor(all),
      context,
    ),
  );
});

test("partial reruns reuse only matching source and plan with current successful needs", () => {
  const original = planFor();
  const old = receiptsFor(original);
  const current = planFor(all, { runAttempt: 2 });
  assert.equal(original.planDigest, current.planDigest);
  const newer = buildReceipt(all[0], current, stepsFor(all[0]), context);
  const proof = verifyReceipts(
    current,
    [...old, newer],
    needsFor(all),
    context,
  );
  assert.equal(proof.receipts[0].runAttempt, 2);
  assert.equal(proof.receipts[1].runAttempt, 1);
  for (const field of ["sourceSha", "treeSha", "runId", "repository"])
    assert.throws(() =>
      verifyReceipts(
        planFor(all, {
          runAttempt: 2,
          [field]: field.endsWith("Sha")
            ? "e".repeat(40)
            : field === "repository"
              ? "other/repo"
              : "124",
        }),
        old,
        needsFor(all),
        context,
      ),
    );
  for (const { jobId } of suiteManifest.suites) {
    for (const result of ["failure", "cancelled", "skipped", undefined]) {
      const needs = needsFor(all);
      needs[jobId].result = result;
      assert.throws(
        () => verifyReceipts(current, old, needs, context),
        /expected success/,
      );
    }
  }
  for (const id of ["impact", "core-quality"]) {
    const needs = needsFor(all);
    needs[id].result = "failure";
    assert.throws(
      () => verifyReceipts(current, old, needs, context),
      /did not succeed/,
    );
  }
});

test("source, run and selection identities are mandatory and cannot be approximated", () => {
  for (const [field, value] of [
    ["sourceSha", "main"],
    ["treeSha", ""],
    ["lockfileDigest", "short"],
    ["repository", ""],
    ["runId", "0"],
    ["runId", 1],
    ["runAttempt", 0],
    ["runAttempt", 1.5],
    ["runAttempt", "1"],
  ])
    assert.throws(() => planFor(all, { [field]: value }), /identity/);
  for (const selected of [null, ["unknown.yml"], [all[0], all[0]]])
    assert.throws(() => planFor(selected), /selected suite set/);
  const empty = planFor([]);
  assert.equal(verifyReceipts(empty, [], needsFor([]), context).result, "PASS");
  assert.throws(() =>
    verifyReceipts(empty, receiptsFor(planFor()), needsFor([]), context),
  );
});

test("Quality cannot pass from needs success without source-bound execution receipts", () => {
  const plan = planFor();
  const needs = needsFor(all);
  const executionProof = verifyReceipts(
    plan,
    receiptsFor(plan),
    needs,
    context,
  );
  const options = { ...identity, executionProof };
  const proof = buildQualityProof(all, needs, identity.sourceSha, options);
  assert.equal(verifyQualityProof(proof).result, "PASS");
  assert.throws(
    () => buildQualityProof(all, needs, identity.sourceSha, identity),
    /execution proof/,
  );
  assert.throws(
    () => buildQualityProof(all, needs, "e".repeat(40), options),
    /source identity/,
  );
  assert.throws(
    () => verifyExecutionProof(executionProof, [], needs, context),
    /selected set/,
  );
  const changed = structuredClone(executionProof);
  changed.receipts[0].semanticAssertions = [];
  assert.throws(() => verifyExecutionProof(changed, all, needs, context));
});

test("CLI receipt and Quality readback bind a real checkout and reject missing execution", () => {
  const root = mkdtempSync(join(tmpdir(), "ci-source-proof-"));
  const git = (...args) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  try {
    git("init", "-q");
    for (const path of [
      "pnpm-lock.yaml",
      "tooling/ci/scheduled-suites.json",
      "tooling/ci/workflow-coverage.json",
      ...all.map((name) => ".github/workflows/" + name),
    ]) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), readFileSync(path));
    }
    git("add", ".");
    git(
      "-c",
      "user.name=CI Fixture",
      "-c",
      "user.email=ci@example.invalid",
      "commit",
      "-qm",
      "fixture",
    );
    const env = {
      ...process.env,
      GITHUB_SHA: git("rev-parse", "HEAD"),
      GITHUB_REPOSITORY: identity.repository,
      GITHUB_RUN_ID: "123",
      GITHUB_RUN_ATTEMPT: "2",
      CI_SELECTED_SUITES: JSON.stringify([all[0]]),
      CI_STEP_RESULTS: JSON.stringify(stepsFor(all[0])),
      CI_JOB_RESULTS: JSON.stringify(needsFor([all[0]])),
      CI_RECEIPTS_DIR: "receipts",
    };
    const observed = sourceIdentity(root, env);
    assert.equal(observed.sourceSha, env.GITHUB_SHA);
    assert.equal(observed.treeSha, git("rev-parse", "HEAD^{tree}"));
    assert.equal(observed.runAttempt, 2);
    assert.throws(
      () => sourceIdentity(root, { ...env, GITHUB_SHA: "f".repeat(40) }),
      /checkout/,
    );
    const run = (script, ...args) =>
      spawnSync(
        process.execPath,
        [join(process.cwd(), "tooling/ci", script), ...args],
        { cwd: root, env, encoding: "utf8" },
      );
    const recorded = run("workflow-coverage.mjs", "--receipt", all[0]);
    assert.equal(recorded.status, 0, recorded.stderr);
    assert.deepEqual(readReceipts(join(root, "missing")), []);
    const directory = join(root, "receipts", "suite-attempt-2");
    mkdirSync(directory, { recursive: true });
    const receipt = JSON.parse(
      readFileSync(join(root, "ci-suite-receipt.json"), "utf8"),
    );
    writeFileSync(
      join(directory, "ci-suite-receipt.json"),
      JSON.stringify(receipt),
    );
    assert.deepEqual(readReceipts(join(root, "receipts")), [receipt]);
    const aggregate = run("suite-scheduler.mjs", "--verify");
    assert.equal(aggregate.status, 0, aggregate.stderr);
    const proof = JSON.parse(
      readFileSync(join(root, "ci-quality-proof.json"), "utf8"),
    );
    assert.equal(proof.sourceSha, observed.sourceSha);
    assert.equal(
      proof.executionProof.receipts[0].receiptDigest,
      receipt.receiptDigest,
    );
    env.CI_STEP_RESULTS = "{}";
    assert.notEqual(
      run("workflow-coverage.mjs", "--receipt", all[0]).status,
      0,
    );
    rmSync(directory, { recursive: true });
    assert.notEqual(run("suite-scheduler.mjs", "--verify").status, 0);
    writeFileSync(join(root, "pnpm-lock.yaml"), "modified\n");
    assert.throws(() => sourceIdentity(root, env));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("impact selection remains runnable with no installed YAML dependency", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      "import Module from 'node:module'; const original = Module._load; Module._load = function(name, ...args) { if (name === 'js-yaml') throw new Error('YAML dependency unavailable'); return original.call(this, name, ...args); }; const { selectSuites } = await import('./tooling/ci/suite-scheduler.mjs'); console.log(selectSuites(null).length);",
    ],
    { encoding: "utf8", cwd: process.cwd() },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "7");
});
