import { readFile } from "node:fs/promises";

const path = process.argv[2];
if (!path)
  throw new Error(
    "usage: node tooling/fabric/validate-changeset.mjs <manifest>",
  );

const manifest = JSON.parse(await readFile(path, "utf8"));
const required = [
  "id",
  "baseSha",
  "branch",
  "state",
  "risk",
  "owns",
  "dependencies",
  "requiredEvidence",
  "stopAt",
];

for (const field of required) {
  if (!(field in manifest)) throw new Error(`ChangeSet missing ${field}`);
}

if (!/^MD-[A-Z0-9-]+$/u.test(manifest.id))
  throw new Error("invalid ChangeSet id");
if (!/^[0-9a-f]{40}$/u.test(manifest.baseSha))
  throw new Error("baseSha must be exact 40-char SHA");
if (!["low", "medium", "high", "critical"].includes(manifest.risk))
  throw new Error("invalid risk");
if (manifest.stopAt !== "REMOTE_PROVEN")
  throw new Error("Worker ChangeSet must stop at REMOTE_PROVEN");
if (!Array.isArray(manifest.owns?.paths) || manifest.owns.paths.length === 0)
  throw new Error("owns.paths required");
if (!Array.isArray(manifest.dependencies))
  throw new Error("dependencies must be an array");
if (
  !Array.isArray(manifest.requiredEvidence) ||
  manifest.requiredEvidence.length === 0
)
  throw new Error("requiredEvidence required");

console.log(`ChangeSet valid: ${manifest.id}`);
