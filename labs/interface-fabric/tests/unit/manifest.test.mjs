import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
const root = new URL("../../", import.meta.url);
const manifest = JSON.parse(
  await readFile(
    new URL("../../manifest/interfaces.json", import.meta.url),
    "utf8",
  ),
);
const contracts = JSON.parse(
  await readFile(
    new URL("../../manifest/integration-contracts.json", import.meta.url),
    "utf8",
  ),
);
test("catalog is exactly 112 unique interfaces", () => {
  assert.equal(manifest.length, 112);
  assert.equal(new Set(manifest.map((x) => x.id)).size, 112);
});
test("domain totals match reconciled audit", () => {
  const c = {};
  for (const x of manifest) c[x.domain] = (c[x.domain] || 0) + 1;
  assert.deepEqual(c, {
    "Tourist/Resident": 20,
    "Commerce/Booking": 13,
    "Business Portal / Morro Pro": 16,
    "Affiliate Portal": 13,
    "Admin CRM": 12,
    "Control Center": 24,
    "Growth / Gamification V2": 14,
  });
});
test("physical html exists for every manifest entry", async () => {
  const files = new Set(
    await readdir(new URL("../../interfaces/", import.meta.url)),
  );
  for (const x of manifest)
    assert.ok(files.has(x.id + ".html"), x.id + " HTML missing");
});
test("no interface is prematurely marked ISOLATED_COMPLETE", () => {
  assert.ok(
    manifest.every((x) => x.isolatedStatus === "IMPLEMENTED_UNVERIFIED"),
  );
  assert.ok(manifest.every((x) => x.proof.visual === "PENDING_SCREENSHOT"));
  assert.ok(manifest.every((x) => x.proof.accessibility === "PENDING_AXE"));
});
test("every interface has one integration contract", () => {
  assert.equal(Object.keys(contracts).length, 112);
  for (const x of manifest)
    assert.ok(contracts[x.id], x.id + " contract missing");
});
