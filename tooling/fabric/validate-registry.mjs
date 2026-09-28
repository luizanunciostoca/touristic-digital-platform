import { execFileSync } from "node:child_process";\nimport { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";\nimport { validateClaimRetirements } from "./claim-retirement.mjs";

const directory = ".morro/changesets";
const entries = (await readdir(directory)).filter(
  (name) => name.endsWith(".json") && name !== "schema.example.json",
);

const ids = new Set();

for (const name of entries) {
  const path = join(directory, name);
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
    if (!(field in manifest)) throw new Error(`${path}: missing ${field}`);
  }

  if (ids.has(manifest.id))
    throw new Error(`duplicate ChangeSet id: ${manifest.id}`);
  ids.add(manifest.id);

  if (!/^MD-[A-Z0-9-]+$/u.test(manifest.id))
    throw new Error(`${path}: invalid id`);
  if (!/^[0-9a-f]{40}$/u.test(manifest.baseSha))
    throw new Error(`${path}: invalid baseSha`);
  if (!["low", "medium", "high", "critical"].includes(manifest.risk)) {
    throw new Error(`${path}: invalid risk`);
  }
  if (manifest.stopAt !== "REMOTE_PROVEN") {
    throw new Error(`${path}: worker stopAt must be REMOTE_PROVEN`);
  }
  if (
    !Array.isArray(manifest.owns?.paths) ||
    manifest.owns.paths.length === 0
  ) {
    throw new Error(`${path}: owns.paths required`);
  }
  if (!Array.isArray(manifest.dependencies))
    throw new Error(`${path}: dependencies required`);
  if (
    !Array.isArray(manifest.requiredEvidence) ||
    manifest.requiredEvidence.length === 0
  ) {
    throw new Error(`${path}: requiredEvidence required`);
  }
}

console.log(`ChangeSet registry valid: ${entries.length} manifest(s)`);

const shaPattern = /^[0-9a-f]{40}$/u;
const zeroSha = "0".repeat(40);
const baseSha = String(process.env.BASE_SHA ?? "").trim();
const headSha =
  String(process.env.HEAD_SHA ?? "").trim() ||
  execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();

if (
  shaPattern.test(baseSha) &&
  baseSha !== zeroSha &&
  shaPattern.test(headSha)
) {
  const proof = validateClaimRetirements(".", { baseSha, headSha });
  console.log(
    `Claim retirement proof: ${proof.retired.length} retirement(s) validated.`,
  );
}
