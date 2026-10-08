import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import test from "node:test";

const LAB_CANDIDATE_SHA = "163c5ec846cdbdc07b34a29f728e430883d0dc6f";
const LAB_SOURCE_PIN = "8bab6a4e182c063645b38d4cfed9fdc6a67d607d";
const LAB_PROOF_RUN_ID = 37511242540;
const LAB_PROOF_ARTIFACT_SHA256 =
  "8d439c74d7f4bfedcba47aabe75fc0825270e96cfa4600e9e25cdabe7cf9e9c0";
const LAB_PREPARED_PATCH_SHA256 =
  "c028e494a5b3eeea1669c7aee78a5ba70e1600130b6494ab8acdd7dbcd9316a3";
const EXPECTED_BLOBS = {
  "apps/morro-digital-platform/src/config/destination.test.ts":
    "083f668a247678a66eb8d821bd7afeb5d4d7b4f9",
  "docs/adr/0003-geospatial-provider-strategy.md":
    "b5def33df4ff20cd4930885c27e3a9703b0ce787",
  "packages/geospatial/src/index.ts":
    "c892066dfb3d4fa10249d0c286e0264f665bf46a",
  "packages/geospatial/src/routing-policy.test.ts":
    "e032feea5fd36dd663b1b6737f2dccbd120def10",
};

function gitBlob(path) {
  return execFileSync("git", ["hash-object", "--", path], {
    encoding: "utf8",
  }).trim();
}

function preparedPatchDigest() {
  const paths = Object.keys(EXPECTED_BLOBS).sort();
  const patch = execFileSync(
    "git",
    ["diff", "--binary", LAB_SOURCE_PIN, "--", ...paths],
    { encoding: "buffer", maxBuffer: 16 * 1024 * 1024 },
  );
  return createHash("sha256").update(patch).digest("hex");
}

test("Wave 5 promotion matches the certified LAB overlay byte-for-byte", () => {
  assert.match(LAB_CANDIDATE_SHA, /^[0-9a-f]{40}$/u);
  assert.match(LAB_SOURCE_PIN, /^[0-9a-f]{40}$/u);
  assert.ok(Number.isInteger(LAB_PROOF_RUN_ID) && LAB_PROOF_RUN_ID > 0);
  assert.match(LAB_PROOF_ARTIFACT_SHA256, /^[0-9a-f]{64}$/u);
  assert.equal(preparedPatchDigest(), LAB_PREPARED_PATCH_SHA256);
  for (const [path, expected] of Object.entries(EXPECTED_BLOBS)) {
    assert.equal(gitBlob(path), expected, path);
  }
});

test("Wave 5 promotion binds all claimed functional source paths", () => {
  assert.deepEqual(Object.keys(EXPECTED_BLOBS).sort(), [
    "apps/morro-digital-platform/src/config/destination.test.ts",
    "docs/adr/0003-geospatial-provider-strategy.md",
    "packages/geospatial/src/index.ts",
    "packages/geospatial/src/routing-policy.test.ts",
  ]);
});
