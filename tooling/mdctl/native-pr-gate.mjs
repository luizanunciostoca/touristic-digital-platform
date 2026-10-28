import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ordinaryPrScope } from "../fabric/ordinary-pr-policy.mjs";
const SHA = /^[a-f0-9]{40}$/;
export function classifyNativeScope(trustedDir, candidateDir, base, head) {
  for (const sha of [base, head]) assert.match(sha, SHA, "NATIVE_SHA_INVALID");
  const git = (dir, ...args) =>
    execFileSync("git", ["-C", dir, ...args], {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    }).trim();
  assert.equal(
    git(trustedDir, "rev-parse", "HEAD"),
    base,
    "NATIVE_TRUSTED_HEAD",
  );
  assert.equal(
    git(candidateDir, "rev-parse", "HEAD"),
    head,
    "NATIVE_CANDIDATE_HEAD",
  );
  git(candidateDir, "merge-base", "--is-ancestor", base, head);
  // Read policies as base Git blobs, never candidate filesystem.
  const json = (path) => JSON.parse(git(trustedDir, "show", `${base}:${path}`));
  const raw = execFileSync(
    "git",
    [
      "-C",
      candidateDir,
      "diff",
      "--no-ext-diff",
      "--no-textconv",
      "--no-renames",
      "--name-only",
      "-z",
      base,
      head,
    ],
    { encoding: "utf8" },
  );
  const files = raw.split("\0").filter(Boolean);
  return ordinaryPrScope(
    files,
    json(".morro/risk-policy.json"),
    json(".morro/ownership.json"),
  );
}
const overlap = (a, b) =>
  a === b || a.startsWith(b + "/") || b.startsWith(a + "/");
export function evaluateNativeFronts({
  fronts,
  prNumber,
  head,
  base,
  repository,
  files,
  changedLines,
  changedFileCount,
  policy,
  unresolvedReviewThreads,
}) {
  assert.equal(unresolvedReviewThreads, 0, "NATIVE_UNRESOLVED_THREADS");
  assert.ok(
    Number.isInteger(changedLines) &&
      changedLines >= 0 &&
      changedLines <= policy.hardLines,
    "NATIVE_LINE_BUDGET",
  );
  assert.ok(
    Number.isInteger(changedFileCount) &&
      changedFileCount >= 1 &&
      changedFileCount <= policy.hardFiles,
    "NATIVE_FILE_BUDGET",
  );
  assert.ok(
    Array.isArray(fronts) && fronts.length >= 1 && fronts.length <= 2,
    "NATIVE_TWO_FRONT_LIMIT",
  );
  const own = fronts.filter((p) => p.number === prNumber);
  assert.equal(own.length, 1, "NATIVE_PR_MISSING");
  assert.equal(own[0].head.sha, head, "NATIVE_HEAD_MOVED");
  assert.equal(own[0].base.sha, base, "NATIVE_BASE_MOVED");
  assert.equal(own[0].draft, false, "NATIVE_DRAFT");
  assert.ok(
    Array.isArray(own[0].paths) && own[0].paths.length > 0,
    "NATIVE_FRONT_FILES_UNKNOWN",
  );
  for (const p of fronts) {
    assert.equal(p.state, "open", "NATIVE_PR_NOT_OPEN");
    assert.equal(p.base.ref, "main", "NATIVE_BASE_REF");
    assert.equal(p.head.repo.full_name, repository, "NATIVE_FORK");
    assert.match(p.head.sha, SHA, "NATIVE_FRONT_SHA");
    assert.ok(
      Array.isArray(p.paths) && p.paths.length > 0,
      "NATIVE_FRONT_FILES_UNKNOWN",
    );
    if (p.number !== prNumber)
      assert.ok(
        !own[0].paths.some((a) => p.paths.some((b) => overlap(a, b))),
        "NATIVE_PATH_OVERLAP",
      );
  }
  return {
    schemaVersion: 1,
    kind: "TDP_MERGE_GATE_DECISION",
    decision: "POLICY_SATISFIED",
    mode: "NATIVE_TWO_FRONTS_SERIAL_INTEGRATOR",
    exactBaseSha: base,
    exactHeadSha: head,
    changedFiles: changedFileCount,
    changedLines,
    openPrs: fronts.length,
    unresolvedReviewThreads,
    semanticDependenciesProven: false,
    semanticCollisionsProven: false,
  };
}
export async function nativeFrontSnapshot(repository, api) {
  const root = "repos/" + repository;
  const pages = await api(root + "/pulls?state=open&base=main&per_page=100", {
    paginate: true,
  });
  assert.ok(Array.isArray(pages), "NATIVE_PAGES_UNKNOWN");
  const prs = pages.flat();
  assert.ok(prs.length <= 2, "NATIVE_TWO_FRONT_LIMIT");
  return Promise.all(
    prs.map(async (p) => {
      const live = await api(root + "/pulls/" + p.number);
      const pages = await api(
        root + "/pulls/" + p.number + "/files?per_page=100",
        { paginate: true },
      );
      assert.ok(Array.isArray(pages), "NATIVE_FILES_PAGES");
      const entries = pages.flat();
      assert.equal(
        entries.length,
        live.changed_files,
        "NATIVE_FILES_INCOMPLETE",
      );
      const paths = [
        ...new Set(
          entries.flatMap((f) => {
            assert.ok(typeof f.filename === "string", "NATIVE_FILE_INVALID");
            return f.previous_filename
              ? [f.filename, f.previous_filename]
              : [f.filename];
          }),
        ),
      ];
      return { ...live, paths };
    }),
  );
}
export async function assertFrontsStable(fronts, repository, api) {
  const current = await nativeFrontSnapshot(repository, api);
  const identity = (list) =>
    list
      .map((p) => ({
        number: p.number,
        head: p.head.sha,
        base: p.base.sha,
        state: p.state,
        draft: p.draft,
        paths: p.paths.toSorted(),
      }))
      .sort((a, b) => a.number - b.number);
  assert.deepEqual(identity(current), identity(fronts), "NATIVE_FRONTS_MOVED");
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  assert.equal(process.argv[2], "--classify", "NATIVE_ARGUMENT");
  const [trusted, candidate, base, head] = process.argv.slice(3);
  console.log(
    "ordinary=" + String(classifyNativeScope(trusted, candidate, base, head)),
  );
}
