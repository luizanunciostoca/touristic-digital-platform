import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const workflow = readFileSync(
  new URL("../../.github/workflows/ci-impact.yml", import.meta.url),
  "utf8",
);
const section = workflow.match(
  /      - name: Resolve impact base\n[\s\S]*?        run: \|\n([\s\S]*?)      - name: Analyze changed domains and risk/,
);
assert.ok(section, "impact base resolver must remain in the workflow");
const script = section[1]
  .split("\n")
  .map((line) => line.replace(/^          /, ""))
  .join("\n")
  .replaceAll("${{ github.event_name }}", "workflow_dispatch")
  .replaceAll("${{ github.event.pull_request.base.sha }}", "unused")
  .replaceAll("${{ github.event.merge_group.base_sha }}", "unused")
  .replaceAll("${{ github.event.before }}", "unused");

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

test("release tag resolves first parent even when origin/main is the candidate", () => {
  const dir = mkdtempSync(join(tmpdir(), "ci-impact-rc-"));
  try {
    git(dir, "init", "-q");
    git(dir, "config", "user.name", "CI Impact Test");
    git(dir, "config", "user.email", "ci-impact@example.invalid");
    writeFileSync(join(dir, "README.md"), "base\n");
    git(dir, "add", ".");
    git(dir, "commit", "-qm", "base");
    const base = git(dir, "rev-parse", "HEAD");
    mkdirSync(join(dir, "tooling", "ci"), { recursive: true });
    writeFileSync(
      join(dir, "tooling", "ci", "impact-analyzer.mjs"),
      "export {};\n",
    );
    git(dir, "add", ".");
    git(dir, "commit", "-qm", "candidate");
    let head = git(dir, "rev-parse", "HEAD");
    git(dir, "update-ref", "refs/remotes/origin/main", head);

    function resolve(ref) {
      const output = join(dir, "output");
      writeFileSync(output, "");
      const result = spawnSync("bash", ["-e", "-c", script], {
        cwd: dir,
        encoding: "utf8",
        env: {
          ...process.env,
          GITHUB_REF: ref,
          GITHUB_SHA: head,
          GITHUB_OUTPUT: output,
        },
      });
      return { ...result, base: readFileSync(output, "utf8").trim() };
    }

    const rc = resolve("refs/tags/rc/" + head);
    assert.equal(rc.status, 0, rc.stderr);
    assert.equal(rc.base, "sha=" + base);
    assert.equal(
      git(dir, "diff", "--name-only", base, head),
      "tooling/ci/impact-analyzer.mjs",
    );

    const normal = resolve("refs/heads/main");
    assert.equal(normal.status, 0, normal.stderr);
    assert.equal(normal.base, "sha=" + head);

    const wrongTag = resolve("refs/tags/rc/" + base);
    assert.notEqual(wrongTag.status, 0);
    assert.equal(wrongTag.base, "");

    git(dir, "commit", "--allow-empty", "-qm", "empty release candidate");
    head = git(dir, "rev-parse", "HEAD");
    const empty = resolve("refs/tags/rc/" + head);
    assert.notEqual(empty.status, 0);
    assert.equal(empty.base, "");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
