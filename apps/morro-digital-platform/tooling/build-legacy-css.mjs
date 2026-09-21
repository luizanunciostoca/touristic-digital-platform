import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const toolingDir = dirname(fileURLToPath(import.meta.url));
const publicRoot = resolve(toolingDir, "../public");
const legacyRoot = resolve(publicRoot, "legacy");
const checkpointPath = resolve(legacyRoot, "checkpoint.css");
const outputPath = resolve(legacyRoot, "legacy.bundle.css");

const LEGACY_SOURCES = Object.freeze([
  "./css/base/variables.css",
  "./css/base/reset.css",
  "./css/base/typography.css",
  "./css/base/animations.css",
  "./css/layout/app-shell.css",
  "./css/layout/map.css",
  "./css/layout/controls.css",
  "./css/components/buttons/buttons.css",
  "./css/components/buttons/end-navigation-btn.css",
  "./css/components/map/map-controls.css",
  "./css/components/map/map-indicators.css",
  "./css/components/map/map-rotation.css",
  "./css/components/map/map3d.css",
  "./css/components/map/map3d-loading.css",
  "./css/components/map/map-3d-fixes.css",
  "./css/components/map/mapbox-osm-3d.css",
  "./css/components/markers.css",
  "./css/components/location-indicator.css",
  "./css/components/navigation/navigation-banner.css",
  "./css/components/assistant/assistantModalUI.css",
  "./css/components/assistant/assistant-mood.css",
  "./css/components/assistant/carouselModal.css",
  "./css/components/assistant/assistant-voice-selector.css",
  "./css/components/assistant/assistant-voice-settings.css",
  "./css/components/tour/tour.css",
  "./css/components/popups.css",
  "./css/components/inputs/inputs.css",
  "./css/components/weather.css",
  "./css/components/accessibility.css",
  "./css/components/onboarding.css",
  "./css/components/interactive-tour.css",
  "./css/navigation/user-marker.css",
  "./css/vendor/leaflet-custom.css",
  "./css/vendor-fixes.css",
  "./css/base/responsive.css",
  "./css/z-index-standards.css",
]);

function normalizeNewlines(value) {
  return value.replace(/\r\n?/gu, "\n");
}

function assertSafeSource(source) {
  if (
    !source.startsWith("./") ||
    source.includes("..") ||
    !source.endsWith(".css")
  ) {
    throw new Error(`Unsafe legacy CSS source: ${source}`);
  }
}

function checkpointImports(content) {
  return Array.from(
    content.matchAll(/@import\s+["']([^"']+)["']\s*;/gu),
    (match) => match[1],
  );
}

async function buildLegacyBundle() {
  const checkpoint = normalizeNewlines(await readFile(checkpointPath, "utf8"));
  const imports = checkpointImports(checkpoint);
  if (JSON.stringify(imports) !== JSON.stringify(LEGACY_SOURCES)) {
    throw new Error(
      `Legacy checkpoint order drifted. Expected ${JSON.stringify(LEGACY_SOURCES)}, received ${JSON.stringify(imports)}`,
    );
  }

  const sections = [];
  for (const source of LEGACY_SOURCES) {
    assertSafeSource(source);
    const absolutePath = resolve(legacyRoot, source);
    if (!absolutePath.startsWith(`${legacyRoot}/`)) {
      throw new Error(`Legacy source escaped root: ${source}`);
    }
    const content = normalizeNewlines(await readFile(absolutePath, "utf8"));
    if (/@import\s/iu.test(content)) {
      throw new Error(
        `Nested @import is not allowed in legacy bundle source: ${source}`,
      );
    }
    sections.push(`/* legacy-source: ${source} */\n${content.trimEnd()}\n`);
  }

  const indexInline = normalizeNewlines(
    await readFile(resolve(legacyRoot, "index-inline.css"), "utf8"),
  );
  if (/@import\s/iu.test(indexInline)) {
    throw new Error("Nested @import is not allowed in legacy index-inline.css");
  }
  sections.push(
    `/* legacy-source: ./index-inline.css */\n${indexInline.trimEnd()}\n`,
  );

  return [
    "/* GENERATED FILE — DO NOT EDIT.",
    " * Built deterministically from the frozen V1 checkpoint sources by",
    " * tooling/build-legacy-css.mjs. Source files remain immutable evidence.",
    " */",
    "",
    sections.join("\n").trimEnd(),
    "",
  ].join("\n");
}

const bundle = await buildLegacyBundle();
const checkOnly = process.argv.includes("--check");

if (checkOnly) {
  const current = normalizeNewlines(
    await readFile(outputPath, "utf8").catch(() => ""),
  );
  if (current !== bundle) {
    throw new Error(
      "legacy.bundle.css is missing or stale. Run the legacy CSS generator.",
    );
  }
} else {
  await writeFile(outputPath, bundle, "utf8");
}

export { LEGACY_SOURCES, buildLegacyBundle };
