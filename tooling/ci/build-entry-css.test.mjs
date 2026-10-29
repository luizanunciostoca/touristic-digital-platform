import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  compileBundles,
  parseRuleRanges,
  selectEntryRules,
  rewriteAssetUrls,
} from "./build-entry-css.mjs";

const require = createRequire(
  new URL("../../apps/morro-digital-platform/package.json", import.meta.url),
);
const postcss = require("postcss");
const digest = (text) => createHash("sha256").update(text).digest("hex");
const file = "apps/morro-digital-platform/public/styles.css";
const manifestFor = (text, selection = {}) => ({
  version: 1,
  maxEntryBytes: 100000,
  sources: [
    {
      file,
      sha256: digest(text),
      ruleCount: 1,
      keep: "0",
      hide: "",
      ...selection,
    },
  ],
});

test("the real entry selection retains complete weather failure and loading rules", async () => {
  const manifest = JSON.parse(
    await readFile(
      new URL("./entry-css-manifest.json", import.meta.url),
      "utf8",
    ),
  );
  const source = manifest.sources.find((row) =>
    row.file.endsWith("/tourist-shell-v2.css"),
  );
  const css = await readFile(
    new URL("../../" + source.file, import.meta.url),
    "utf8",
  );
  const weatherStates = (ast) => {
    const rules = [];
    ast.walkRules((rule) => {
      if (
        rule.selector.includes(".weather-error") ||
        rule.selector.includes('[data-weather-state="loading"]')
      )
        rules.push(rule.toString());
    });
    return rules;
  };
  const expected = weatherStates(postcss.parse(css));
  assert.ok(expected.length > 0);
  assert.deepEqual(
    weatherStates(selectEntryRules(postcss.parse(css), source)),
    expected,
  );
});

test("coverage ranges reject malformed, overlapping, and stale indices", () => {
  assert.deepEqual([...parseRuleRanges("0-2,4", 5)], [0, 1, 2, 4]);
  for (const ranges of ["2-1", "0,0", "0-2,2", "5", "-1", "1.5", "01", "0;1"]) {
    assert.throws(() => parseRuleRanges(ranges, 5));
  }
});

test("entry extraction preserves ordered conditional rules and only hidden-state declarations", () => {
  const ast = postcss.parse(
    ".home{color:red}@media(min-width:1px){.home{color:blue}.modal{display:none;color:pink}.extra{color:green}}",
  );
  const selected = selectEntryRules(ast, {
    ruleCount: 4,
    keep: "0-1",
    hide: "2",
  }).toString();
  assert.equal(
    selected,
    ".home{color:red}@media(min-width:1px){.home{color:blue}.modal{display:none}}",
  );
  assert.throws(
    () =>
      selectEntryRules(postcss.parse(".x{color:red}"), {
        ruleCount: 1,
        keep: "",
        hide: "0",
      }),
    /HIDING_RULE_CHANGED/u,
  );
  assert.throws(
    () =>
      selectEntryRules(postcss.parse(".x{}"), {
        ruleCount: 2,
        keep: "",
        hide: "",
      }),
    /RULE_COUNT_CHANGED/u,
  );
});

test("bundled assets retain their original URL base and external URLs", () => {
  const ast = postcss.parse(
    '.a{background:url("../assets/a.svg?v=1#icon");mask:url(https://cdn.example/a.svg);cursor:url(data:image/png;base64,ABC);filter:url(#filter)}',
  );
  rewriteAssetUrls(
    ast,
    "apps/morro-digital-platform/public/legacy/example.css",
  );
  assert.match(
    ast.toString(),
    /\/apps\/morro-digital-platform\/public\/assets\/a\.svg\?v=1#icon/u,
  );
  assert.match(ast.toString(), /url\(https:\/\/cdn\.example\/a\.svg\)/u);
  assert.match(ast.toString(), /url\(data:image\/png;base64,ABC\)/u);
  assert.match(ast.toString(), /url\(#filter\)/u);
});

test("entry and full bundle are deterministic and retain the complete deferred cascade", async () => {
  const css =
    ".home{color:red;animation:pulse 1s}.modal{display:none;color:blue}@keyframes pulse{from{opacity:0}to{opacity:1}}";
  const manifest = manifestFor(css, { ruleCount: 2, keep: "0", hide: "1" });
  const first = await compileBundles(manifest, async () => css);
  assert.deepEqual(await compileBundles(manifest, async () => css), first);
  assert.match(first.home, /\.modal\{display:none\}/u);
  assert.doesNotMatch(first.home, /blue/u);
  assert.match(first.features, /(?:blue|#00f)/u);
  assert.match(first.home, /@keyframes pulse/u);
  assert.equal(first.report.home.sha256, digest(first.home));
});

test("changed sources, imports, invalid paths, and weakened budgets fail closed", async () => {
  const css = ".home{color:red}";
  const imported = '@import "other.css";.home{color:red}';
  const traversed = manifestFor(css);
  traversed.sources[0].file = file.replace("styles.css", "../styles.css");
  for (const [manifest, source, expected] of [
    [manifestFor(css), css + " ", /SOURCE_CHANGED/u],
    [manifestFor(imported), imported, /IMPORT_REQUIRES_REVIEW/u],
    [traversed, css, /SOURCE_PATH_INVALID/u],
    [{ ...manifestFor(css), maxEntryBytes: 100001 }, css, /BUDGET_CHANGED/u],
  ]) {
    await assert.rejects(
      compileBundles(manifest, async () => source),
      expected,
    );
  }
});

test("the 100 kB entry budget is enforced on generated bytes", async () => {
  const text =
    ".home{--unique:" +
    Array.from({ length: 22000 }, (_, i) =>
      i.toString(36).padStart(5, "x"),
    ).join("") +
    "}";
  await assert.rejects(
    compileBundles(manifestFor(text), async () => text),
    /BUDGET_EXCEEDED/u,
  );
});
