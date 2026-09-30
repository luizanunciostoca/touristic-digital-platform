import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
const root = new URL("../", import.meta.url);
const manifest = JSON.parse(
  await readFile(
    new URL("../manifest/interfaces.json", import.meta.url),
    "utf8",
  ),
);
const contracts = JSON.parse(
  await readFile(
    new URL("../manifest/integration-contracts.json", import.meta.url),
    "utf8",
  ),
);
const html = new Set(await readdir(new URL("../interfaces/", import.meta.url)));
const failures = [];
if (manifest.length !== 112) failures.push("MANIFEST_COUNT");
if (new Set(manifest.map((x) => x.id)).size !== 112)
  failures.push("DUPLICATE_ID");
for (const x of manifest) {
  if (!html.has(x.id + ".html")) failures.push("HTML_MISSING:" + x.id);
  if (!contracts[x.id]) failures.push("CONTRACT_MISSING:" + x.id);
  if (x.isolatedStatus === "ISOLATED_COMPLETE")
    failures.push("PREMATURE_COMPLETE:" + x.id);
}
const changedOutsideLab = process.env.IF_CHANGED_OUTSIDE_LAB === "true";
if (changedOutsideLab) failures.push("LEGACY_FILE_MODIFIED");
if (failures.length) {
  console.error(JSON.stringify({ status: "FAIL", failures }, null, 2));
  process.exit(1);
}
console.log(
  JSON.stringify(
    {
      status: "PASS",
      interfaces: manifest.length,
      contracts: Object.keys(contracts).length,
      html: [...html].filter((x) => x.endsWith(".html")).length,
      legacyFileModified: false,
    },
    null,
    2,
  ),
);
