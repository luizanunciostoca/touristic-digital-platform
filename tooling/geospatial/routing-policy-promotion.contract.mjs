import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import test from "node:test";

// Selectively disclosed Git commit/tree objects establish a cryptographic path
// from the immutable LAB revision to the promoted blobs without CI access to
// the private LAB repository. No unrelated source file contents are embedded.
const LAB_MAIN = "39b1340795c4a6668f17f069ce09209590a6389c";
const LAB_SOURCE_PIN = "8bab6a4e182c063645b38d4cfed9fdc6a67d607d";
const SOURCE_CONFIG_PATH = "manuals-remediation-wave5.config.json";
const OVERLAY_ROOT = "overlays/routing-policy-005/";
const PRODUCT_PATHS = Object.freeze([
  "apps/morro-digital-platform/src/config/destination.test.ts",
  "docs/adr/0003-geospatial-provider-strategy.md",
  "packages/geospatial/src/index.ts",
  "packages/geospatial/src/routing-policy.test.ts",
]);

const PROOF = {
  labCommit:
    "dHJlZSA4NTNmODQ4OWRlZmUwZTUzZWE1MjBhNDY5NGE2NDE5MWU2NGU0OGVhCnBhcmVudCA4NWRhMmI0MGEyZmVlNmQxMDU5NWI5YjQyYjA5OGIwYzA0ODA2M2I1CnBhcmVudCAyY2VjZDMzY2E5MjI0OTRkZDc0NDA2NzFmYjZkYzk4ZTUxNGJkYmY1CmF1dGhvciBJZGVib29rIERpZ2l0YWwgPGx1aXphbnVuY2lvc3RvY2FAZ21haWwuY29tPiAxNzkxMzk1MTA0IC0wMzAwCmNvbW1pdHRlciBHaXRIdWIgPG5vcmVwbHlAZ2l0aHViLmNvbT4gMTc5MTM5NTEwNCAtMDMwMApncGdzaWcgLS0tLS1CRUdJTiBQR1AgU0lHTkFUVVJFLS0tLS0KIAogd3NGY0JBQUJDQUFRQlFKcXhvVWdDUkMxYVE3dXU1VWhsQUFBR2FrUUFFdWtYREZCZHJhaVVRcnZTZlZMSklIbAogZEg0SVJQb3VwakorTmQ0SG5xdTYvQkFFb0ltRTBnTkFDVTlkTFJET3pVWExrZXdRNmkwSTZwdjUwSm1DQzJ2RwogaE5BeVdSdjZUbVd1SnlFbzRjTVkzQkNkbFRWbmNXOGZuZFBQRnZjYWVBSWxBOGlKME9Qamt0dXJTZGZYZXVjeAogWGJERGhJaUthdlI0eTlFN1g4SkxDellpUTJXRkZsdWZiZ1RBQnpDaDQ4ODZnRWF4K2hXcGdVcWlsb21Tc1c4cwogQXFHU3U2UUhEK0tYSitIZDhtQVdRNnBWSTcyT2ZObmgxY2tmKzZJY1NJNTNrVHNwazRPSGRFV3ZIRHJ6VDRjSQogc0tUV3Y1c0FpTFFGNEVJY1RVVGVIdUtTbk5jZ1J5dk9YN00xcjZaa1FvN0pidWlSMHNpWFpLMk54eTAzOGl5dgogZVdpR3lZYlhGOGZJMnkzMk1jdkp0K1pia3FiREFTVjdwWWpZd0VNOUdtNm11K0t5U05rVHY4SnRlVWIwdFFHRAogc2xobkJ2SmZBcUg4bkJ0OVg1ekdwL3Q3eS94alg5TTF3WFFwQXJWaDN4V2ZLZEVFM1RLRnhSVFh1Yk5tbFEvVQogeHp3QzQ1TkpLU2J3Z1FCNUtkYmtMVzF2ZW9hbHZvUTJYdlpqOVdOcHVXQ1lONmZvT3NkemRDSjk0dVVKdVhBRwogU3BLVHFPamR5TlZEajJJQnlPRHBpMS9yeTQyOFhFakhINlV6VHpyeG1lanNtVm83NTczVmVvUG15d1YvVUdwVAogUTB0NzRiQ1pSSFVHcWdjcXJiMjRMTG9iR1RBZVpaWi9uZmlhZmxJM29TeHpxdm85cGV4eUU3MkN5R2dvazh0SgogMHJCSGR4aTZTQjdUOEV1Wjl3U04KID1EOHZYCiAtLS0tLUVORCBQR1AgU0lHTkFUVVJFLS0tLS0KIAoKTWVyZ2UgcHVsbCByZXF1ZXN0ICM0NCBmcm9tIGx1aXphbnVuY2lvc3RvY2EvbGFiL21hbnVhbHMtd2F2ZTYtcG9zdG1lcmdlLXJlbWVkaWF0aW9uLXIyLTIwMjYxMDA2CgpbTEFCXSBXYXZlIDYgUjIgcmVzZXJ2YXRpb24gcmV0cnkgc2FmZXR5",
  labConfig:
    "ewogICJzY2hlbWFWZXJzaW9uIjogMSwKICAia2luZCI6ICJNRExBQl9NQU5VQUxTX1JFTUVESUFUSU9OIiwKICAic291cmNlIjogImh0dHBzOi8vZ2l0aHViLmNvbS9sdWl6YW51bmNpb3N0b2NhL3RvdXJpc3RpYy1kaWdpdGFsLXBsYXRmb3JtLmdpdCIsCiAgInNvdXJjZVJlZiI6ICJyZWZzL2hlYWRzL21haW4iLAogICJzb3VyY2VTaGEiOiAiOGJhYjZhNGUxODJjMDYzNjQ1YjM4ZDRjZmVkOWZkYzZhNjdkNjA3ZCIsCiAgIm5vUHJvZHVjdGlvbldyaXRlcyI6IHRydWUsCiAgImNhbm9uaWNhbEludGVncmF0aW9uQXV0aG9yaXplZCI6IGZhbHNlLAogICJwcm9kdWN0aW9uQXV0aG9yaXplZCI6IGZhbHNlLAogICJyZWFsTW9uZXlFbmFibGVkIjogZmFsc2UsCiAgIndhdmUiOiAicm91dGluZy1wb2xpY3ktMDA1IiwKICAiY2hhbmdlcyI6IFsKICAgICJHRU9TUEFUSUFMLVJPVVRJTkctUE9MSUNZLVJVTlRJTUUtQUxJR05NRU5UIiwKICAgICJHRU9TUEFUSUFMLUFEUi1SVU5USU1FLUFMSUdOTUVOVCIsCiAgICAiR0VPU1BBVElBTC1ST1VUSU5HLVBPTElDWS1SRUdSRVNTSU9OIgogIF0KfQo=",
  treeObjects: {
    "853f8489defe0e53ea520a4694a64191e64e48ea":
      "NDAwMDAgLmdpdGh1YgCDBV7PLqCgGb6CO37mveGE53YouTEwMDY0NCAuZ2l0aWdub3JlAN96iqjiCiX6i/J+bFht1asMiVwnMTAwNjQ0IFJFQURNRS5tZABoSodMX0mu/XY3tmnp+jkBy54XTjEwMDY0NCBjdXJyZW50LW1haW4tY2VydGlmaWNhdGlvbi5jb25maWcuanNvbgAVW2Q9/8LJRiRYezLcguwsvrE2PzQwMDAwIGRvY3MAbnPLUdxOm7NSCTagMALKE5yqflU0MDAwMCBldmlkZW5jZQAP3wxzv+oKzGRS0b36rshDwXtW8jEwMDY0NCBsYWIuY29uZmlnLmpzb24AM9Lq7YuAc3brSKcNGni/uk2+M+U0MDAwMCBsYWJzAEdUGkhuGFlKEdynPy3tJDwQ18/QMTAwNjQ0IG1hbnVhbHMtcmVtZWRpYXRpb24td2F2ZTIuY29uZmlnLmpzb24A6uY00Vw6uzfNRW5lTB23B036gV0xMDA2NDQgbWFudWFscy1yZW1lZGlhdGlvbi13YXZlMy5jb25maWcuanNvbgDQ+to04/mOqC7AJ0EGLlgOtSeGDDEwMDY0NCBtYW51YWxzLXJlbWVkaWF0aW9uLXdhdmU0LmNvbmZpZy5qc29uAM2FFw125wUWi14RXAcT1sSUT+hcMTAwNjQ0IG1hbnVhbHMtcmVtZWRpYXRpb24td2F2ZTUuY29uZmlnLmpzb24AC473MeJ1Q5ueytRtejxVFoVhSAExMDA2NDQgbWFudWFscy1yZW1lZGlhdGlvbi13YXZlNi5jb25maWcuanNvbgAEhGfIPREoWBgTj/pAW82QZnarVDEwMDY0NCBtYW51YWxzLXJlbWVkaWF0aW9uLmNvbmZpZy5qc29uAOsEoI+M6vceOEHj0TF84kylOMObNDAwMDAgb3ZlcmxheXMA+8rtvQfeapmno+k/nhyfEWPDSFg0MDAwMCBwaGFzZTE3AHk7o5Ro+u8Kw66pX+NXBF9zF1m4NDAwMDAgc2NyaXB0cwCqNnpFUjgf0OKB8HKrdbY5IqXnSjQwMDAwIHZlcnRpY2FsLXNsaWNlcwDwp4e1TftgCdtJNADEEp+GWtBdxw==",
    fbcaedbd07de6a99a7a3e93f9e1c9f1163c34858:
      "MTAwNjQ0IGFzc2lzdGFudC1yb290LWZvcm1hdC1vbmx5LnBhdGNoAO6LRo6G8ILwx+bD2gRW1XVRy4TvNDAwMDAgY2Fub25pY2FsLWlkZW50aXR5LTAwMgA31g5lKXkkF9dI8GEitzIPJO/T2TQwMDAwIGZvdW5kYXRpb24tc2VjdXJpdHktMDAxAIeZqfKQ/7gbxrEmbJVlB74f5dxiNDAwMDAgbm90aWZpY2F0aW9ucy1zYWZldHktMDAzAAOC35RIlYLRSfav9QkxxmzAQBHgNDAwMDAgcGVyZm9ybWFuY2UtcmVsaWFiaWxpdHktMDA0AF7xx8erc3e26Dl/W0x1ywB0SdZjNDAwMDAgcmVzdGF1cmFudC1jb21tZXJjZS0wMDYAG7m93Ak4pyEKnc13oUW3pjruuYs0MDAwMCByb3V0aW5nLXBvbGljeS0wMDUAOUsVuKr51IxwI1/C2OiPOk+6c54xMDA2NDQgdG91cmlzdC1wMDgtd2NhZy1yZXBhaXIuY3NzAHJ1R4yvUjK5o0Og3+jBY2pczGcd",
    "394b15b8aaf9d48c70235fc2d8e88f3a4fba739e":
      "NDAwMDAgYXBwcwArQmte5s/N3GMUAi4xPHPz/EsejDQwMDAwIGRvY3MAGGOu2EC4BQ+KFb6n+9ZX1/lJyao0MDAwMCBwYWNrYWdlcwBx+mopzY1PFM+8XXMWjwC6LCzPjw==",
    "2b426b5ee6cfcddc6314022e313c73f3fc4b1e8c":
      "NDAwMDAgbW9ycm8tZGlnaXRhbC1wbGF0Zm9ybQAS0dr5OLS4TTUdRIbeX5xeZjTiKw==",
    "12d1daf938b4b84d351d4486de5f9c5e6634e22b":
      "NDAwMDAgc3JjAJEIa1I5EGAZM8XuJgEc3zwtu6ZX",
    "91086b523910601933c5ee26011cdf3c2dbba657":
      "NDAwMDAgY29uZmlnANpYm1/mxnTg5lUDwmBQzBep7yTL",
    da589b5fe6c674e0e65503c26050cc17a9ef24cb:
      "MTAwNjQ0IGRlc3RpbmF0aW9uLnRlc3QudHMACD9miiR2eKZuuNghvXr+tdTXtPk=",
    "1863aed840b8050f8a15bea7fbd657d7f949c9aa":
      "NDAwMDAgYWRyAEFdJL31UCmR4R9bLJiY93cJywge",
    "415d24bdf5502991e11f5b2c9898f77709cb081e":
      "MTAwNjQ0IDAwMDMtZ2Vvc3BhdGlhbC1wcm92aWRlci1zdHJhdGVneS5tZAC13vM99P8gzUkwiFwn46lwOwznhw==",
    "71fa6a29cd8d4f14cfbc5d73168f00ba2c2ccf8f":
      "NDAwMDAgZ2Vvc3BhdGlhbABcLqTna+k/SMwTDGg1l440YQW3zQ==",
    "5c2ea4e76be93f48cc130c6835978e346105b7cd":
      "NDAwMDAgc3JjALXpBGj4WJEb8Gn+ruB/QeLc7PHC",
    b5e90468f858911bf069feaee07f41e2dcecf1c2:
      "MTAwNjQ0IGluZGV4LnRzAMiSBm37PU+hAknQwobgJk9mW/RqMTAwNjQ0IHJvdXRpbmctcG9saWN5LnRlc3QudHMA4DL+6l/TbdZjsbZzfy3MvRIN7xA=",
  },
};

function gitObjectHash(type, bytes) {
  return createHash("sha1")
    .update(Buffer.from(type + " " + bytes.length + "\0"))
    .update(bytes)
    .digest("hex");
}

function verifiedCommitTree() {
  const commit = Buffer.from(PROOF.labCommit, "base64");
  assert.equal(
    gitObjectHash("commit", commit),
    LAB_MAIN,
    "LAB_COMMIT_HASH_MISMATCH",
  );
  const match = /^tree ([0-9a-f]{40})$/mu.exec(commit.toString("utf8"));
  assert.ok(match, "LAB_COMMIT_TREE_MISSING");
  return match[1];
}

function verifiedTree(sha) {
  assert.match(sha, /^[0-9a-f]{40}$/u, "LAB_TREE_SHA_INVALID");
  assert.ok(
    Object.hasOwn(PROOF.treeObjects, sha),
    "LAB_TREE_PROOF_MISSING:" + sha,
  );
  const bytes = Buffer.from(PROOF.treeObjects[sha], "base64");
  assert.equal(
    gitObjectHash("tree", bytes),
    sha,
    "LAB_TREE_HASH_MISMATCH:" + sha,
  );
  const entries = new Map();
  let offset = 0;
  while (offset < bytes.length) {
    const modeEnd = bytes.indexOf(0x20, offset);
    const nameEnd = bytes.indexOf(0, modeEnd + 1);
    assert.ok(modeEnd > offset && nameEnd > modeEnd, "LAB_TREE_MALFORMED");
    assert.ok(nameEnd + 21 <= bytes.length, "LAB_TREE_TRUNCATED");
    const mode = bytes.toString("utf8", offset, modeEnd);
    const name = bytes.toString("utf8", modeEnd + 1, nameEnd);
    const objectSha = bytes.subarray(nameEnd + 1, nameEnd + 21).toString("hex");
    assert.ok(!entries.has(name), "LAB_TREE_DUPLICATE_ENTRY:" + name);
    entries.set(name, { mode, objectSha });
    offset = nameEnd + 21;
  }
  return entries;
}

function pinnedLabBlob(path) {
  assert.ok(!path.startsWith("/") && !path.includes(".."), "LAB_PATH_INVALID");
  const segments = path.split("/");
  let tree = verifiedCommitTree();
  for (const [index, segment] of segments.entries()) {
    const entry = verifiedTree(tree).get(segment);
    assert.ok(entry, "LAB_PATH_NOT_IN_PINNED_COMMIT:" + path);
    if (index === segments.length - 1) {
      assert.ok(["100644", "100755"].includes(entry.mode), "LAB_LEAF_NOT_FILE");
      return entry.objectSha;
    }
    assert.ok(["40000", "040000"].includes(entry.mode), "LAB_PARENT_NOT_TREE");
    tree = entry.objectSha;
  }
  throw new Error("LAB_PATH_EMPTY");
}

function localBlob(path) {
  return execFileSync("git", ["hash-object", "--", path], {
    encoding: "utf8",
  }).trim();
}

test("certified LAB Git objects are bound to the immutable LAB commit", () => {
  assert.match(LAB_SOURCE_PIN, /^[0-9a-f]{40}$/u);
  assert.match(verifiedCommitTree(), /^[0-9a-f]{40}$/u);
  for (const [sha, base64] of Object.entries(PROOF.treeObjects)) {
    assert.equal(gitObjectHash("tree", Buffer.from(base64, "base64")), sha);
  }
  const config = Buffer.from(PROOF.labConfig, "base64");
  assert.equal(
    gitObjectHash("blob", config),
    pinnedLabBlob(SOURCE_CONFIG_PATH),
  );
  const parsed = JSON.parse(config.toString("utf8"));
  assert.equal(parsed.sourceSha, LAB_SOURCE_PIN);
  assert.equal(parsed.wave, "routing-policy-005");
  assert.equal(parsed.noProductionWrites, true);
});

test("Wave 5 promotion matches blobs resolved from the pinned LAB revision", () => {
  for (const path of PRODUCT_PATHS) {
    const sourceBlob = pinnedLabBlob(OVERLAY_ROOT + path);
    assert.equal(
      localBlob(path),
      sourceBlob,
      "LAB_PRODUCT_BLOB_MISMATCH:" + path,
    );
  }
});

test("Wave 5 proof covers every claimed functional source path", () => {
  assert.deepEqual([...PRODUCT_PATHS].sort(), [
    "apps/morro-digital-platform/src/config/destination.test.ts",
    "docs/adr/0003-geospatial-provider-strategy.md",
    "packages/geospatial/src/index.ts",
    "packages/geospatial/src/routing-policy.test.ts",
  ]);
});

test("altering an attested LAB Git tree invalidates its source identity", () => {
  const root = verifiedCommitTree();
  const bytes = Buffer.from(PROOF.treeObjects[root], "base64");
  const altered = Buffer.from(bytes);
  altered[0] ^= 1;
  assert.notEqual(gitObjectHash("tree", altered), root);
});
