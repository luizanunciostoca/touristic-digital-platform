import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

const LAB_MAIN = "39b1340795c4a6668f17f069ce09209590a6389c";
const LAB_SOURCE_PIN = "8bab6a4e182c063645b38d4cfed9fdc6a67d607d";
const EXPECTED_BLOBS = {
  "apps/morro-digital-platform/src/config/destination.test.ts": "083f668a247678a66eb8d821bd7afeb5d4d7b4f9",
  "docs/adr/0003-geospatial-provider-strategy.md": "b5def33df4ff20cd4930885c27e3a9703b0ce787",
  "packages/geospatial/src/index.ts": "c892066dfb3d4fa10249d0c286e0264f665bf46a",
  "packages/geospatial/src/routing-policy.test.ts": "e032feea5fd36dd663b1b6737f2dccbd120def10"
};

function gitBlob(path) {
  return execFileSync("git", ["hash-object", "--", path], {
    encoding: "utf8",
  }).trim();
}

test("Wave 5 promotion matches the certified LAB overlay byte-for-byte", () => {
  assert.match(LAB_MAIN, /^[0-9a-f]{40}$/u);
  assert.match(LAB_SOURCE_PIN, /^[0-9a-f]{40}$/u);
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
