import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, mkdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import test from "node:test";
import { ESLint } from "eslint";

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const ownership = JSON.parse(await readFile(".morro/ownership.json", "utf8"));
const lockfile = await readFile("pnpm-lock.yaml", "utf8");

test("source-map-js remediation is fixed, locked and owned", () => {
  assert.equal(packageJson.pnpm?.overrides?.["source-map-js"], "1.2.2");

  const ciRelease = ownership.domains.find(
    (domain) => domain.id === "ci-release",
  );
  assert.ok(ciRelease, "ci-release ownership domain must exist");
  assert.ok(
    ciRelease.pathPrefixes.includes("pnpm-lock.yaml"),
    "pnpm-lock.yaml must have explicit ci-release ownership",
  );

  assert.match(lockfile, /source-map-js@1\.2\.2:/);
  assert.doesNotMatch(lockfile, /source-map-js@1\.2\.1:/);
});

test("all locked minimatch consumers use the patched release", () => {
  assert.equal(packageJson.pnpm?.overrides?.minimatch, "11.0.3");
  const versions = [...lockfile.matchAll(/^  minimatch@([^:]+):/gmu)].map(
    ([, version]) => version,
  );
  assert.ok(versions.length > 0, "the lockfile must contain minimatch");
  assert.deepEqual([...new Set(versions)], ["11.0.3"]);
});

test("glob preprocessing bounds the advisory's amplification pattern", () => {
  const require = createRequire(import.meta.url);
  const eslintRequire = createRequire(require.resolve("eslint"));
  const minimatchPath = eslintRequire.resolve("minimatch");
  // The previous 10.2.6 implementation exhausts this isolated heap even when
  // braceExpandMax is set. Keep a process limit so regression cannot hang CI.
  const script = `
    const assert = require("node:assert/strict");
    const { Minimatch } = require(${JSON.stringify(minimatchPath)});
    const pattern = Array(30).fill("**/../a/b").join("/");
    const matcher = new Minimatch(pattern, {
      optimizationLevel: 2,
      braceExpandMax: 64,
    });
    assert.equal(matcher.set.length, 64);
    const small = new Minimatch("**/../a/b/**/../c/d", {
      optimizationLevel: 2,
    });
    assert.equal(small.match("../a/b/../c/d"), true);
    assert.equal(small.match("x/a/b/y/c/d"), true);
    assert.equal(small.match("x/a/b/y/c/e"), false);
  `;
  const result = spawnSync(
    process.execPath,
    ["--max-old-space-size=128", "--input-type=commonjs", "-e", script],
    { encoding: "utf8", timeout: 5000, maxBuffer: 128 * 1024 },
  );
  assert.ifError(result.error);
  assert.equal(result.signal, null, result.stderr);
  assert.equal(result.status, 0, result.stderr);
});

test("ESLint still selects globbed files, excludes build output and reports errors", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "tdp-minimatch-eslint-"));
  try {
    const included = ["src/app.js", "src/.hidden.js", "src/nested/view.mjs"];
    for (const file of [...included, "dist/bundle.js"]) {
      await mkdir(join(cwd, file, ".."), { recursive: true });
      await writeFile(join(cwd, file), "missingName();\n");
    }
    const eslint = new ESLint({
      cwd,
      overrideConfigFile: true,
      overrideConfig: [
        { ignores: ["**/dist/**"] },
        {
          files: ["**/*.{js,mjs}"],
          rules: { "no-undef": "error" },
        },
      ],
    });
    const results = await eslint.lintFiles(["**/*.{js,mjs}"]);
    assert.deepEqual(
      results.map((result) => relative(cwd, result.filePath)).sort(),
      included.sort(),
    );
    for (const result of results) {
      assert.equal(result.errorCount, 1);
      assert.equal(result.messages[0].ruleId, "no-undef");
      assert.equal(result.warningCount, 0);
    }
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
