import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL(
    "../../apps/morro-digital-platform/src/ux/css-cascade-contract.ts",
    import.meta.url,
  ),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
}).outputText;
const { resolveCssCascade } = await import(
  "data:text/javascript;base64," + Buffer.from(compiled).toString("base64")
);
const root = "/apps/morro-digital-platform/public/";
const direct = (name) => '<link rel="stylesheet" href="' + root + name + '">';
const entry =
  '<link rel="stylesheet" data-entry-css data-feature-css="' +
  root +
  'entry-css/features.css" href="' +
  root +
  'entry-css/home.css">';
const manifest = {
  version: 1,
  maxEntryBytes: 100000,
  sources: [
    "design-system-v2.css",
    "premium-ux-v2.css",
    "brand-v2.css",
    "tourist-shell-v2.css",
  ].map((name) => ({ file: (root + name).slice(1), sha256: "a".repeat(64) })),
};
test("direct stylesheet order remains authoritative before migration", () => {
  assert.deepEqual(
    resolveCssCascade(direct("styles.css") + direct("tourist-shell-v2.css")),
    [root + "styles.css", root + "tourist-shell-v2.css"],
  );
});
test("entry and feature bundles resolve to the exact declared source order", () => {
  assert.deepEqual(
    resolveCssCascade(entry, manifest),
    manifest.sources.map((row) => "/" + row.file),
  );
});
test("comments, templates and data-href do not prove active stylesheet loading", () => {
  for (const html of [
    "<!--" + direct("brand-v2.css") + "-->",
    "<template>" + direct("brand-v2.css") + "</template>",
    '<link rel="stylesheet" data-href="' + root + 'brand-v2.css">',
  ]) {
    assert.throws(() => resolveCssCascade(html), /DIRECT_CASCADE_INVALID/u);
  }
});
test("entry mode rejects missing, unknown and weakened manifests", () => {
  for (const value of [
    undefined,
    {},
    { ...manifest, version: 2 },
    { ...manifest, maxEntryBytes: 100001 },
  ]) {
    assert.throws(() => resolveCssCascade(entry, value), /MANIFEST/u);
  }
});
test("mixed direct and bundled styles, absent intent paths and duplicate entries fail closed", () => {
  for (const html of [
    entry + direct("brand-v2.css"),
    entry + entry,
    entry.replace("features.css", "unrelated.css"),
    direct("entry-css/home.css"),
  ]) {
    assert.throws(() => resolveCssCascade(html, manifest));
  }
});
test("manifest paths and source identities must be unique, local and bound to hashes", () => {
  for (const row of [
    { file: "../outside.css", sha256: "a".repeat(64) },
    {
      file: "apps/morro-digital-platform/public/../outside.css",
      sha256: "a".repeat(64),
    },
    {
      file: "apps/morro-digital-platform/public/entry-css/home.css",
      sha256: "a".repeat(64),
    },
    { ...manifest.sources[0], sha256: "" },
  ]) {
    assert.throws(
      () => resolveCssCascade(entry, { ...manifest, sources: [row] }),
      /SOURCE_INVALID/u,
    );
  }
  assert.throws(
    () =>
      resolveCssCascade(entry, {
        ...manifest,
        sources: [manifest.sources[0], manifest.sources[0]],
      }),
    /SOURCE_DUPLICATE/u,
  );
});
