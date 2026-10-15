import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { compileFunction } from "node:vm";
import ts from "typescript";

import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));

async function readRepository(path: string): Promise<string> {
  return readFile(repositoryRoot + path, "utf8");
}

function executeActualBackToMenu(control: string, initialStage = "places") {
  const ast = ts.createSourceFile(
    "controller.ts",
    control,
    ts.ScriptTarget.Latest,
    true,
  );
  let expression = "";
  const find = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(ast) === "backToMenu"
    )
      expression = node.initializer?.getText(ast) ?? "";
    ts.forEachChild(node, find);
  };
  find(ast);
  if (!expression) throw new Error("Actual menu recovery function missing");
  const body = `
    let interactionGeneration=10,datasetGeneration=20;
    const locations=Object.freeze([{name:"One",category:"beaches"},{name:"Two",category:"hotels"}]);
    let visibleLocations=locations,activeMarkerMembers=locations.slice(0,1),activeStage=initialStage;
    let activeCategory={value:"beaches"},activeCategoryButton={},activePlace="Old",activePlaceLocation=locations[0];
    let activePlaceActionValues=["old"],activeSearchQuery="old",retainedMenuContext=false;
    let closeMarkerList=()=>{},refreshMarkerList=()=>{},returnToMarkerList=()=>{},restoreCurrentFlow=()=>{};
    let placeReturnLocations=locations,placeReturnMessage="old",placeReturnIsSearch=true;
    const datasetCategory="beaches",markerRegistry=new Map([["stale",locations[0]]]);
    const writes=[],loads=[],counts=[];
    const geospatialEngine={initialized:true,replaceMarkers:async x=>writes.push(x)};
    const replaceMarkersSerial=async x=>writes.push(x);
    const renderLocationsOnMap=async (...x)=>writes.push(x);
    const immersiveTourController={destroy(){}},clearTourPresentation=()=>{};
    const document={getElementById:()=>({dataset:{mapMarkerCount:"2"}})};
    const removeAssistantFlowResults=()=>{},exploreFlowBottomSheet={hide(){}},resetCategoryTriggerState=()=>{};
    const clearExploreRuntimeStatus=()=>{},showMainMenu=()=>{},updateMapState=()=>{},restoreCategoryRail=()=>{},emitStateChange=()=>{};
    const loadHybridGlobalMarkers=()=>loads.push("global"),contextualRailScroll=null;
    const syncLocationCounts=()=>counts.push({locations:visibleLocations.length,semantic:activeMarkerMembers?.length??visibleLocations.length});
    const back=(${expression}); back(false);
    return {initial:locations,visibleLocations,activeStage,activeCategory,activePlace,activePlaceLocation,
      activeSearchQuery,activePlaceActionValues,activeMarkerMembers,markerRegistrySize:markerRegistry.size,
      interactionGeneration,datasetGeneration,retainedMenuContext,writes,loads,counts};
  `;
  const code = ts.transpileModule(body, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const execute = compileFunction(code, ["initialStage"]) as (
    stage: string,
  ) => unknown;
  return execute(initialStage) as {
    initial: readonly object[];
    visibleLocations: readonly object[];
    activeStage: string;
    activeCategory?: object;
    activePlace?: string;
    activePlaceLocation?: object;
    activeSearchQuery: string;
    activePlaceActionValues: readonly string[];
    activeMarkerMembers?: readonly object[];
    markerRegistrySize: number;
    interactionGeneration: number;
    datasetGeneration: number;
    retainedMenuContext: boolean;
    writes: unknown[][];
    loads: string[];
    counts: { locations: number; semantic: number }[];
  };
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
    const [control, search, browser, marker, entry] = await Promise.all([
      readRepository(
        "apps/morro-digital-platform/src/map/explore-locations-control.ts",
      ),
      readRepository(
        "apps/morro-digital-platform/src/assistant/assistant-search-adapter.ts",
      ),
      readRepository(
        "apps/morro-digital-platform/src/assistant/browser-assistant-runtime.ts",
      ),
      readRepository(
        "apps/morro-digital-platform/src/map/explore-marker-element.ts",
      ),
      readRepository("apps/morro-digital-platform/src/browser-entry.ts"),
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
    expect(control).toContain("canonicalPlaceRuntimeAvailable");
    expect(control).toContain("VITE_PLACE_PLATFORM_AVAILABLE");
    expect(control).toContain('source: "canonical" as const');
    expect(control).toContain("placeId: String(item.id)");
    expect(control).toContain(
      "`explore:${location.category}:canonical:${canonicalPlaceId}`",
    );
    expect(control).toContain('"select_place_id"');
    expect(control).toContain("visibleLocations.find");
    expect(marker).toContain("root.dataset.canonicalPlaceId");
    expect(entry).toContain("marker.dataset.canonicalPlaceId");
    expect(entry).toContain('type: "select_place_id"');
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

  it("returns to the menu without stale selection and preserves the producer's map recovery contract", async () => {
    const control = await readRepository(
      "apps/morro-digital-platform/src/map/explore-locations-control.ts",
    );
    const result = executeActualBackToMenu(control);
    expect(result.activeStage).toBe("menu");
    expect(result.activeCategory).toBeUndefined();
    expect(result.activePlace).toBeUndefined();
    expect(result.activePlaceLocation).toBeUndefined();
    expect(result.activeSearchQuery).toBe("");
    expect(result.activePlaceActionValues).toEqual([]);
    expect(result.interactionGeneration).toBe(11);
    expect(result.loads).toEqual(["global"]);
    const backStart = control.indexOf("const backToMenu =");
    const backEnd = control.indexOf("const shareActivePlace =", backStart);
    const mutateBack = (from: string, to: string) =>
      control.slice(0, backStart) +
      control.slice(backStart, backEnd).replace(from, to) +
      control.slice(backEnd);
    const staleSelection = mutateBack(
      "activePlace = undefined;",
      'activePlace = "stale";',
    );
    expect(() =>
      expect(
        executeActualBackToMenu(staleSelection).activePlace,
      ).toBeUndefined(),
    ).toThrow();
    if (control.includes('"data-map-member-count"')) {
      expect(result.visibleLocations).toBe(result.initial);
      expect(result.retainedMenuContext).toBe(true);
      expect(result.activeMarkerMembers).toBeUndefined();
      expect(result.markerRegistrySize).toBe(0);
      expect(result.datasetGeneration).toBe(21);
      expect(result.writes[0]).toEqual([
        result.initial,
        "beaches",
        false,
        true,
      ]);
      expect(result.counts).toEqual([{ locations: 2, semantic: 2 }]);
      const discarded = executeActualBackToMenu(
        mutateBack(
          "visibleLocations = retainedLocations;",
          "visibleLocations = Object.freeze([]);",
        ),
      );
      expect(() =>
        expect(discarded.visibleLocations).toBe(discarded.initial),
      ).toThrow();
      const tour = executeActualBackToMenu(control, "tour");
      expect(tour.visibleLocations).toEqual([]);
      expect(tour.retainedMenuContext).toBe(false);
      expect(tour.counts).toEqual([{ locations: 0, semantic: 0 }]);
    } else {
      expect(result.visibleLocations).toEqual([]);
      expect(result.writes).toEqual([]);
    }
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
