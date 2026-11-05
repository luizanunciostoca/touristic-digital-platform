import assert from "node:assert/strict";
import test from "node:test";
import {
  checkWorkflowConcurrency,
  readWorkflowSources,
  renderMutationGroups,
} from "./check-workflow-concurrency.mjs";

function writer(
  target,
  {
    group = renderMutationGroups[target],
    cancel = false,
    queue = "max",
    extra = "",
  } = {},
) {
  const secret =
    target === "staging"
      ? "RENDER_STAGING_IMAGE_DEPLOY_HOOK_URL"
      : "RENDER_PRODUCTION_SERVICE_ID";
  return `name: Fixture\nconcurrency:\n  group: ${group}\n  cancel-in-progress: ${cancel}\n  queue: ${queue}\njobs:\n  deploy:\n    env:\n      TARGET: \${{ secrets.${secret} }}\n${extra}`;
}

test("actual Render web writers share destination groups and retain pending operations", () => {
  const workflows = readWorkflowSources();
  assert.deepEqual(checkWorkflowConcurrency(workflows), []);
  assert.notEqual(
    renderMutationGroups.staging,
    renderMutationGroups.production,
  );
  assert.match(
    workflows.get("production-oci-promotion.yml"),
    /    concurrency:\n      group: production-mysql-source-mutation\n      cancel-in-progress: false/u,
  );
});

test("previous independent promotion and rollback groups fail despite cancel-in-progress false", () => {
  const workflows = new Map([
    [
      "production-oci-promotion.yml",
      writer("production", { group: "production-oci-promotion" }),
    ],
    [
      "production-render-promotion.yml",
      writer("production", { group: "production-render-promotion" }),
    ],
    [
      "production-render-rollback.yml",
      writer("production", { group: "production-render-rollback" }),
    ],
  ]);
  const failures = checkWorkflowConcurrency(workflows);
  assert.equal(failures.length, 3);
  assert.ok(
    failures.every((message) =>
      message.includes("must share concurrency.group"),
    ),
  );
});

test("source, OCI and rollback use one production group while staging remains independent", () => {
  assert.deepEqual(
    checkWorkflowConcurrency(
      new Map([
        ["production-oci-promotion.yml", writer("production")],
        ["production-render-promotion.yml", writer("production")],
        ["production-render-rollback.yml", writer("production")],
        ["staging-oci-promotion.yml", writer("staging")],
        ["staging-render-promotion.yml", writer("staging")],
      ]),
    ),
    [],
  );
});

for (const suffix of [
  "-${{ github.workflow }}",
  "-${{ inputs.expected_sha }}",
  "-${{ inputs.request_id }}",
]) {
  test(`per-invocation group suffix is refused: ${suffix}`, () => {
    assert.ok(
      checkWorkflowConcurrency(
        new Map([
          [
            "future-deploy.yml",
            writer("production", {
              group: renderMutationGroups.production + suffix,
            }),
          ],
        ]),
      ).some((message) => message.includes("must share concurrency.group")),
    );
  });
}

test("a renamed writer still needs the target lock, queue and non-cancellation", () => {
  for (const override of [
    { group: "uncoordinated" },
    { cancel: true },
    { queue: "single" },
  ]) {
    assert.ok(
      checkWorkflowConcurrency(
        new Map([["future-deploy.yml", writer("staging", override)]]),
      ).length,
    );
  }
});

test("a known production writer cannot declare a staging target to escape the production group", () => {
  assert.ok(
    checkWorkflowConcurrency(
      new Map([["production-render-rollback.yml", writer("staging")]]),
    ).some((message) => message.includes("multiple Render mutation targets")),
  );
});

test("missing or duplicate concurrency fields fail closed", () => {
  const valid = writer("production");
  for (const source of [
    valid.replace(/^concurrency:\n/mu, ""),
    valid.replace(/^  group:.*\n/mu, ""),
    valid.replace(/^  cancel-in-progress:.*\n/mu, ""),
    valid.replace(/^  queue:.*\n/mu, ""),
    valid.replace("  queue: max", "  queue: max\n  queue: single"),
    valid.replace(
      "jobs:",
      "concurrency:\n  group: hidden\n  cancel-in-progress: false\njobs:",
    ),
  ])
    assert.ok(
      checkWorkflowConcurrency(
        new Map([["production-render-rollback.yml", source]]),
      ).length,
    );
});

test("CI cancellation stays permitted and a nested job lock cannot substitute for the destination lock", () => {
  assert.deepEqual(
    checkWorkflowConcurrency(
      new Map([
        [
          "quality.yml",
          "concurrency:\n  group: ci-${{ github.ref }}\n  cancel-in-progress: true\njobs:\n",
        ],
      ]),
    ),
    [],
  );
  const nested = writer("production", {
    group: "wrong",
    extra: `    concurrency:\n      group: ${renderMutationGroups.production}\n      cancel-in-progress: false\n      queue: max\n`,
  });
  assert.ok(
    checkWorkflowConcurrency(new Map([["future-deploy.yml", nested]])).some(
      (message) => message.includes("must share concurrency.group"),
    ),
  );
});
