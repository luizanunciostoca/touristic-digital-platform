import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { suiteManifest } from "../ci/suite-scheduler.mjs";

const read = (path) =>
  readFileSync(new URL("../../" + path, import.meta.url), "utf8");
const quality = read(".github/workflows/quality.yml");
test("managed suites cannot bypass the scheduler or write to the repository", () => {
  assert.equal(
    new Set(suiteManifest.suites.map((suite) => suite.jobId)).size,
    suiteManifest.suites.length,
  );
  for (const suite of suiteManifest.suites) {
    const source = read(".github/workflows/" + suite.workflow);
    assert.match(source, /^  workflow_call:/m);
    if (suite.workflow === "control-center-catalog-drafts.yml")
      assert.doesNotMatch(source, /^  workflow_dispatch:/m);
    else assert.match(source, /^  workflow_dispatch:/m);
    assert.doesNotMatch(source, /^  (pull_request|push|pull_request_target):/m);
    assert.doesNotMatch(
      source,
      /contents: write|secrets: inherit|git push origin/,
    );
    assert.doesNotMatch(source, /github\.event\.pull_request\.draft/);
    assert.match(source, /^  contents: read$/m);
    assert.ok(
      source.includes(
        "group: suite-" + suite.workflow.replace(/\.yml$/, "") + "-",
      ),
      suite.workflow,
    );
    assert.ok(
      source.includes(
        "-${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}",
      ),
      "Standalone release dispatch must not cancel the Quality caller",
    );
    assert.ok(quality.includes("uses: ./.github/workflows/" + suite.workflow));
    assert.ok(quality.includes("      - " + suite.jobId));
    assert.ok(
      quality.includes(
        "contains(fromJSON(needs.impact.outputs.scheduled_suites || '[]'), '" +
          suite.workflow +
          "')",
      ),
    );
  }
});
test("the required quality name belongs to a fail-closed aggregator", () => {
  assert.match(quality, /  quality:\n    name: quality\n    if: always\(\)/);
  assert.ok(quality.includes("CI_JOB_RESULTS: ${{ toJSON(needs) }}"));
  assert.ok(quality.includes("node tooling/ci/suite-scheduler.mjs --verify"));
  assert.match(quality, /^  merge_group:/m);
  assert.match(quality, /^    name: Core Quality$/m);
  assert.doesNotMatch(quality, /continue-on-error: true/);
});
test("reusable workflow count stays within GitHub limit", () => {
  const uses = [
    ...quality.matchAll(/uses: (\.\/\.github\/workflows\/[^\s]+)/g),
  ].map((match) => match[1]);
  assert.ok(new Set(uses).size <= 50);
  for (const suite of suiteManifest.suites)
    assert.doesNotMatch(
      read(".github/workflows/" + suite.workflow),
      /uses: \.\/\.github\/workflows\//,
    );
});
test("shared bootstrap pins all external actions and keys caches to the toolchain", () => {
  const bootstrap = read(".github/actions/ci-bootstrap/action.yml");
  for (const match of bootstrap.matchAll(/uses: ([^\s#]+)/g))
    assert.match(match[1], /^[^@]+@[a-f0-9]{40}$/);
  for (const marker of [
    "node-version: 22",
    "version: 10.15.0",
    "pnpm-lock.yaml",
    "runner.arch",
    "~/.cache/ms-playwright",
    "1.54.2",
    "--frozen-lockfile",
  ])
    assert.ok(bootstrap.includes(marker), marker);
});
test("visual workflow has one execution authority through migration", () => {
  const visual = read(".github/workflows/control-center-visual-golden-v1.yml");
  const registered = suiteManifest.suites.some(
    (suite) => suite.workflow === "control-center-visual-golden-v1.yml",
  );
  if (!registered) {
    assert.match(visual, /^  pull_request:/m);
    assert.ok(
      !quality.includes(
        "uses: ./.github/workflows/control-center-visual-golden-v1.yml",
      ),
    );
    return;
  }

  assert.doesNotMatch(
    visual,
    /git commit|git push|prettier --write|Bootstrap reviewed Wave 3/,
  );
  for (const marker of [
    "Verify baseline inventory",
    "Check Wave 4 formatting",
    "Validate manual visual conformance",
    "Prove the golden suite rejects deliberate regressions",
    "Record exact-head evidence identity",
  ])
    assert.ok(visual.includes(marker));
  assert.ok(
    visual.includes(
      "for mutation in dark-topbar hide-destination narrow-attention remove-kpi shift-sidebar; do",
    ),
  );
  assert.ok(visual.includes("FALSE_GREEN: mutation"));
});

test("the visual checkout must match the scheduler source before preparation", () => {
  const visual = read(".github/workflows/control-center-visual-golden-v1.yml");
  assert.ok(visual.includes("ref: ${{ github.sha }}"));
  assert.ok(visual.includes("persist-credentials: false"));
  const marker = "      - name: Require the scheduler source identity\n";
  assert.equal(visual.split(marker).length, 2);
  assert.ok(
    visual.indexOf(marker) <
      visual.indexOf("      - uses: ./.github/actions/ci-bootstrap"),
  );
  const step = visual.split(marker)[1].split("\n      - ")[0];
  const run = step
    .split("        run: |\n")[1]
    .split("\n")
    .map((line) => line.slice(10))
    .join("\n");
  const cwd = mkdtempSync(join(tmpdir(), "visual-source-identity-"));
  const git = (...args) =>
    execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  try {
    git("init", "-q");
    git(
      "-c",
      "user.name=CI Identity Fixture",
      "-c",
      "user.email=ci-identity@example.invalid",
      "commit",
      "--allow-empty",
      "-qm",
      "scheduler source",
    );
    const head = git("rev-parse", "HEAD");
    for (const expected of [head, "0".repeat(40)]) {
      const result = spawnSync("bash", ["-c", run], {
        cwd,
        encoding: "utf8",
        env: { ...process.env, GITHUB_SHA: expected },
      });
      assert.ifError(result.error);
      assert.equal(result.status === 0, expected === head);
    }
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("draft transitions cannot rerun unchanged Quality candidates", () => {
  assert.ok(quality.includes("types: [opened, synchronize, reopened]"));
  assert.doesNotMatch(quality, /ready_for_review|converted_to_draft/);
});

test("serialized control transitions skip only self-referential operational tooling contracts", () => {
  const impact = read(".github/workflows/ci-impact.yml");
  assert.ok(impact.includes("serialized_control_transition_only:"));
  assert.ok(
    quality.includes(
      "if: needs.impact.outputs.serialized_control_transition_only != 'true'",
    ),
  );
  assert.match(
    quality,
    /- name: Validate governance contracts\n\s+if: needs\.impact\.outputs\.non_runtime == 'true'/u,
  );
  assert.doesNotMatch(
    quality,
    /- name: Check formatting\n\s+if: needs\.impact\.outputs\.serialized_control_transition_only/u,
  );
});

test("source release retirement is atomic and preserves guards while present", async () => {
  const { cpSync, mkdirSync, unlinkSync, writeFileSync } =
    await import("node:fs");
  const sourceRoot = new URL("../../", import.meta.url).pathname;
  const root = mkdtempSync(join(tmpdir(), "release-governance-compat-"));
  const legacy = [
    "staging-render-promotion.yml",
    "production-render-promotion.yml",
    "release-promotion-gate.yml",
  ];
  const path = (name) => join(root, ".github/workflows", name);
  const run = () =>
    spawnSync(
      process.execPath,
      [join(sourceRoot, "tooling/quality/check-ci-governance.mjs")],
      { cwd: root, encoding: "utf8" },
    );
  try {
    for (const directory of [
      ".github/workflows",
      "tooling/ci",
      "tooling/quality",
    ])
      mkdirSync(join(root, directory), { recursive: true });
    for (const file of [
      ".github/workflows",
      ".github/CODEOWNERS",
      "package.json",
      "tooling/ci/scheduled-suites.json",
      "tooling/quality/check-platform-contracts.mjs",
    ])
      cpSync(join(sourceRoot, file), join(root, file), { recursive: true });
    const common = [
      "workflow_dispatch:",
      "expected_sha:",
      'node tooling/ci/release-candidate.mjs "$EXPECTED_SHA"',
      "pnpm platform:contracts:check",
      "pnpm migration:dry-run",
      "pnpm release:readiness:check",
      "pnpm secret-patterns:check",
      "pnpm ci:governance:check",
      "pnpm ci:supply-chain:strict",
      "ref=${EXPECTED_SHA}",
      "pnpm --silent payments:render:smoke",
    ];
    // Marker fixtures keep both transition states tested after source retirement.
    const originals = [
      [
        ...common,
        "confirm_staging:",
        "name: staging / preflight",
        "name: main - morro-digital-v2-staging",
        "RENDER_STAGING_DEPLOY_HOOK_URL",
        "EXPECTED_STAGING_SERVICE_ID: srv-da4hb6c9v7es7386ttt0",
        "EXPECTED_STAGING_SERVICE_NAME: morro-digital-v2-staging",
        'url.hostname !== "api.render.com"',
        "url.pathname.match(/^\\/deploy\\/(srv-[A-Za-z0-9]+)$/)",
        "staging-deployment-evidence.json",
      ],
      [
        ...common,
        "confirm_production:",
        "name: production / preflight",
        "name: production",
        "RENDER_PRODUCTION_DEPLOY_HOOK_URL",
        "production-deployment-evidence.txt",
      ],
      [
        "workflow_dispatch:",
        "expected_sha:",
        "name: release / smoke",
        'node tooling/ci/release-candidate.mjs "$EXPECTED_SHA"',
        "pnpm platform:contracts:check",
        "pnpm build",
        "runtime-config.js",
      ],
    ].map((markers) => markers.join("\n") + "\n");
    for (let mask = 0; mask < 8; mask++) {
      legacy.forEach((name, index) => {
        if (mask & (1 << index)) writeFileSync(path(name), originals[index]);
        else rmSync(path(name), { force: true });
      });
      const result = run();
      assert.ifError(result.error);
      assert.equal(
        result.status === 0,
        mask === 0 || mask === 7,
        result.stderr,
      );
      if (mask !== 0 && mask !== 7)
        assert.match(result.stderr, /must be retired as one complete group/);
    }
    for (const [index, marker] of [
      [0, "EXPECTED_STAGING_SERVICE_ID: srv-da4hb6c9v7es7386ttt0"],
      [1, "confirm_production:"],
      [2, "runtime-config.js"],
    ]) {
      writeFileSync(
        path(legacy[index]),
        originals[index].replaceAll(marker, "REMOVED_GUARD"),
      );
      assert.match(run().stderr, /missing required contract marker/);
      writeFileSync(path(legacy[index]), originals[index]);
    }
    for (const [index, name] of legacy.entries()) {
      writeFileSync(path(name), originals[index] + "\n  push:\n");
      assert.match(run().stderr, /explicit workflow_dispatch only/);
      writeFileSync(path(name), originals[index]);
    }
    // No retirement may remove the still-required rollback path.
    unlinkSync(path("production-render-rollback.yml"));
    assert.match(run().stderr, /production-render-rollback.yml is missing/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rollback transition requires the old guard or the new helper with exact target markers", async () => {
  const { cpSync, mkdirSync, writeFileSync } = await import("node:fs");
  const sourceRoot = new URL("../../", import.meta.url).pathname;
  const root = mkdtempSync(join(tmpdir(), "rollback-governance-compat-"));
  const workflow = join(
    root,
    ".github/workflows/production-render-rollback.yml",
  );
  const run = () =>
    spawnSync(
      process.execPath,
      [join(sourceRoot, "tooling/quality/check-ci-governance.mjs")],
      { cwd: root, encoding: "utf8" },
    );
  try {
    for (const directory of [
      ".github/workflows",
      "tooling/ci",
      "tooling/quality",
    ])
      mkdirSync(join(root, directory), { recursive: true });
    for (const file of [
      ".github/workflows",
      ".github/CODEOWNERS",
      "package.json",
      "tooling/ci/scheduled-suites.json",
      "tooling/quality/check-platform-contracts.mjs",
    ])
      cpSync(join(sourceRoot, file), join(root, file), { recursive: true });
    const original =
      [
        "workflow_dispatch:",
        "expected_sha:",
        "target_deploy_id:",
        "confirm_rollback:",
        "name: production / rollback",
        "name: production",
        "RENDER_PRODUCTION_API_KEY",
        "RENDER_PRODUCTION_SERVICE_ID",
        "autoDeploy == false",
        "/rollback",
        "pnpm --silent release:identity:smoke",
      ].join("\n") + "\n";
    writeFileSync(workflow, original);
    assert.equal(run().status, 0);
    const unguarded = original.replaceAll(
      "autoDeploy == false",
      "MISSING_AUTODEPLOY_GUARD",
    );
    writeFileSync(workflow, unguarded);
    assert.match(run().stderr, /autoDeploy == false/);
    const markers = [
      "node tooling/render/render-service-contract.mjs /tmp/render-service.json",
      "EXPECTED_RENDER_SERVICE_ID: srv-daqgk83ncjis739tghig",
      "EXPECTED_RENDER_SERVICE_NAME: morro-digital-v2",
      "EXPECTED_RENDER_REGION: virginia",
      "RENDER_WORKSPACE_ID: tea-d9p09oks728c7381s990",
    ];
    const updated = unguarded + "\n" + markers.join("\n") + "\n";
    writeFileSync(workflow, updated);
    assert.equal(run().status, 0);
    for (const marker of markers) {
      writeFileSync(workflow, updated.replaceAll(marker, "INCORRECT_TARGET"));
      assert.match(run().stderr, /missing required contract marker/);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
