import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { buildChangeEnvelope } from "../mdctl/change-envelope.mjs";
import { assertOwnershipCoverage } from "../ci/local-fast-gate.mjs";

const exact = "packages/design-system/package.json";
const directory = "tooling/ci/";
const ownership = {
  domains: [{ id: "ci-release", pathPrefixes: [exact, directory] }],
};
const riskPolicy = {
  ...JSON.parse(
    readFileSync(
      new URL("../../.morro/risk-policy.json", import.meta.url),
      "utf8",
    ),
  ),
  criticalPaths: [],
  highPaths: ["tooling/"],
  lowExtensions: [".md"],
  semanticRiskFloor: {},
};
const graph = {
  contracts: {
    "boundary-fixture": { owners: ["ci-release"], consumers: ["consumer"] },
  },
};
const template = JSON.parse(
  readFileSync(
    new URL("../../.morro/changesets/MD-TDP-V32-OPT-001.json", import.meta.url),
    "utf8",
  ),
);
const cases = [
  [exact, true],
  ["tooling/ci/subdir/proof.mjs", true],
  [exact + ".backup", false],
  [exact + "x", false],
  [exact + "-old", false],
  [exact + "/child", false],
  ["packages/design-system/package.jsonc", false],
  ["packages/design-system-extra/package.json", false],
  ["packages/design-system/package.JSON", false],
  ["packages/design-system-copy/package.json", false],
  ["tooling/ci-other/proof.mjs", false],
  ["tooling/civil/proof.mjs", false],
];
function git(root, ...args) {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
function fixture(path) {
  const root = mkdtempSync(join(tmpdir(), "tdp-ownership-boundary-"));
  const write = (path, value) => {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, value);
  };
  try {
    git(root, "init", "-q");
    git(root, "config", "user.name", "Boundary fixture");
    git(root, "config", "user.email", "boundary@example.invalid");
    write(".morro/ownership.json", JSON.stringify(ownership));
    write(".morro/risk-policy.json", JSON.stringify(riskPolicy));
    write(".morro/contract-graph.json", JSON.stringify(graph));
    git(root, "add", ".");
    git(
      root,
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-qm",
      "fixture baseline",
    );
    const base = git(root, "rev-parse", "HEAD");
    write(path, "{}\n");
    git(root, "add", "--", path);
    git(
      root,
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-qm",
      "fixture changed path",
    );
    return { root, base };
  } catch (error) {
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
}
for (const [path, owned] of cases) {
  test("ownership consumers agree: " + path, async (t) => {
    const { root, base } = fixture(path);
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const expected = owned ? ["ci-release"] : [];
    const run = (script, args) =>
      JSON.parse(
        execFileSync(
          process.execPath,
          [fileURLToPath(new URL(script, import.meta.url)), ...args],
          { cwd: root, encoding: "utf8" },
        ),
      );
    await t.test(
      "planning respects exact file and directory boundaries",
      () => {
        const report = run("./plan-change.mjs", [
          "--base",
          base,
          "--head",
          "HEAD",
        ]);
        assert.deepEqual(report.changedFiles, [path]);
        assert.deepEqual(report.ownedDomains, expected);
        assert.deepEqual(
          report.touchedContracts,
          owned ? ["boundary-fixture"] : [],
        );
        assert.deepEqual(
          report.impactedDomains,
          owned ? ["ci-release", "consumer"] : [],
        );
      },
    );
    await t.test("impact respects exact file and directory boundaries", () => {
      const report = run("./compute-impact.mjs", [base]);
      assert.deepEqual(report.files, [path]);
      assert.deepEqual(report.ownedDomains, expected);
      assert.deepEqual(
        report.touchedContracts,
        owned ? ["boundary-fixture"] : [],
      );
      assert.deepEqual(
        report.impactedDomains,
        owned ? ["ci-release", "consumer"] : [],
      );
    });
    await t.test("envelope fails closed for unmapped aliases", () => {
      const changeSet = {
        ...structuredClone(template),
        id: "MD-OWNERSHIP-BOUNDARY-FIXTURE",
        objective: "ownership-boundary-regression",
        baseSha: base,
        branch: "fix/ownership-boundary-fixture",
        state: "IMPLEMENTING",
        risk: "high",
        owns: { paths: [path], contracts: [] },
        dependencies: [],
      };
      const build = () =>
        buildChangeEnvelope({
          rootCause: "prefix collision",
          semanticImpact: "incorrect ownership attribution",
          probablePaths: [path],
          changeSet,
          ownership,
          riskPolicy,
        });
      if (owned) assert.deepEqual(build().ownershipDomains, expected);
      else assert.throws(build, /CHANGE_ENVELOPE_OWNERSHIP_UNMAPPED/u);
    });
    await t.test("admission keeps its exact-file boundary", () => {
      if (owned)
        assert.deepEqual(assertOwnershipCoverage([path], ownership), {
          covered: 1,
        });
      else
        assert.throws(
          () => assertOwnershipCoverage([path], ownership),
          /FAST_GATE_OWNERSHIP_UNCOVERED/u,
        );
    });
  });
}
