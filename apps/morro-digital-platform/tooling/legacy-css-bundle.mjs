import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const LEGACY_CSS_ENTRYPOINTS = Object.freeze([
  "legacy/checkpoint.css",
  "legacy/index-inline.css",
]);

const publicRoot = fileURLToPath(new URL("../public/", import.meta.url));
const outputPath = path.resolve(publicRoot, "legacy.bundle.css");
const importPattern =
  /@import\s+(?:url\(\s*)?["']([^"']+)["']\s*\)?\s*;/gu;
const urlPattern = /url\(\s*(["']?)([^"'()]+)\1\s*\)/gu;

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function publicUrlFor(targetPath) {
  const relative = toPosix(path.relative(publicRoot, targetPath));
  return `/apps/morro-digital-platform/public/${relative}`;
}

function isExternalOrAbsoluteUrl(value) {
  const normalized = value.trim();
  return (
    normalized.startsWith("/") ||
    normalized.startsWith("#") ||
    normalized.startsWith("data:") ||
    normalized.startsWith("http:") ||
    normalized.startsWith("https:") ||
    normalized.startsWith("//") ||
    normalized.startsWith("var(")
  );
}

function rewriteRelativeUrls(source, sourcePath) {
  return source.replace(urlPattern, (match, quote, rawValue) => {
    const value = String(rawValue).trim();
    if (isExternalOrAbsoluteUrl(value)) return match;
    const resolved = path.resolve(path.dirname(sourcePath), value);
    const nextQuote = quote || '"';
    return `url(${nextQuote}${publicUrlFor(resolved)}${nextQuote})`;
  });
}

async function inlineCssFile(relativePath, stack = []) {
  const absolutePath = path.resolve(publicRoot, relativePath);
  const normalizedRelative = toPosix(path.relative(publicRoot, absolutePath));
  if (!normalizedRelative || normalizedRelative.startsWith("../")) {
    throw new Error(`Legacy CSS import escapes public root: ${relativePath}`);
  }
  if (stack.includes(absolutePath)) {
    throw new Error(
      `Legacy CSS import cycle: ${[...stack, absolutePath].join(" -> ")}`,
    );
  }

  const source = (await readFile(absolutePath, "utf8")).replace(/\r\n?/gu, "\n");
  const nextStack = [...stack, absolutePath];
  let cursor = 0;
  let output = `\n/* source: ${normalizedRelative} */\n`;

  for (const match of source.matchAll(importPattern)) {
    const index = match.index ?? 0;
    output += rewriteRelativeUrls(source.slice(cursor, index), absolutePath);
    const importTarget = match[1];
    if (!importTarget) {
      throw new Error(`Unsupported empty @import in ${normalizedRelative}`);
    }
    const resolvedImport = path.resolve(path.dirname(absolutePath), importTarget);
    const relativeImport = toPosix(path.relative(publicRoot, resolvedImport));
    output += await inlineCssFile(relativeImport, nextStack);
    cursor = index + match[0].length;
  }

  output += rewriteRelativeUrls(source.slice(cursor), absolutePath);
  return output.endsWith("\n") ? output : output + "\n";
}

export async function buildLegacyCssBundle() {
  const parts = [
    "/*",
    " * GENERATED FILE — Morro Digital V1 legacy CSS runtime bundle.",
    " * Source evidence remains under public/legacy/** and is never rewritten.",
    " * Regenerate with: node apps/morro-digital-platform/tooling/legacy-css-bundle.mjs",
    " */",
    "",
  ];

  for (const entrypoint of LEGACY_CSS_ENTRYPOINTS) {
    parts.push(await inlineCssFile(entrypoint));
  }

  return parts.join("\n");
}

export async function checkLegacyCssBundle() {
  const expected = await buildLegacyCssBundle();
  const actual = await readFile(outputPath, "utf8");
  if (actual !== expected) {
    throw new Error(
      "legacy.bundle.css is stale. Regenerate the deterministic legacy CSS bundle.",
    );
  }
}

async function main() {
  if (process.argv.includes("--stdout")) {
    process.stdout.write(await buildLegacyCssBundle());
    return;
  }
  if (process.argv.includes("--check")) {
    await checkLegacyCssBundle();
    process.stdout.write("legacy.bundle.css deterministic check: PASS\n");
    return;
  }
  const bundle = await buildLegacyCssBundle();
  await writeFile(outputPath, bundle, "utf8");
  process.stdout.write(
    `legacy.bundle.css written (${Buffer.byteLength(bundle)} bytes)\n`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
