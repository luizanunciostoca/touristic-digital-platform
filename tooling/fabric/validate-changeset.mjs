#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateChangeSetV2 } from "../mdctl/changeset-v2.mjs";

export function validateLegacyChangeSet(manifest) {
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
  return manifest;
}

export function validateChangeSet(manifest) {
  return manifest?.schemaVersion === 2
    ? validateChangeSetV2(manifest)
    : validateLegacyChangeSet(manifest);
}

async function main(argv) {
  const path = argv[0];
  if (!path)
    throw new Error(
      "usage: node tooling/fabric/validate-changeset.mjs <manifest>",
    );
  const manifest = JSON.parse(await readFile(path, "utf8"));
  validateChangeSet(manifest);
  console.log(`ChangeSet valid: ${manifest.id} schema=${manifest.schemaVersion ?? 1}`);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main(process.argv.slice(2)).catch(() => {
    console.error("CHANGESET_VALIDATION_FAILED");
    process.exitCode = 1;
  });
}
