import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

for (const [file, marker] of [
  [
    ".github/workflows/morro-claim-guard-trust-bootstrap.yml",
    "base-controlled-independent-proof",
  ],
  [".github/workflows/morro-agent-profiles.yml", "agent-profile-contract"],
]) {
  test(`${file} routes every PR to exact-head trust proof`, () => {
    const source = readFileSync(file, "utf8");
    const trigger = source.split(/^permissions:/m)[0];
    assert.match(
      trigger,
      /^on:\n  pull_request:\n    types: \[opened, synchronize, reopened, ready_for_review, converted_to_draft\]/m,
    );
    assert.doesNotMatch(trigger, /^    paths(?:-ignore)?:/m);
    assert.match(source, new RegExp(marker));
    assert.match(source, /pull_request\.head\.sha/);
  });
}

test("merge gate still waits for success from the same candidate SHA", () => {
  const source = readFileSync(".github/workflows/morro-merge-gate.yml", "utf8");
  assert.match(source, /name: Wait for exact-head Trusted Claim Guard/);
  assert.match(source, /\.head_sha == env\.HEAD_SHA/);
  assert.match(source, /test "\$conclusion" = "success"/);
  assert.match(source, /TRUSTED_CLAIM_GUARD_TIMEOUT:\$HEAD_SHA/);
});
