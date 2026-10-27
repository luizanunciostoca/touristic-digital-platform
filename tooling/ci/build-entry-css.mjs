import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../../", import.meta.url));
const app = "apps/morro-digital-platform";
const require = createRequire(path.join(repository, app, "package.json"));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export function parseRuleRanges(value, count) {
  assert.equal(typeof value, "string", "CSS_RULE_RANGES_INVALID");
  assert.ok(
    Number.isSafeInteger(count) && count >= 0,
    "CSS_RULE_COUNT_INVALID",
  );
  const result = new Set();
  if (!value) return result;
  for (const range of value.split(",")) {
    assert.match(
      range,
      /^(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*))?$/u,
      "CSS_RULE_RANGE_INVALID",
    );
    const [start, end = start] = range.split("-").map(Number);
    assert.ok(start <= end && end < count, "CSS_RULE_RANGE_OUT_OF_BOUNDS");
    for (let i = start; i <= end; i++) {
      assert.ok(!result.has(i), "CSS_RULE_RANGE_DUPLICATE");
      result.add(i);
    }
  }
  return result;
}

function isKeyframeRule(rule) {
  return rule.parent?.type === "atrule" && /keyframes$/u.test(rule.parent.name);
}

function hiding(declaration) {
  return (
    declaration.type === "decl" &&
    ((declaration.prop === "display" && declaration.value === "none") ||
      (declaration.prop === "visibility" &&
        /^(?:hidden|collapse)$/u.test(declaration.value)))
  );
}

export function selectEntryRules(ast, source) {
  const keep = parseRuleRanges(source.keep, source.ruleCount);
  const hide = parseRuleRanges(source.hide, source.ruleCount);
  assert.ok(
    [...hide].every((index) => !keep.has(index)),
    "CSS_RULE_SELECTION_OVERLAP",
  );
  let index = 0;
  ast.walkRules((rule) => {
    if (isKeyframeRule(rule)) return;
    const current = index++;
    if (keep.has(current)) return;
    if (hide.has(current)) {
      assert.ok(rule.nodes.some(hiding), "CSS_HIDING_RULE_CHANGED");
      rule.nodes
        .filter((node) => !hiding(node))
        .forEach((node) => node.remove());
    } else {
      rule.remove();
    }
  });
  assert.equal(index, source.ruleCount, "CSS_RULE_COUNT_CHANGED");
  ast.walkAtRules((rule) => {
    if (rule.nodes?.length === 0) rule.remove();
  });
  return ast;
}

export function rewriteAssetUrls(ast, file) {
  const base = new URL("/" + file, "https://tdp.invalid");
  ast.walkDecls((declaration) => {
    declaration.value = declaration.value.replace(
      /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]+))\s*\)/gu,
      (match, double, single, bare) => {
        const value = double ?? single ?? bare;
        if (!value || /^(?:[a-z][a-z\d+.-]*:|\/|#)/iu.test(value)) return match;
        assert.ok(
          !value.includes("\\"),
          "CSS_ESCAPED_RELATIVE_URL_UNSUPPORTED",
        );
        const url = new URL(value, base);
        return (
          "url(" + JSON.stringify(url.pathname + url.search + url.hash) + ")"
        );
      },
    );
  });
  return ast;
}

function pruneUnusedKeyframes(ast) {
  const values = [];
  ast.walkDecls((declaration) => {
    if (!isKeyframeRule(declaration.parent)) values.push(declaration.value);
  });
  ast.walkAtRules((rule) => {
    if (
      /keyframes$/u.test(rule.name) &&
      !values.some((value) => value.includes(rule.params))
    )
      rule.remove();
  });
}

export async function compileBundles(manifest, readSource) {
  assert.equal(manifest.version, 1, "CSS_MANIFEST_VERSION_INVALID");
  assert.equal(manifest.maxEntryBytes, 100000, "CSS_ENTRY_BUDGET_CHANGED");
  assert.ok(
    Array.isArray(manifest.sources) && manifest.sources.length > 0,
    "CSS_SOURCES_REQUIRED",
  );
  const postcss = require("postcss");
  const cssnano = require("cssnano");
  const { transform } = require("esbuild");
  const entry = [];
  const full = [];
  const seen = new Set();
  for (const source of manifest.sources) {
    assert.match(
      source.file,
      /^apps\/morro-digital-platform\/public\/[a-zA-Z0-9._/-]+\.css$/u,
      "CSS_SOURCE_PATH_DENIED",
    );
    assert.ok(
      !source.file.split("/").includes("..") && !seen.has(source.file),
      "CSS_SOURCE_PATH_INVALID",
    );
    seen.add(source.file);
    const text = await readSource(source.file);
    assert.equal(
      sha256(text),
      source.sha256,
      "CSS_SOURCE_CHANGED:" + source.file,
    );
    const ast = postcss.parse(text, { from: source.file });
    ast.walkAtRules((rule) =>
      assert.notEqual(
        rule.name.toLowerCase(),
        "import",
        "CSS_IMPORT_REQUIRES_REVIEW",
      ),
    );
    rewriteAssetUrls(ast, source.file);
    full.push(ast.toString());
    entry.push(selectEntryRules(ast.clone(), source).toString());
  }
  const entryAst = postcss.parse(entry.join("\n"));
  pruneUnusedKeyframes(entryAst);
  async function optimize(text) {
    const minified = await transform(text, {
      loader: "css",
      minify: true,
      legalComments: "none",
    });
    return (
      await postcss([cssnano({ preset: "default" })]).process(minified.code, {
        from: undefined,
        map: false,
      })
    ).css;
  }
  const home = await optimize(entryAst.toString());
  const features = await optimize(full.join("\n"));
  assert.ok(
    Buffer.byteLength(home) <= manifest.maxEntryBytes,
    "CSS_ENTRY_BUDGET_EXCEEDED",
  );
  return {
    home,
    features,
    report: {
      schemaVersion: 1,
      manifestSha256: sha256(JSON.stringify(manifest)),
      sources: manifest.sources.map(({ file, sha256: hash }) => ({
        file,
        sha256: hash,
      })),
      home: { bytes: Buffer.byteLength(home), sha256: sha256(home) },
      features: {
        bytes: Buffer.byteLength(features),
        sha256: sha256(features),
      },
    },
  };
}

export async function buildEntryCss(root = repository) {
  const manifest = JSON.parse(
    await fs.readFile(
      path.join(root, "tooling/ci/entry-css-manifest.json"),
      "utf8",
    ),
  );
  const result = await compileBundles(manifest, (file) =>
    fs.readFile(path.join(root, file), "utf8"),
  );
  const destination = path.join(root, app, "public/dist/entry-css");
  await fs.mkdir(destination, { recursive: true });
  for (const [name, data] of Object.entries({
    "home.css": result.home,
    "features.css": result.features,
    "build.json": JSON.stringify(result.report, null, 2) + "\n",
  })) {
    const temporary = path.join(destination, name + ".tmp-" + process.pid);
    await fs.writeFile(temporary, data);
    await fs.rename(temporary, path.join(destination, name));
  }
  return result.report;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  buildEntryCss()
    .then((report) => console.log(JSON.stringify(report)))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
