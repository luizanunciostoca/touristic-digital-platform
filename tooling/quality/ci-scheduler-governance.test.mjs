import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
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
    assert.match(source, /^  workflow_dispatch:/m);
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
    "Prove the golden suite rejects deliberate regressions",
    "Record exact-head evidence identity",
  ])
    assert.ok(visual.includes(marker));
});

test("draft transitions cannot rerun unchanged Quality candidates", () => {
  assert.ok(quality.includes("types: [opened, synchronize, reopened]"));
  assert.doesNotMatch(quality, /ready_for_review|converted_to_draft/);
});
