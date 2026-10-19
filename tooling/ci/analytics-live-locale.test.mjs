import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const application = resolve(root, "apps/morro-digital-platform");
const files = [
  "src/analytics/browser-analytics.test.ts",
  "src/analytics/ticketing-analytics-contract.test.ts",
];

test(
  "analytics locale and ticketing suites execute without skipped tests",
  { timeout: 90000 },
  () => {
    assert.equal(process.versions.node.split(".")[0], "22", "NODE22_REQUIRED");
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const command = [
      resolve(root, "node_modules/vitest/vitest.mjs"),
      "run",
      ...files,
      "--no-file-parallelism",
      "--maxWorkers=1",
      "--no-cache",
      "--reporter=json",
    ];
    const result = spawnSync(process.execPath, command, {
      cwd: application,
      env,
      encoding: "utf8",
      timeout: 75000,
      maxBuffer: 4 * 1024 * 1024,
    });
    assert.equal(result.error, undefined, String(result.error));
    assert.equal(result.signal, null, "VITEST_TERMINATED_BY_SIGNAL");
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.success, true);
    assert.equal(report.numFailedTests, 0);
    assert.equal(report.numPendingTests, 0);
    assert.equal(report.numTodoTests, 0);
    assert.deepEqual(
      report.testResults.map((suite) => resolve(suite.name)).sort(),
      files.map((file) => resolve(application, file)).sort(),
    );
    const assertions = report.testResults.flatMap((suite) => {
      assert.equal(suite.status, "passed");
      assert.ok(suite.assertionResults.length > 0, "EMPTY_SUITE");
      return suite.assertionResults;
    });
    assert.ok(assertions.length > 0, "NO_TESTS_EXECUTED");
    assert.ok(
      assertions.some((item) =>
        item.fullName.includes("browser analytics live locale"),
      ),
      "LOCALE_REGRESSION_NOT_EXECUTED",
    );
    for (const item of assertions)
      assert.equal(item.status, "passed", item.fullName);
    assert.equal(report.numTotalTests, assertions.length);
    assert.equal(report.numPassedTests, assertions.length);
    console.log(
      JSON.stringify({
        node: process.version,
        report,
        files,
        passed: assertions.length,
        failed: report.numFailedTests,
        skipped: report.numPendingTests,
        todo: report.numTodoTests,
      }),
    );
  },
);
