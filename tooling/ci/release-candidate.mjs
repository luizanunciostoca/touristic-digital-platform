import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// One identity contract for acceptance and promotion. main is a provenance
// boundary, not a lock: new merges must not invalidate a frozen candidate.
export function verifyCandidate(sha, { cwd = process.cwd() } = {}) {
  assert.match(sha ?? "", /^[0-9a-f]{40}$/, "INVALID_CANDIDATE_SHA");
  const git = (...args) =>
    execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  const ref = `refs/tags/rc/${sha}`;
  assert.equal(git("rev-parse", "HEAD"), sha, "CANDIDATE_CHECKOUT_MISMATCH");
  // Fetch the trusted branch explicitly, even after a checkout of an older SHA.
  git("fetch", "--no-tags", "origin", "main:refs/remotes/origin/main");
  git("merge-base", "--is-ancestor", sha, "refs/remotes/origin/main");
  const remoteRef = git("ls-remote", "--refs", "origin", ref);
  assert.equal(remoteRef, `${sha}\t${ref}`, "CANDIDATE_REF_MISMATCH");
  return { sourceSha: sha, treeSha: git("rev-parse", `${sha}^{tree}`), ref };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  console.log(JSON.stringify(verifyCandidate(process.argv[2])));
}
