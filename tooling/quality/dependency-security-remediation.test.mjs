import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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
