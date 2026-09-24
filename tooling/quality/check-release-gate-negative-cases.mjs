import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";

async function source(path) {
  return readFile(path, "utf8");
}

function certifyPages({ acceptedSha, currentMainSha, acceptanceState }) {
  return (
    /^[0-9a-f]{40}$/.test(acceptedSha) &&
    acceptedSha === currentMainSha &&
    acceptanceState === "success"
  );
}

function certifyProvenance({
  expectedSha,
  expectedTree,
  expectedDigest,
  provenance,
}) {
  return (
    provenance.source_sha === expectedSha &&
    provenance.tree_sha === expectedTree &&
    provenance.digest === expectedDigest
  );
}

assert.equal(
  certifyPages({
    acceptedSha: "a".repeat(40),
    currentMainSha: "b".repeat(40),
    acceptanceState: "success",
  }),
  false,
  "wrong SHA must fail closed",
);
assert.equal(
  certifyPages({
    acceptedSha: "a".repeat(40),
    currentMainSha: "a".repeat(40),
    acceptanceState: "failure",
  }),
  false,
  "non-success Final Release Acceptance must fail closed",
);
assert.equal(
  certifyPages({
    acceptedSha: "a".repeat(40),
    currentMainSha: "b".repeat(40),
    acceptanceState: "success",
  }),
  false,
  "main drift must fail closed",
);
assert.equal(
  certifyProvenance({
    expectedSha: "a".repeat(40),
    expectedTree: "c".repeat(40),
    expectedDigest: "sha256:" + "d".repeat(64),
    provenance: {
      source_sha: "a".repeat(40),
      tree_sha: "e".repeat(40),
      digest: "sha256:" + "d".repeat(64),
    },
  }),
  false,
  "artifact tree mismatch must fail closed",
);

const pages = await source(".github/workflows/pages-after-final-acceptance.yml");
for (const marker of [
  'test "$current_main_sha" = "$ACCEPTED_SHA"',
  'test "$acceptance_state" = "success"',
  'test "$current_main_sha" = "$CERTIFIED_SHA"',
]) {
  assert.ok(
    pages.includes(marker),
    `Pages fail-closed marker missing: ${marker}`,
  );
}
assert.ok(
  !/^  (push|pull_request):/m.test(pages),
  "Pages workflow must not deploy directly from push/pull_request",
);

const acceptance = await source(
  ".github/workflows/final-release-acceptance.yml",
);
for (const marker of [
  'candidate_tree="$(commit_tree "$candidate_sha")"',
  'if [ "$candidate_tree" = "$CURRENT_TREE" ]; then',
  'if [ "$observed_sha" != "$expected_sha" ]; then',
  'test "$remote_main_sha" = "$GITHUB_SHA"',
]) {
  assert.ok(
    acceptance.includes(marker),
    `Final acceptance fail-closed marker missing: ${marker}`,
  );
}

for (const path of [
  ".github/workflows/oci-release-promotion-gate.yml",
  ".github/workflows/staging-oci-promotion.yml",
  ".github/workflows/production-oci-promotion.yml",
]) {
  const workflow = await source(path);
  assert.ok(
    workflow.includes(
      ".source_sha == $sha and .tree_sha == $tree and .digest == $digest",
    ),
    `${path} must bind provenance to SHA, tree and digest`,
  );
  assert.ok(
    workflow.includes('test "$remote_main_sha" = "$EXPECTED_SHA"'),
    `${path} must reject main drift`,
  );
}

console.log(
  "Release gate negative contracts passed: wrong SHA, non-success status, main drift, and artifact mismatch all fail closed.",
);
