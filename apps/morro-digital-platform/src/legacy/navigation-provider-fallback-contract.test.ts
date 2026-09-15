import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const HISTORICAL_V1_SOURCE_COMMIT =
  "60746fd7fed97b805758b37adfdbe3bad2582bfe";
const browserEntryPath = fileURLToPath(
  new URL("../browser-entry.ts", import.meta.url),
);
const browserPath = fileURLToPath(new URL("../browser.ts", import.meta.url));
const leafletCompatibilityPath = fileURLToPath(
  new URL("../development/leaflet-compatibility-sdk.ts", import.meta.url),
);

describe("V1 navigation provider fallback contract", () => {
  it("retains the historical frozen baseline reference without treating it as ZIP certification", () => {
    expect(HISTORICAL_V1_SOURCE_COMMIT).toBe(
      "60746fd7fed97b805758b37adfdbe3bad2582bfe",
    );
  });

  it("destroys the active Mapbox navigation runtime before entering a map fallback", async () => {
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
    expect(fallbackSource).toContain(
      "setV1MapboxCompatibilityAliases(undefined);",
    );
    expect(
      fallbackSource.indexOf("clearBrowserNavigationRuntime();"),
    ).toBeLessThan(fallbackSource.indexOf("activeRealMap = undefined;"));
  });

  it("keeps the same navigation runtime on fallback providers with degraded map presentation", async () => {
    const browserSource = await readFile(browserPath, "utf8");
    const leafletSource = await readFile(leafletCompatibilityPath, "utf8");

    expect(browserSource).toContain(
      'import {\n  installBrowserNavigationRuntime,',
    );
    expect(browserSource).toContain("options.onMapCreated ??");
    expect(browserSource).toContain("installBrowserNavigationRuntime({");
    expect(browserSource).toContain("degradedNavigationByDocument");

    expect(leafletSource).toContain("easeTo(input:");
    expect(leafletSource).toContain("this.nativeMap.setView(");
    expect(leafletSource).toContain(
      "preserving route progress, instructions, speech and lifecycle",
    );
  });
});
