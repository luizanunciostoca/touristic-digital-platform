import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { verifyCandidate } from "./release-candidate.mjs";

test("candidate identity survives main advancement and rejects missing, moved or unmerged refs", () => {
  const root = mkdtempSync(join(tmpdir(), "morro-candidate-"));
  const cwd = join(root, "work");
  const remote = join(root, "remote.git");
  const git = (...args) =>
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  try {
    execFileSync("git", ["init", "--bare", remote], { stdio: "ignore" });
    execFileSync("git", ["clone", remote, cwd], { stdio: "ignore" });
    git("config", "user.name", "Candidate test");
    git("config", "user.email", "candidate@example.invalid");
    git("checkout", "-b", "main");
    writeFileSync(join(cwd, "app.txt"), "candidate\n");
    git("add", ".");
    git("commit", "-m", "candidate");
    const sha = git("rev-parse", "HEAD");
    git("push", "origin", "main");
    assert.throws(
      () => verifyCandidate(sha, { cwd }),
      /CANDIDATE_REF_MISMATCH/,
    );
    git("tag", `rc/${sha}`);
    git("push", "origin", `refs/tags/rc/${sha}`);
    assert.equal(verifyCandidate(sha, { cwd }).sourceSha, sha);
    writeFileSync(join(cwd, "app.txt"), "later legitimate merge\n");
    git("commit", "-am", "advance main");
    git("push", "origin", "main");
    const later = git("rev-parse", "HEAD");
    assert.throws(
      () => verifyCandidate(sha, { cwd }),
      /CANDIDATE_CHECKOUT_MISMATCH/,
    );
    git("checkout", "--detach", sha);
    assert.equal(verifyCandidate(sha, { cwd }).sourceSha, sha);
    git("push", "--force", "origin", `${later}:refs/tags/rc/${sha}`);
    assert.throws(
      () => verifyCandidate(sha, { cwd }),
      /CANDIDATE_REF_MISMATCH/,
    );
    git("checkout", "--orphan", "unmerged");
    git("commit", "--allow-empty", "-m", "untrusted");
    const unmerged = git("rev-parse", "HEAD");
    git("tag", `rc/${unmerged}`);
    git("push", "origin", `refs/tags/rc/${unmerged}`);
    assert.throws(() => verifyCandidate(unmerged, { cwd }));
    assert.throws(
      () => verifyCandidate("main", { cwd }),
      /INVALID_CANDIDATE_SHA/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
