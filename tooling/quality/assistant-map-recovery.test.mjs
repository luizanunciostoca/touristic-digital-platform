import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(
  new URL(
    "../../apps/morro-digital-platform/src/browser-entry.ts",
    import.meta.url,
  ),
  "utf8",
);
const parsed = ts.createSourceFile(
  "browser-entry.ts",
  source,
  ts.ScriptTarget.Latest,
  true,
);
const selected = [
  "clearBrowserNavigationRuntime",
  "prepareMapContainerForFallback",
  "startBrowserWithProvider",
];
const declarations = parsed.statements.filter(
  (node) =>
    ts.isFunctionDeclaration(node) && selected.includes(node.name?.text),
);
assert.equal(
  declarations.length,
  selected.length,
  "all production lifecycle functions must be exercised",
);
const executable = ts.transpileModule(
  declarations.map((node) => node.getText(parsed)).join("\n"),
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  },
).outputText;

function harness({ failReal = true, failFallback = false } = {}) {
  const document = {};
  const fallbackMap = {};
  const fallbackSdk = {};
  const installs = [];
  const destroyed = [];
  const starts = [];
  const context = vm.createContext({
    document,
    mapContainer: {
      setAttribute() {},
      removeAttribute() {},
      replaceChildren() {},
      classList: { remove() {} },
    },
    activeRealMap: undefined,
    activeNavigationRuntimeInstall: {
      destroy() {
        destroyed.push("previous");
      },
    },
    activeDiscoverRecenterCleanup: undefined,
    activeMapLayerCleanup: undefined,
    activeDiscoverPoiCleanup: undefined,
    activeDiscoverPoiMarkers: [],
    activeCurrentLocationMarker: undefined,
    activeCurrentLocation: undefined,
    activeGlobalViewControl: undefined,
    createTourMarkerElement() {},
    updateStatus() {},
    setV1MapboxCompatibilityAliases() {},
    createFallbackMapProvider: () => ({
      mode: "leaflet",
      sdk: fallbackSdk,
      environment: { fallback: true },
    }),
    installDiscoverPoiMarkers: () => () => {},
    installBrowserNavigationRuntime(options) {
      const runtime = {
        destroy() {
          destroyed.push(runtime);
        },
      };
      installs.push({ options, runtime });
      return runtime;
    },
    async startMorroDigitalBrowser(options) {
      starts.push(options);
      if (!options.environment.fallback && failReal)
        throw new Error("MAP_CONSTRUCTION_FAILED");
      if (options.environment.fallback && failFallback)
        throw new Error("FALLBACK_CONSTRUCTION_FAILED");
      if (options.environment.fallback) options.onMapCreated?.(fallbackMap);
      return { startedModules: ["map", "assistant"] };
    },
  });
  vm.runInContext(executable, context);
  return {
    context,
    document,
    fallbackMap,
    fallbackSdk,
    installs,
    destroyed,
    starts,
    run: (provider) => context.startBrowserWithProvider(provider),
  };
}

test("map construction recovery restores assistant runtime and cleans each previous install exactly once", async () => {
  const h = harness();
  for (let attempt = 0; attempt < 2; attempt++)
    await h.run({ mode: "real", sdk: {}, environment: {} });
  assert.equal(h.installs.length, 2, "exactly one runtime per recovered map");
  assert.deepEqual(h.destroyed, ["previous", h.installs[0].runtime]);
  for (const { options } of h.installs) {
    assert.equal(options.map, h.fallbackMap);
    assert.equal(options.sdk, h.fallbackSdk);
    assert.equal(options.document, h.document);
  }
  assert.equal(h.context.activeNavigationRuntimeInstall, h.installs[1].runtime);
});

test("initial fallback keeps browser.ts default installation without adding a second callback", async () => {
  const h = harness({ failReal: false });
  await h.run({
    mode: "leaflet",
    sdk: h.fallbackSdk,
    environment: { fallback: true },
  });
  assert.equal(h.starts.length, 1);
  assert.equal(
    h.starts[0].onMapCreated,
    undefined,
    "default browser installer remains responsible",
  );
  assert.equal(h.installs.length, 0);
  assert.equal(h.destroyed.length, 0);
});

test("failed fallback stays failed and does not install an assistant against an unavailable map", async () => {
  const h = harness({ failFallback: true });
  await assert.rejects(
    h.run({ mode: "real", sdk: {}, environment: {} }),
    /FALLBACK_CONSTRUCTION_FAILED/u,
  );
  assert.equal(h.installs.length, 0);
  assert.deepEqual(h.destroyed, ["previous"]);
});
