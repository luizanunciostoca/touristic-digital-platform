import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));

async function readRepository(path: string): Promise<string> {
  return readFile(repositoryRoot + path, "utf8");
}

describe("Place + Search/Explore V2 contract", () => {
  it("keeps Place as a real map-first Bottom Sheet with canonical content only", async () => {
    const runtime = await readRepository(
      "apps/morro-digital-platform/src/map/place-bottom-sheet.ts",
    );

    for (const state of ["peek", "half", "full"]) {
      expect(runtime).toContain(`"${state}"`);
    }
    expect(runtime).toContain("place-bottom-sheet-image");
    expect(runtime).toContain("place-bottom-sheet-title");
    expect(runtime).toContain("place-bottom-sheet-meta");
    expect(runtime).toContain("place-bottom-sheet-description");
    expect(runtime).toContain("place-bottom-sheet-rating");
    expect(runtime).toContain("resolveAssistantV1Photos");
    expect(runtime).toContain('value: "como chegar"');
    expect(runtime).toContain('value: "adicionar aos favoritos"');
    expect(runtime).toContain('shareButton.dataset.value = "compartilhar"');
    expect(runtime).toContain("primaryAction");
    expect(runtime).toContain("place-bottom-sheet-overflow");
    expect(runtime).toContain('button.dataset.sheetStep = direction');
    expect(runtime).not.toContain("dataset.sheetStateTarget");
    expect(runtime).toContain('next.status ?? "ready"');

    // Rating is presentation-only and optional: no synthetic score is authored.
    expect(runtime).not.toMatch(/rating:\s*[45](?:\.\d+)?/u);
    expect(runtime).not.toContain("fakeRating");
    expect(runtime).not.toContain("mockRating");
  });

  it("renders Search/Explore through the V2 sheet and projects results onto the map", async () => {
    const [control, flow, search, browser] = await Promise.all([
      readRepository(
        "apps/morro-digital-platform/src/map/explore-locations-control.ts",
      ),
      readRepository(
        "apps/morro-digital-platform/src/map/explore-flow-bottom-sheet.ts",
      ),
      readRepository(
        "apps/morro-digital-platform/src/assistant/assistant-search-adapter.ts",
      ),
      readRepository(
        "apps/morro-digital-platform/src/assistant/browser-assistant-runtime.ts",
      ),
    ]);

    expect(control).toContain('"show_search_results"');
    expect(control).toContain("renderSearchPlaces");
    expect(control).toContain('renderLocationsOnMap(locations, "search")');
    expect(control).toContain('source: "place-v2"');
    expect(control).toContain("placeReturnIsSearch");
    expect(control).toContain("activePlaceLocation");

    expect(flow).toContain("ExploreFlowBottomSheetStatus");
    for (const state of ["loading", "ready", "empty", "error"]) {
      expect(flow).toContain(`"${state}"`);
    }
    expect(flow).toContain("explore-flow-sheet-status-skeleton");
    expect(flow).toContain('button.dataset.sheetStep = direction');
    expect(flow).toContain("button.dataset.sheetStateTarget = state");
    expect(flow).toContain('if (kind === "tour")');
    expect(flow).toContain("rebuildStateControls(presentation.kind)");
    expect(flow).toContain('activeKind !== "explore"');

    expect(search).toContain('type: "show_search_results" as const');
    expect(search).toContain('source: "local" as const');
    expect(search).toContain('source: "mapbox" as const');
    expect(search).toContain("exploreCommands: [exploreCommand]");

    expect(browser).toContain('type === "show_search_results"');
    expect(browser).toContain("results: Object.freeze(results)");
  });

  it("prevents Place action duplication in the initial Assistant detail turn", async () => {
    const control = await readRepository(
      "apps/morro-digital-platform/src/map/explore-locations-control.ts",
    );
    const selectionStart = control.indexOf("const selectLocation = async");
    const selectionEnd = control.indexOf(
      "const renderPlaces =",
      selectionStart,
    );
    const selection = control.slice(selectionStart, selectionEnd);

    expect(selectionStart).toBeGreaterThan(-1);
    expect(selectionEnd).toBeGreaterThan(selectionStart);
    expect(selection).toContain("placeBottomSheet?.show");
    expect(selection).not.toContain("optionsOverride");
    expect(selection).not.toContain(
      'new CustomEvent("morro:assistant-option-selected"',
    );
  });

  it("uses V2 resilience and accessibility primitives without legacy visual edits", async () => {
    const [css, place, flow] = await Promise.all([
      readRepository(
        "apps/morro-digital-platform/public/explore-locations.css",
      ),
      readRepository(
        "apps/morro-digital-platform/src/map/place-bottom-sheet.ts",
      ),
      readRepository(
        "apps/morro-digital-platform/src/map/explore-flow-bottom-sheet.ts",
      ),
    ]);

    for (const token of [
      "--md-touch-target-min",
      "--md-sheet-full-height",
      "--md-layer-place-sheet",
      "--md-layer-explore-sheet",
      "--md-safe-right",
      "--md-safe-left",
    ]) {
      expect(css).toContain(`var(${token}`);
    }
    expect(css).toContain('html[dir="rtl"] #place-bottom-sheet');
    expect(css).toContain("@media (forced-colors: active)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("> [data-location-name]");
    expect(css).toContain("grid-column: 1 / -1");
    expect(css).toContain("overflow-wrap: break-word");
    expect(css).toContain("word-break: normal");
    expect(css).toContain('body[data-md-mode="place"] #assistant-input-area');
    expect(css).toContain(
      'body[data-md-mode="place"] .analytics-consent-preferences.is-collapsed',
    );
    expect(css).not.toContain("transition: all");

    expect(place).toContain("sheet.tabIndex = -1");
    expect(place).toContain('status.setAttribute("aria-live", "polite")');
    expect(flow).toContain("sheet.tabIndex = -1");
    expect(flow).toContain('status.setAttribute("aria-live", "polite")');
  });
});
