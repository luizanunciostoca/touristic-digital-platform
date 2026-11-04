import { readFileSync } from "node:fs";
import { compileFunction } from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { morroV1SearchCatalog } from "@touristic/search";

import {
  appliedMapFilterSummary,
  createExploreLocationDetailsCommand,
  type ExternalTourMapPreparation,
  getAssistantCategoryButtonId,
  getExploreLocationsCategories,
  getExploreLocationsForCategory,
} from "./explore-locations-control.js";
import { groupProjectedMarkers } from "./explore-marker-grouping.js";

const EXPECTED_CATEGORY_COUNTS = Object.freeze({
  beaches: 8,
  restaurants: 45,
  hotels: 35,
  shops: 12,
  transport: 8,
  attractions: 8,
  tours: 6,
  nightlife: 5,
  emergencies: 4,
});

describe("V1 explore locations control", () => {
  it("exposes the nine frozen location categories in canonical menu order", () => {
    const categories = getExploreLocationsCategories();

    expect(categories.map(({ value }) => value)).toEqual([
      "beaches",
      "tours",
      "attractions",
      "restaurants",
      "hotels",
      "nightlife",
      "shops",
      "transport",
      "emergencies",
    ]);
    expect(categories.map(({ label }) => label)).toEqual([
      "Praias",
      "Passeios",
      "Atrações",
      "Restaurantes",
      "Pousadas",
      "Vida Noturna",
      "Lojas",
      "Transporte",
      "Emergências",
    ]);
  });

  it("preserves the exact V1 POI counts without synthesizing locations", () => {
    const categories = getExploreLocationsCategories();

    expect(
      Object.fromEntries(categories.map(({ value, count }) => [value, count])),
    ).toEqual(EXPECTED_CATEGORY_COUNTS);

    const total = categories.reduce((sum, category) => sum + category.count, 0);
    expect(total).toBe(131);
  });

  it("returns only frozen catalog entries for the selected category", () => {
    const beaches = getExploreLocationsForCategory("beaches");

    expect(beaches).toHaveLength(8);
    expect(beaches.map(({ name }) => name)).toContain("Primeira Praia");
    expect(
      beaches.every(
        ({ category, latitude, longitude }) =>
          category === "beaches" &&
          Number.isFinite(latitude) &&
          Number.isFinite(longitude),
      ),
    ).toBe(true);
  });

  it("binds categories to stable ids on the existing assistant buttons", () => {
    expect(getAssistantCategoryButtonId("beaches")).toBe(
      "assistant-category-beaches",
    );
    expect(getAssistantCategoryButtonId("restaurants")).toBe(
      "assistant-category-restaurants",
    );
  });

  it("reuses the localized Search-to-Details command contract", () => {
    expect(createExploreLocationDetailsCommand("Toca do Morcego")).toBe(
      "Fale sobre Toca do Morcego",
    );
  });
});

describe("discovery grouping across the actual catalog", () => {
  it("retains every source record and category at dense and separated camera scales", () => {
    const locations = morroV1SearchCatalog;
    const members = locations.map((location, index) => ({
      ...location,
      key: `catalog:${index}`,
      location,
    }));
    for (const scale of [1, 100_000]) {
      const groups = groupProjectedMarkers(members, ([x, y]) => ({
        x: x * scale,
        y: y * scale,
      }));
      const represented = groups.flatMap(({ members }) =>
        members.map(({ location }) => location),
      );
      expect(represented).toHaveLength(locations.length);
      expect(new Set(represented)).toEqual(new Set(locations));
      expect(new Set(represented.map(({ category }) => category)).size).toBe(9);
      for (const group of groups) expect(group.members).toContain(group.anchor);
    }
  });
});

// Execute the actual producer functions together: the fixture supplies only
// browser/queue boundaries, never an alternative implementation of geometry.
type Actions = Record<"publish" | "regroup" | "clear" | "dispose", () => void>;

function actualDatasetProducer() {
  const sourcePath = new URL("./explore-locations-control.ts", import.meta.url);
  const ast = ts.createSourceFile(
    sourcePath.pathname,
    readFileSync(sourcePath, "utf8"),
    ts.ScriptTarget.Latest,
  );
  const names = new Set([
    "clearDatasetGeometry",
    "publishDatasetGeometry",
    "syncLocationCounts",
    "installDataset",
    "updateMapState",
    "renderMapOnlyLocations",
  ]);
  const methods = ["prepareExternalTour", "setGeospatialEngine"];
  const actual = (name: string, kind: ts.SyntaxKind): string => {
    const matches: ts.Node[] = [];
    const visit = (node: ts.Node): void => {
      if (node.kind === kind) {
        const declaration = node as ts.NamedDeclaration;
        if (declaration.name?.getText(ast) === name) matches.push(node);
      }
      ts.forEachChild(node, visit);
    };
    visit(ast);
    if (matches.length !== 1)
      throw Error(`Expected one ${name}; found ${matches.length}`);
    return matches[0]!.getText(ast);
  };
  const declarations = [...names].map(
    (name) => `const ${actual(name, ts.SyntaxKind.VariableDeclaration)};`,
  );
  const body = `
    let destroyed=false, datasetGeometryGeneration=0, datasetGeneration=0, interactionGeneration=0, renderGeneration=0;
    let externalTourOwnsMap=false, visibleLocations=[], activeMarkerMembers, retainedMenuContext=false, datasetCategory="places", datasetCriteria=[], placeReturnCriteria=[];
    let activeStage="menu", activeCategory, activeCategoryButton, activePlace, activePlaceLocation;
    let activePlaceActionValues=[], activeSearchQuery="", placeReturnLocations=[], placeReturnMessage="", placeReturnIsSearch=false;
    let closeMarkerList,refreshMarkerList,returnToMarkerList,restoreCurrentFlow;
    let markerQueue=Promise.resolve();
    const markerRegistry=new Map(), initialRegistry=new Map(), attributes=new Map();
    const geometryElement={setAttribute:(k,v)=>attributes.set(k,v),removeAttribute:k=>attributes.delete(k),get dataset(){return {exploreState:attributes.get("data-explore-state")}}};
    const document={getElementById:()=>geometryElement};
    const removeAssistantFlowResults=()=>{}, resetCategoryTriggerState=()=>{}, restoreCategoryRail=()=>{},showMainMenu=()=>{},clearExploreRuntimeStatus=()=>{},emitStateChange=()=>{syncLocationCounts();};
    const exploreFlowBottomSheet={hide(){}},immersiveTourController={destroy(){}};
    let geospatialEngine={initialized:true,replaceMarkers:async()=>{}};
    const loadHybridGlobalMarkers=()=>{};
    const clearTourPresentation=()=>{},renderAppliedFilters=()=>{};
    const renderLocationsOnMap=async(locations,category,_open,_camera,criteria=datasetCriteria)=>{installDataset(locations,category,criteria);updateMapState(locations.length,category,"ready");};
    ${actual("categoryBounds", ts.SyntaxKind.FunctionDeclaration)}
    ${declarations.join("\n")}
    const producer={${methods.map((name) => actual(name, ts.SyntaxKind.MethodDeclaration)).join(",")}};
    return {install:(records,category,criteria=[])=>installDataset(records,category,criteria),publish:publishDatasetGeometry,prepare:()=>producer.prepareExternalTour(),mapOnly:renderMapOnlyLocations,
      regroup:()=>updateMapState(visibleLocations.length,datasetCategory,"ready"),
      recover:async()=>{producer.setGeospatialEngine({initialized:true,replaceMarkers:async()=>{}});await markerQueue;},
      subset:members=>{activeMarkerMembers=members;syncLocationCounts();},
      clear:clearDatasetGeometry, dispose:()=>{destroyed=true;publishDatasetGeometry();},
      hold:()=>{let release;markerQueue=new Promise(r=>release=r);return release;},
      attribute:name=>attributes.get(name),
      snapshot:()=>({attributes:Object.fromEntries(attributes),generation:datasetGeometryGeneration,external:externalTourOwnsMap,criteria:datasetCriteria})};
  `;
  const javascript = ts.transpileModule(body, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const execute = compileFunction(javascript, []) as () => Actions & {
    install(
      records: readonly object[],
      category: string,
      criteria?: readonly object[],
    ): void;
    mapOnly(records: readonly object[], category?: string): Promise<boolean>;
    recover(): Promise<void>;
    prepare(): Promise<ExternalTourMapPreparation | null>;
    attribute(name: string): string | undefined;
    subset(records: readonly object[] | undefined): void;
    hold(): () => void;
    snapshot(): {
      attributes: Record<string, string>;
      generation: number;
      external: boolean;
      criteria: readonly object[];
    };
  };
  return execute();
}

describe("actual dataset geometry and external ownership lifecycle", () => {
  const BOUNDS = "data-explore-dataset-bounds";
  const GENERATION = "data-explore-dataset-generation";
  const records = Object.freeze([
    { name: "West", latitude: -13, longitude: -39 },
    { name: "East", latitude: -12, longitude: -38 },
  ]);
  it("preserves the absent show-all category through regroup and subset return without losing an explicit map filter", async () => {
    const producer = actualDatasetProducer();
    expect(await producer.mapOnly(records, "beaches")).toBe(true);
    expect(producer.attribute("data-explore-category")).toBe("beaches");
    expect(await producer.mapOnly(records)).toBe(true);
    const full = producer.snapshot();
    expect(full.attributes["data-explore-stage"]).toBe("menu");
    expect(full.attributes["data-explore-category"]).toBeUndefined();
    producer.subset(records.slice(0, 1));
    producer.regroup();
    expect(producer.attribute("data-explore-category")).toBeUndefined();
    expect(producer.attribute("data-map-member-count")).toBe("2");
    producer.subset(undefined);
    producer.regroup();
    expect(producer.attribute("data-explore-category")).toBeUndefined();
    expect(producer.snapshot().generation).toBe(full.generation);
    expect(producer.attribute(BOUNDS)).toBe(full.attributes[BOUNDS]);
    expect(await producer.mapOnly(records, "beaches")).toBe(true);
    producer.regroup();
    expect(producer.attribute("data-explore-category")).toBe("beaches");
  });
  it("recovers the installed semantic category and complete geometry after an engine replacement", async () => {
    const producer = actualDatasetProducer();
    for (const category of ["beaches", undefined]) {
      await producer.mapOnly(records, category);
      const before = producer.snapshot();
      await producer.recover();
      const after = producer.snapshot();
      expect(after.attributes["data-explore-category"]).toBe(category);
      expect(after.attributes["data-explore-stage"]).toBe("menu");
      expect(after.attributes["data-explore-state"]).toBe("ready");
      expect(after.attributes["data-map-member-count"]).toBe("2");
      expect(after.attributes[BOUNDS]).toBe(before.attributes[BOUNDS]);
    }
  });
  it("keeps full bounds and generation across subset/regroup publication, and clears on a new dataset", () => {
    const producer = actualDatasetProducer();
    const criteria = [{ kind: "category", value: "beaches" }];
    producer.install(records, "beaches", criteria);
    producer.publish();
    const initial = producer.snapshot();
    expect(initial.attributes[BOUNDS]).toBe("[[-39,-13],[-38,-12]]");
    expect(initial.attributes[GENERATION]).toBe("1");
    producer.subset(records.slice(0, 1));
    producer.publish();
    expect(producer.snapshot().attributes).toMatchObject({
      "data-map-member-count": "2",
      "data-explore-location-count": "1",
      [GENERATION]: "1",
      [BOUNDS]: initial.attributes[BOUNDS],
    });
    producer.subset(undefined);
    producer.publish();
    expect(producer.snapshot().generation).toBe(1);
    expect(producer.snapshot().criteria).toEqual(criteria);
    producer.install(records, "beaches");
    expect(producer.attribute(BOUNDS)).toBeUndefined();
    expect(producer.attribute(GENERATION)).toBeUndefined();
    producer.publish();
    expect(producer.attribute(GENERATION)).toBe("2");
    producer.clear();
    expect(producer.attribute(BOUNDS)).toBeUndefined();
    producer.publish();
    producer.dispose();
    expect(producer.attribute(GENERATION)).toBeUndefined();
  });
  it("invalidates a waiting external handoff on reset and prevents a stale selection or geometry publication", async () => {
    const producer = actualDatasetProducer();
    producer.install(records, "beaches");
    producer.publish();
    expect(producer.snapshot().criteria).toEqual([]);
    const release = producer.hold();
    const waiting = producer.prepare();
    expect(producer.snapshot()).toMatchObject({
      external: true,
      generation: 2,
    });
    expect(producer.attribute("data-map-member-count")).toBe("0");
    expect(producer.attribute(BOUNDS)).toBeUndefined();
    producer.install(records, "hotels");
    release();
    expect(await waiting).toBeNull();
    const boundary = await producer.prepare();
    expect(boundary).not.toBeNull();
    expect(boundary!.publishGeometry(records)).toBe(true);
    expect(producer.attribute(GENERATION)).toBe("4");
    producer.install(records, "beaches");
    expect(boundary!.isCurrent()).toBe(false);
    let selected = false;
    expect(
      await boundary!.runSelection(async () => {
        selected = true;
        return 1;
      }),
    ).toBeNull();
    expect(selected).toBe(false);
    expect(boundary!.publishGeometry(records)).toBe(false);
    expect(producer.attribute(BOUNDS)).toBeUndefined();
  });
});

describe("applied map filter projection", () => {
  it("counts committed executor criteria including fine filters, independently of marker or selection count", () => {
    const criteria = [
      { kind: "category", value: "restaurants" },
      { kind: "filter", value: "vegetariano" },
    ];
    expect(
      appliedMapFilterSummary({
        exploreState: "ready",
        exploreCriteria: JSON.stringify(criteria),
      }),
    ).toEqual({ phase: "ready", criteria, count: 2 });
    expect(
      appliedMapFilterSummary({ exploreState: "ready", exploreCriteria: "[]" })
        .count,
    ).toBe(0);
  });
  it("never calls loading or failed clearing zero confirmed filters", () => {
    expect(
      appliedMapFilterSummary({
        exploreState: "loading",
        exploreCriteria: "[]",
      }).count,
    ).toBe(null);
    expect(
      appliedMapFilterSummary({ exploreState: "error", exploreCriteria: "[]" })
        .count,
    ).toBe(null);
  });
});

describe("external tour criteria publication", () => {
  it("clears prior criteria on takeover and confirms zero only at guarded geometry publication", async () => {
    const producer = actualDatasetProducer();
    const records = [{ name: "One", latitude: -13, longitude: -39 }];
    producer.install(records, "restaurants", [
      { kind: "category", value: "restaurants" },
      { kind: "filter", value: "vegetariano" },
    ]);
    const boundary = await producer.prepare();
    expect(producer.snapshot().criteria).toEqual([]);
    expect(
      producer.snapshot().attributes["data-explore-criteria"],
    ).toBeUndefined();
    expect(producer.snapshot().attributes["data-explore-state"]).toBe(
      "loading",
    );
    expect(boundary?.publishGeometry(records)).toBe(true);
    expect(producer.snapshot().attributes["data-explore-criteria"]).toBe("[]");
    expect(producer.snapshot().attributes["data-explore-state"]).toBe("ready");
    producer.install(records, "beaches", [
      { kind: "category", value: "beaches" },
    ]);
    expect(boundary?.publishGeometry(records)).toBe(false);
    expect(producer.snapshot().criteria).toEqual([
      { kind: "category", value: "beaches" },
    ]);
  });
});
