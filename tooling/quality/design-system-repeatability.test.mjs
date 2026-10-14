import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cp,
  mkdtemp,
  lstat,
  readFile,
  rename,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";

// Exercise the real package scripts in a disposable copy, preserving the source tree.
const [candidateArg = process.cwd()] = process.argv.slice(2);
assert.match(process.version, /^v22\./);
const candidate = resolve(candidateArg);
const root = await mkdtemp(join(tmpdir(), "tdp-ds-repeatability-"));
const pkg = join(root, "packages/design-system");
await cp(join(candidate, "packages/design-system"), pkg, {
  recursive: true,
  filter: (path) => !path.includes("/dist") && !path.includes("/node_modules"),
});
await cp(
  join(candidate, "tsconfig.base.json"),
  join(root, "tsconfig.base.json"),
);
const legacyCss = "apps/morro-digital-platform/public/legacy/css/base";
await cp(join(candidate, legacyCss), join(root, legacyCss), {
  recursive: true,
});
await symlink(
  join(candidate, "node_modules"),
  join(root, "node_modules"),
  "dir",
);
await symlink(
  join(candidate, "node_modules"),
  join(pkg, "node_modules"),
  "dir",
);
const pkgBytes = await readFile(join(pkg, "package.json"));
const results = [];
function run(script, extra = []) {
  const result = spawnSync("pnpm", ["--dir", pkg, script, ...extra], {
    encoding: "utf8",
    timeout: 120000,
    env: {
      ...process.env,
      PATH: `${resolve(process.execPath, "..")}:${process.env.PATH}`,
    },
  });
  const entry = {
    script,
    extra,
    exitCode: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    error: result.error?.message,
  };
  results.push(entry);
  console.log(JSON.stringify(entry));
  assert(!result.error, result.error?.message);
  return result;
}
let names;
async function sourceTest(label) {
  const report = join(root, `${label}.json`);
  const result = run("test", ["--reporter=json", `--outputFile=${report}`]);
  assert.equal(result.status, 0);
  const data = JSON.parse(await readFile(report, "utf8"));
  assert(data.numTotalTests > 0);
  assert.equal(data.numPassedTests, data.numTotalTests);
  assert.equal(data.numPendingTests, 0);
  assert(data.testResults.length > 0);
  const observed = data.testResults
    .flatMap((suite) => {
      assert(suite.name.startsWith(join(pkg, "src/")));
      return suite.assertionResults.map((item) => {
        assert.equal(item.status, "passed");
        return item.fullName;
      });
    })
    .sort();
  if (names) assert.deepEqual(observed, names);
  else names = observed;
}
try {
  await sourceTest("before-build");
  assert.equal(run("build").status, 0);
  await sourceTest("after-build-1");
  assert.equal(run("build").status, 0);
  await sourceTest("after-build-2");
  await writeFile(
    join(pkg, "dist/rejected-dist.test.js"),
    "import { test } from 'vitest'; test('DIST_MUST_NOT_RUN',()=>{throw Error('DIST_CANARY')});\n",
  );
  await sourceTest("stale-dist-canary");
  await writeFile(
    join(pkg, "src/failing-source.test.ts"),
    "import { test } from 'vitest'; test('SOURCE_MUST_RUN',()=>{throw Error('SOURCE_CANARY')});\n",
  );
  const failing = run("test");
  assert.notEqual(failing.status, 0);
  assert.match(failing.stdout + failing.stderr, /SOURCE_CANARY/);
  await rename(join(pkg, "src"), join(pkg, "saved-source"));
  await assert.rejects(lstat(join(pkg, "src")), { code: "ENOENT" });
  const absent = run("test");
  assert.notEqual(absent.status, 0);
  assert.match(absent.stdout + absent.stderr, /No test files found/);
  console.log(
    JSON.stringify({
      status: "PASS",
      node: process.version,
      packageSHA256: createHash("sha256").update(pkgBytes).digest("hex"),
      assertions: names,
      results: results.map(({ script, extra, exitCode }) => ({
        script,
        extra,
        exitCode,
      })),
      scope: "DESIGN_SYSTEM_REPEATABILITY_REGRESSION",
      root,
    }),
  );
} catch {
  console.error(
    JSON.stringify({
      status: "FAIL",
      root,
      code: "DESIGN_SYSTEM_REPEATABILITY_FAILED",
    }),
  );
  process.exitCode = 1;
}
