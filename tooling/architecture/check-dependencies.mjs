#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const workspaceRoots = ["apps", "packages", "services", "tooling"];
const violations = [];

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function packageKind(relativeDir) {
  return relativeDir.split("/")[0];
}

function listWorkspacePackages() {
  const result = [];
  for (const base of workspaceRoots) {
    const basePath = path.join(root, base);
    if (!existsSync(basePath)) continue;
    for (const name of readdirSync(basePath)) {
      const dir = path.join(basePath, name);
      const manifest = path.join(dir, "package.json");
      if (statSync(dir).isDirectory() && existsSync(manifest)) {
        const relativeDir = path.relative(root, dir).replaceAll("\\", "/");
        result.push({ dir, relativeDir, manifest: readJson(manifest) });
      }
    }
  }
  return result;
}

const workspaces = listWorkspacePackages();
const byName = new Map(workspaces.map((entry) => [entry.manifest.name, entry]));

for (const workspace of workspaces) {
  const kind = packageKind(workspace.relativeDir);
  const allDependencies = {
    ...(workspace.manifest.dependencies ?? {}),
    ...(workspace.manifest.devDependencies ?? {}),
    ...(workspace.manifest.peerDependencies ?? {}),
    ...(workspace.manifest.optionalDependencies ?? {}),
  };

  for (const dependencyName of Object.keys(allDependencies)) {
    const target = byName.get(dependencyName);
    if (!target) continue;
    const targetKind = packageKind(target.relativeDir);

    if (kind === "packages" && targetKind === "apps") {
      violations.push(
        `${workspace.relativeDir} não pode depender de ${target.relativeDir}`,
      );
    }

    if (workspace.relativeDir === "packages/core") {
      violations.push(
        `packages/core não pode possuir dependência interna: ${dependencyName}`,
      );
    }

    if (
      workspace.relativeDir === "packages/shared" &&
      targetKind === "packages"
    ) {
      violations.push(
        `packages/shared deve permanecer agnóstico e não pode depender de ${dependencyName}`,
      );
    }

    if (
      ["packages/financial", "services/financial"].includes(
        workspace.relativeDir,
      ) &&
      (targetKind === "apps" ||
        ["packages/ordering", "services/ordering", "packages/business"].includes(
          target.relativeDir,
        ))
    ) {
      violations.push(
        `${workspace.relativeDir} deve permanecer independente de ${target.relativeDir}`,
      );
    }
  }
}

function walk(dir) {
  if (!existsSync(dir)) return [];
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (!["node_modules", "dist", "coverage", ".turbo"].includes(entry))
        files.push(...walk(full));
    } else if (/\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

for (const base of workspaceRoots) {
  for (const file of walk(path.join(root, base))) {
    const relative = path.relative(root, file).replaceAll("\\", "/");
    const source = readFileSync(file, "utf8");

    if (
      /from\s+['"][^'"]*(?:^|\/)apps\//m.test(source) ||
      /import\s*\(['"][^'"]*(?:^|\/)apps\//m.test(source)
    ) {
      violations.push(`${relative} importa diretamente código de apps/*`);
    }

    if (
      relative.startsWith("packages/") &&
      /from\s+['"][.]{1,2}\/[^'"]*(?:apps|services)\//m.test(source)
    ) {
      violations.push(`${relative} atravessa fronteira por import relativo`);
    }
  }
}

if (violations.length > 0) {
  console.error("Violações arquiteturais encontradas:\n");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log(`Fronteiras validadas em ${workspaces.length} workspaces.`);
