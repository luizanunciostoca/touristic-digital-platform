import { readFile } from "node:fs/promises";

const [manifestPath, bundlePath, resultsPath] = process.argv.slice(2);
if (!manifestPath || !bundlePath || !resultsPath) {
  throw new Error(
    "usage: node tooling/fabric/validate-evidence.mjs <manifest> <bundle> <results>",
  );
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const bundle = JSON.parse(await readFile(bundlePath, "utf8"));
const results = JSON.parse(await readFile(resultsPath, "utf8"));

if (manifest.id !== bundle.changeSetId)
  throw new Error("evidence belongs to another ChangeSet");
if (results.headSha !== bundle.headSha)
  throw new Error("evidence HEAD mismatch");
if (results.treeSha && results.treeSha !== bundle.treeSha)
  throw new Error("evidence tree mismatch");

const byName = new Map(
  (results.checks ?? []).map((check) => [check.name, check]),
);
for (const name of manifest.requiredEvidence) {
  const check = byName.get(name);
  if (!check) throw new Error(`required evidence missing: ${name}`);
  if (check.status !== "success")
    throw new Error(
      `required evidence not successful: ${name}=${check.status}`,
    );
}

console.log(`Evidence valid for ${manifest.id} @ ${bundle.headSha}`);
