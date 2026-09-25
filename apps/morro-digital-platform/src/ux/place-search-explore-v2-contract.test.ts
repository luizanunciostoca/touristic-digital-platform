import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));

async function readRepository(path: string): Promise<string> {
  return readFile(repositoryRoot + path, "utf8");
}

describe("Place + Search/Explore V2 contract", () => {
  it("retires the legacy Place Bottom Sheet from runtime ownership", async () => {
    const [control, legacyPlace] = await Promise.all([
      readRepository(
        "apps/morro-digital-platform/src/map/explore-locations-control.ts",
      ),
      readRepository(
        "apps/morro-digital-platform/src/map/place-bottom-sheet.ts",
      ),
    ]);

    expect(control).toContain("renderPlaceDetailMessage");
    expect(control).toContain("md-assistant-place-detail-message");
    expect(control).toContain("requestAssistantOpen(document)");
    expect(control).not.toContain("installPlaceBottomSheet");
    expect(control).not.toContain("placeBottomSheet?.show");
    expect(control).not.toContain("actionsInContextualRail: true");

    // Historical component remains available as migration evidence, but is not
    // installed by the active Explore runtime.
    expect(legacyPlace).toContain("place-bottom-sheet-image");
    expect(legacyPlace).toContain("place-bottom-sheet-title");
    expect(legacyPlace).toContain("resolveAssistantV1Photos");
  });

  it("renders Search/Explore through the contextual rail and projects results onto the map", async () => {
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
    expect(control).toContain("renderContextualRail");
    expect(control).toContain("placeReturnIsSearch");
    expect(control).toContain("activePlaceLocation");

    expect(flow).toContain("ExploreFlowBottomSheetStatus");
    for (const state of ["loading", "ready", "empty", "error"]) {
      expect(flow).toContain(`"${state}"`);
    }
    expect(flow).toContain("explore-flow-sheet-status-skeleton");
    expect(flow).toContain("button.dataset.sheetStep = direction");
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

  it("keeps hybrid discovery while promoting explicit canonical Place identity", async () => {
    const [control, search, browser] = await Promise.all([
      readRepository(
        "apps/morro-digital-platform/src/map/explore-locations-control.ts",
      ),
      readRepository(
        "apps/morro-digital-platform/src/assistant/assistant-search-adapter.ts",
      ),
      readRepository(
        "apps/morro-digital-platform/src/assistant/browser-assistant-runtime.ts",
      ),
    ]);

    expect(search).toContain('source: "canonical" as const');
    expect(search).toContain("placeId: item.id");
    expect(search).toContain("/api/places/v1/map?");
    expect(browser).toContain('item.source !== "canonical"');
    expect(browser).toContain("{ placeId: item.placeId }");
    expect(browser).toContain("deferGlobalPlaceSelectionToSearch");
    expect(browser).toContain(
      'exploreStateBeforeMenuRouting?.stage === "menu"',
    );

    expect(control).toContain(
      'readonly source: "canonical" | "local" | "mapbox"',
    );
    expect(control).toContain("createPublicPlaceMapClient");
    expect(control).toContain("loadHybridGlobalMarkers");
    expect(control).toContain("CANONICAL_MAP_DESTINATION_ID");
    expect(control).toContain('source: "canonical" as const');
    expect(control).toContain("placeId: String(item.id)");
    expect(control).toContain("canonicalPlaceId ||");
    expect(control).toContain("legacyFallback");
    expect(control).toContain("canonicalPlaceId");
    expect(control).toContain("detail.actions.secondaryActions");
    expect(control).toContain("detail.actions.primaryAction");
    expect(control).toContain(
      "Canonical Places fail closed: never fall back to inferred commercial",
    );
    expect(control).toContain("UNREGISTERED_COMMERCIAL_ACTION_IDS");
    for (const actionId of [
      "restaurant.menu",
      "restaurant.reserve",
      "nightlife.tickets",
      "hotel.reserve",
      "tour.reserve",
      "transport.request",
      "transport.ticket",
      "shop.products",
      "place.whatsapp",
    ]) {
      expect(control).toContain(`"${actionId}"`);
    }
    expect(control).toContain(
      "!UNREGISTERED_COMMERCIAL_ACTION_IDS.has(actionId)",
    );
    expect(control).not.toContain("resolvePlacePrimaryAction({");
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
    expect(selection).toContain("renderPlaceDetailMessage");
    expect(selection).toContain("renderPlaceActionsRail");
    expect(selection).not.toContain("placeBottomSheet?.show");
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
    const shellCss = await readRepository(
      "apps/morro-digital-platform/public/tourist-shell-v2.css",
    );
    const premiumCss = await readRepository(
      "apps/morro-digital-platform/public/premium-ux-v2.css",
    );
    expect(premiumCss).not.toContain(
      'body[data-md-mode="place"] #globe-map-control',
    );
    expect(premiumCss).toContain(
      'body[data-md-mode="navigation"] #globe-map-control',
    );
    expect(premiumCss).toContain(
      'body[data-md-mode="tour"] #globe-map-control',
    );
    expect(shellCss).toContain(
      'body[data-md-mode="place"] #globe-map-control.md-map-control-stack',
    );
    expect(shellCss).toContain("var(--md-unified-dock-height, 10rem)");
    expect(shellCss).toContain(".md-assistant-place-detail-message");
    expect(shellCss).toContain(".md-assistant-voice-cta");
    expect(css).toContain("@media (forced-colors: active)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("> [data-location-name]");
    expect(css).toContain("grid-column: 1 / -1");
    expect(css).toContain("overflow-wrap: break-word");
    expect(css).toContain("word-break: normal");
    expect(css).not.toContain(
      'body[data-md-mode="place"] #assistant-input-area',
    );
    expect(css).not.toContain(
      'body[data-md-mode="place"] #home-bottom-navigation',
    );
    expect(css).toContain(
      '#map[data-explore-stage="detail"] .morro-explore-marker-icon',
    );
    expect(css).toContain(
      '#place-bottom-sheet[data-sheet-state="half"] .place-bottom-sheet-overflow',
    );
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
