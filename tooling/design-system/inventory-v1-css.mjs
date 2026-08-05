import { promises as fs } from "node:fs";
import path from "node:path";

const source = path.resolve(process.argv[2] ?? ".audit/v1");
const output = path.resolve(
  process.argv[3] ?? "docs/migration/generated/v1-design-system-inventory.json",
);
const cssFiles = [];

async function walk(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (["node_modules", ".git", "dist", "coverage"].includes(entry.name))
      continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(fullPath);
    else if (/\.(css|scss|sass|less)$/i.test(entry.name))
      cssFiles.push(fullPath);
  }
}

function count(pattern, text) {
  return [...text.matchAll(pattern)].map((match) => match[0]);
}

await walk(source);
const inventory = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source,
  files: [],
  totals: {
    files: 0,
    colors: 0,
    fontFamilies: 0,
    mediaQueries: 0,
    animations: 0,
    customProperties: 0,
  },
};

for (const file of cssFiles.sort()) {
  const text = await fs.readFile(file, "utf8");
  const record = {
    path: path.relative(source, file),
    bytes: Buffer.byteLength(text),
    colors: [
      ...new Set(count(/#[0-9a-fA-F]{3,8}\b|(?:rgb|hsl)a?\([^)]*\)/g, text)),
    ].sort(),
    fontFamilies: [
      ...new Set(
        count(/font-family\s*:\s*[^;}]+/gi, text).map((value) =>
          value.split(":").slice(1).join(":").trim(),
        ),
      ),
    ].sort(),
    mediaQueries: count(/@media\b/g, text).length,
    animations: count(/@keyframes\s+[\w-]+/g, text),
    customProperties: [
      ...new Set(
        count(/--[\w-]+\s*:/g, text).map((value) => value.slice(0, -1)),
      ),
    ].sort(),
    importantDeclarations: count(/!important\b/g, text).length,
    zIndexes: [...new Set(count(/z-index\s*:\s*-?\d+/gi, text))].sort(),
  };
  inventory.files.push(record);
  inventory.totals.colors += record.colors.length;
  inventory.totals.fontFamilies += record.fontFamilies.length;
  inventory.totals.mediaQueries += record.mediaQueries;
  inventory.totals.animations += record.animations.length;
  inventory.totals.customProperties += record.customProperties.length;
}

inventory.totals.files = inventory.files.length;
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, `${JSON.stringify(inventory, null, 2)}\n`);
console.log(
  `Inventário criado: ${output} (${inventory.totals.files} arquivos CSS)`,
);
