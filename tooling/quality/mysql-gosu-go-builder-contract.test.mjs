import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

const productionPinnedGo =
  "golang:1.26.9-bookworm@sha256:d9c68c2c51161e12fd77e4c6320687c9cd86e1af1e3ad6e6cd63ff970641453c";
const stagingPinnedGo =
  "golang:1.26.10-bookworm@sha256:632dff7351799a5a9954a48dc06670ade72ee44e8c351cdc0e5a57af2fea21af";
const pinnedGosu = "6456aaa0f3c854d199d0f037f068eb97515b7513";
const dockerfiles = [
  "tooling/render/mysql-staging/Dockerfile",
  "tooling/render/mysql-production/Dockerfile",
  "tooling/render/mysql-production-dr/Dockerfile",
];

for (const path of dockerfiles) {
  test(`${path}: gosu uses patched immutable Go and a verified full source commit`, () => {
    const source = readFileSync(path, "utf8");
    const pinnedGo =
      path === "tooling/render/mysql-staging/Dockerfile"
        ? stagingPinnedGo
        : productionPinnedGo;
    assert.ok(source.startsWith(`FROM ${pinnedGo} AS gosu-builder\n`));
    assert.match(
      source,
      new RegExp(`^ARG GOSU_(?:RELEASE_)?COMMIT=${pinnedGosu}$`, "mu"),
    );
    assert.match(
      source,
      /test "\$\(git(?: -C \/src\/gosu)? rev-parse HEAD\)" = "\$\{GOSU_(?:RELEASE_)?COMMIT\}"/u,
    );
    assert.ok(source.includes("CGO_ENABLED=0 go build"));
    assert.ok(
      source.includes("COPY --from=gosu-builder /out/gosu /usr/local/bin/gosu"),
    );
    assert.ok(source.includes("gosu nobody true"));
    if (!path.includes("-dr/")) {
      assert.doesNotMatch(source, /^USER (?:root|mysql)$/mu);
    } else {
      assert.match(source, /^USER mysql$/mu);
    }
  });

  test(`${path}: runtime update includes the fixable Oracle pcre2 package`, () => {
    const active = readFileSync(path, "utf8")
      .split(/\r?\n/u)
      .filter((line) => !line.trimStart().startsWith("#"))
      .join("\n")
      .replace(/\\\r?\n/gu, " ");
    const updates = [...active.matchAll(/microdnf update -y ([^;\n]+)/gu)];
    assert.ok(
      updates.some((match) => match[1].trim().split(/\s+/u).includes("pcre2")),
      "pcre2 must be updated by an active command",
    );
  });
}

test("canonical Fabric assigns all MySQL image writes exclusively to ci-release at critical risk", () => {
  const root = mkdtempSync(join(tmpdir(), "morro-mysql-ownership-"));
  const git = (...args) =>
    execFileSync("git", ["-c", "core.hooksPath=/dev/null", ...args], {
      cwd: root,
      encoding: "utf8",
    }).trim();
  const commit = () => {
    git("add", ".");
    git(
      "-c",
      "user.name=Security contract",
      "-c",
      "user.email=security-contract@example.invalid",
      "commit",
      "--quiet",
      "-m",
      "fixture",
    );
    return git("rev-parse", "HEAD");
  };
  try {
    for (const path of [
      ".morro/ownership.json",
      ".morro/risk-policy.json",
      ".morro/contract-graph.json",
      "tooling/fabric/plan-change.mjs",
      "tooling/fabric/ownership-path.mjs",
    ]) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), readFileSync(path));
    }
    git("init", "--quiet");
    let base = commit();
    for (const path of [...dockerfiles, "tooling/rendered/Dockerfile"]) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), "# isolated ownership fixture\n");
      const head = commit();
      const plan = JSON.parse(
        execFileSync(
          process.execPath,
          ["tooling/fabric/plan-change.mjs", "--base", base, "--head", head],
          { cwd: root, encoding: "utf8" },
        ),
      );
      assert.deepEqual(plan.changedFiles, [path]);
      assert.deepEqual(
        plan.ownedDomains,
        path.includes("/render/") ? ["ci-release"] : [],
      );
      if (path.includes("/render/")) {
        assert.equal(plan.risk, "critical");
        assert.deepEqual(plan.requiredEvidence, [
          "full-quality",
          "domain-invariants",
          "integration",
          "exact-head-release-gates",
        ]);
      }
      base = head;
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
