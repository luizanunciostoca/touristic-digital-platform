import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("suite certification rejects empty, skipped, todo and failed executions", () => {
  const directory = mkdtempSync(join(tmpdir(), "learning-suite-"));
  const fixture = join(directory, "fixture.mjs");
  const driver = join(directory, "driver.mjs");
  const checker = new URL("./check.mjs", import.meta.url).href;
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  try {
    for (const [body, expected] of [
      ["test('proof', () => {});", 0],
      ["", 1],
      ["test.skip('proof', () => {});", 1],
      ["test.todo('proof');", 1],
      ["test('proof', () => { throw Error('regression'); });", 1],
      ["test('proof', () => new Promise(() => {}));", 1],
    ]) {
      writeFileSync(fixture, "import test from 'node:test';\n" + body);
      writeFileSync(
        driver,
        `import { certifyFiles } from ${JSON.stringify(checker)};\nawait certifyFiles([${JSON.stringify(fixture)}]);\n`,
      );
      const result = spawnSync(process.execPath, [driver], {
        encoding: "utf8",
        env,
      });
      assert.equal(result.status, expected, result.stderr);
      if (expected) assert.match(result.stderr, /LEARNING_PROOF_INCOMPLETE/);
    }
    writeFileSync(
      driver,
      `import { certifyFiles } from ${JSON.stringify(checker)};\nawait certifyFiles([]);\n`,
    );
    const result = spawnSync(process.execPath, [driver], {
      encoding: "utf8",
      env,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /LEARNING_TEST_FILES_REQUIRED/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
