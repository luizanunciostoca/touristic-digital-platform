import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

const sourceRoot = path.resolve(process.argv[2] ?? ".audit/v1");
const entryFile = path.resolve(sourceRoot, process.argv[3] ?? "css/main.css");
const targetRoot = path.resolve(
  process.argv[4] ?? "packages/design-system/src/legacy/styles",
);
const manifestPath = path.resolve(
  process.argv[5] ?? "packages/design-system/src/legacy/manifest.json",
);

const importPattern =
  /@import\s+(?:url\()?\s*["']([^"']+)["']\s*\)?\s*;/gi;
const visited = new Set();
const orderedFiles = [];

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

async function assertFile(filePath) {
  const stats = await fs.stat(filePath).catch(() => null);
  if (!stats?.isFile()) {
    throw new Error(`Arquivo CSS obrigatório não encontrado: ${filePath}`);
  }
}

async function collect(filePath) {
  const normalized = path.normalize(filePath);
  if (visited.has(normalized)) return;

  await assertFile(normalized);
  visited.add(normalized);

  const css = await fs.readFile(normalized, "utf8");
  orderedFiles.push({ filePath: normalized, css });

  for (const match of css.matchAll(importPattern)) {
    const reference = match[1].trim();
    if (/^(?:https?:|data:|\/\/)/i.test(reference)) continue;

    const importedPath = path.resolve(path.dirname(normalized), reference);
    if (!importedPath.startsWith(sourceRoot + path.sep)) {
      throw new Error(
        `Importação fora da raiz permitida: ${reference} em ${normalized}`,
      );
    }

    await collect(importedPath);
  }
}

await assertFile(entryFile);
await collect(entryFile);

await fs.rm(targetRoot, { recursive: true, force: true });
await fs.mkdir(targetRoot, { recursive: true });

const files = [];
for (const { filePath, css } of orderedFiles) {
  const relativePath = path.relative(sourceRoot, filePath);
  const targetPath = path.join(targetRoot, relativePath);

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, css);

  files.push({
    sourcePath: toPosix(relativePath),
    snapshotPath: toPosix(path.relative(path.dirname(manifestPath), targetPath)),
    bytes: Buffer.byteLength(css),
    sha256: sha256(css),
  });
}

const aggregateHash = sha256(
  files
    .map(({ sourcePath, sha256: hash }) => `${sourcePath}:${hash}`)
    .join("\n"),
);

const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  sourceRoot: toPosix(path.relative(process.cwd(), sourceRoot)),
  entryFile: toPosix(path.relative(sourceRoot, entryFile)),
  snapshotRoot: toPosix(path.relative(process.cwd(), targetRoot)),
  fileCount: files.length,
  aggregateSha256: aggregateHash,
  files,
};

await fs.mkdir(path.dirname(manifestPath), { recursive: true });
await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(
  `Snapshot CSS criado: ${files.length} arquivos, SHA-256 ${aggregateHash}`,
);
