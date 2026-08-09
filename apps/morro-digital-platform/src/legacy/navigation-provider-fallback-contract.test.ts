import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const V1_SOURCE_COMMIT = "60746fd7fed97b805758b37adfdbe3bad2582bfe";
const browserEntryPath = fileURLToPath(
  new URL("../browser-entry.ts", import.meta.url),
);

describe("V1 navigation provider fallback contract", () => {
  it("is pinned to the frozen V1 source commit", () => {
    expect(V1_SOURCE_COMMIT).toBe("60746fd7fed97b805758b37adfdbe3bad2582bfe");
  });

  it("destroys the Mapbox navigation runtime before entering a map fallback", async () => {
    const source = await readFile(browserEntryPath, "utf8");
    const fallbackStart = source.indexOf(
      "function prepareMapContainerForFallback(): void {",
    );
    const fallbackEnd = source.indexOf(
      "async function startBrowserWithProvider",
      fallbackStart,
    );
    const fallbackSource = source.slice(fallbackStart, fallbackEnd);

    expect(fallbackStart).toBeGreaterThanOrEqual(0);
    expect(fallbackEnd).toBeGreaterThan(fallbackStart);
    expect(fallbackSource).toContain("clearBrowserNavigationRuntime();");
    expect(fallbackSource).toContain("activeRealMap = undefined;");
    expect(fallbackSource).toContain("setV1MapboxCompatibilityAliases(undefined);");
    expect(
      fallbackSource.indexOf("clearBrowserNavigationRuntime();"),
    ).toBeLessThan(fallbackSource.indexOf("activeRealMap = undefined;"));
  });

  it("installs guided navigation only for the real Mapbox provider", async () => {
    const source = await readFile(browserEntryPath, "utf8");
    const start = source.indexOf("async function startBrowserWithProvider");
    const end = source.indexOf("void (async () =>", start);
    const providerSource = source.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(providerSource).toContain('provider.mode === "real"');
    expect(providerSource).toContain("installBrowserNavigationRuntime({");

    const fallbackStart = providerSource.indexOf(
      "const fallbackProvider = createFallbackMapProvider();",
    );
    expect(fallbackStart).toBeGreaterThanOrEqual(0);
    const fallbackSource = providerSource.slice(fallbackStart);
    expect(fallbackSource).not.toContain("installBrowserNavigationRuntime({");
    expect(fallbackSource).not.toContain("onMapCreated:");
  });
});
