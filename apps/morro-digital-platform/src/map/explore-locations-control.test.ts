import { readFileSync } from "node:fs";
import { compileFunction } from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  getAssistantConversationOrchestrator,
  type AssistantConversationOrchestrator,
} from "../assistant/assistant-conversation-orchestrator.js";
import { morroV1SearchCatalog, normalizeSearchText } from "@touristic/search";

import {
  appliedMapFilterSummary,
  createExploreLocationDetailsCommand,
  type ExternalTourMapPreparation,
  type ExploreSearchResult,
  getAssistantCategoryButtonId,
  getExploreLocationsCategories,
  getExploreLocationsForCategory,
} from "./explore-locations-control.js";
import { groupProjectedMarkers } from "./explore-marker-grouping.js";
import { getV1ExplorePlaceActionOptions } from "./explore-location-actions-v1.js";
import { getV1ExploreLabel, getV1ExploreUiCopy } from "./explore-v1-i18n.js";

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

interface PlaceDetailConsumer {
  conversation: AssistantConversationOrchestrator;
  presenter(): Record<string, string>;
  setPresenterData(values: Record<string, string>): void;
  select(location: ExploreSearchResult): Promise<void>;
  click(value: string): void;
  rails: Array<Array<{ label: string; value: string }>>;
  messages: Array<{ name: string; description: string }>;
  events: Array<{ type: string; detail: Record<string, unknown> }>;
  snapshot(): {
    place: string | undefined;
    stage: string;
    generation: number;
    mapCalls: number;
    detailRequests: number;
  };
}

function actualPlaceDetailConsumer(
  locale: "pt" | "en" | "es" | "he",
  getDetail: (placeId: string) => unknown,
): PlaceDetailConsumer {
  const sourcePath = new URL("./explore-locations-control.ts", import.meta.url);
  const ast = ts.createSourceFile(
    sourcePath.pathname,
    readFileSync(sourcePath, "utf8"),
    ts.ScriptTarget.Latest,
  );
  const names = new Set([
    "renderPlaceDetailMessage",
    "readActivePlaceDetail",
    "handlePlaceAction",
    "renderPlaceActionsRail",
    "selectLocation",
  ]);
  const declarations: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && names.has(node.name.getText(ast))) {
      declarations.push(`const ${node.getText(ast)};`);
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  if (declarations.length !== names.size)
    throw new Error("Expected the five actual place detail consumer functions");

  // Run the production consumers together. Only browser/network boundaries
  // are fixtures; the ID, generation, copy and dispatch decisions are real.
  const javascript = ts.transpileModule(
    `
      const {locale,getDetail,normalizeSearchText,getV1ExploreLabel,getV1ExploreUiCopy,getV1ExplorePlaceActionOptions,getAssistantConversationOrchestrator}=dependencies;
      let activePlace,activePlaceLocation,activePlaceDetail,activeStage="menu",interactionGeneration=0;
      let activePlaceActionValues=[],datasetCriteria=[],mapCalls=0,detailRequests=0;
      const messages=[],events=[],rails=[];
      const elements=new Map();
      class HTMLElement {
        constructor(){this.dataset={};this.textContent="";this.children=[];this.classList={remove(){},add(){}};}
        setAttribute(name,value){this[name]=value;}
        appendChild(node){this.children.push(node);if(node.id)elements.set(node.id,node);}
        replaceChildren(...nodes){
          this.children=nodes;
          if(this.id===ASSISTANT_FLOW_MESSAGE_ID){
            messages.push({name:nodes[0]?.textContent??"",description:nodes.find(n=>n.className==="md-assistant-place-detail-description")?.textContent??""});
          }
        }
        remove(){elements.delete(this.id);}
      }
      class HTMLButtonElement extends HTMLElement {}
      class CustomEvent { constructor(type,init) { this.type=type;this.detail=init.detail; } }
      const ASSISTANT_FLOW_MESSAGE_ID="assistant-category-results-message";
      const ASSISTANT_FLOW_RESULTS_ID="assistant-category-results";
      const area=new HTMLElement();
      const map=new HTMLElement();map.dataset.exploreState="ready";elements.set("map",map);
      const document={documentElement:{lang:locale},activeElement:null,
        defaultView:{fetch() { throw Error("Unexpected direct network access"); }},
        getElementById:id=>elements.get(id)??null,
        createElement:()=>new HTMLElement(),
        dispatchEvent:event=>events.push(event)};
      const assistantMessagesArea=()=>area,hideMainMenu=()=>{};
      const currentLocale=()=>locale,currentCategories=()=>[];
      const contextualRailScroll=null,exploreFlowBottomSheet={hide(){}};
      const UNREGISTERED_COMMERCIAL_ACTION_IDS=new Set();
      const removeAssistantFlowResults=()=>{},requestAssistantOpen=()=>{};
      const renderContextualRail=(_stage,_label,options)=>{rails.push(options);return null;};
      const createPublicPlaceMapClient=()=>({getDetail:(id)=>{detailRequests+=1;return getDetail(id);}});
      const renderLocationsOnMap=async()=>{mapCalls+=1;};
      const setExploreRuntimeStatus=()=>{},emitStateChange=()=>{};
      const shareActivePlace=()=>{},tourTicketingUrl=()=>null,startImmersiveTour=()=>{},returnFromPlaceDetail=()=>{};
      ${declarations.join("\n")}
      return {select:selectLocation,click:handlePlaceAction,rails,messages,events,
        conversation:getAssistantConversationOrchestrator(document),
        presenter:()=>({...elements.get(ASSISTANT_FLOW_MESSAGE_ID)?.dataset}),
        setPresenterData:values=>Object.assign(elements.get(ASSISTANT_FLOW_MESSAGE_ID).dataset,values),
        snapshot:()=>({place:activePlace,stage:activeStage,generation:interactionGeneration,mapCalls,detailRequests})};
    `,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const dependencies = {
    locale,
    getDetail,
    normalizeSearchText,
    getV1ExploreLabel,
    getV1ExploreUiCopy,
    getV1ExplorePlaceActionOptions,
    getAssistantConversationOrchestrator,
  };
  const execute = compileFunction(javascript, ["dependencies"]) as (
    context: typeof dependencies,
  ) => PlaceDetailConsumer;
  return execute(dependencies);
}

const canonicalLocation = (placeId: string): ExploreSearchResult => ({
  name: "Same place name",
  category: "beaches",
  latitude: -13.38,
  longitude: -38.91,
  source: "canonical",
  placeId,
});

function canonicalDetail(placeId: string, description = "Full place details") {
  return {
    profile: {
      id: placeId,
      name: "Same place name",
      description,
      shortDescription: "",
    },
    actions: {
      placeId,
      primaryAction: null,
      secondaryActions: [
        {
          id: "info",
          label: "Saiba mais",
          value: `place-action:info:${placeId}`,
          disabled: false,
        },
        {
          id: "photos",
          label: "Photo channel label",
          value: "ver fotos",
          disabled: false,
        },
      ],
    },
  };
}

describe("selected canonical place detail action", () => {
  it.each([
    ["pt", "Ver detalhes"],
    ["en", "View details"],
    ["es", "Ver detalles"],
    ["he", "הצגת פרטים"],
  ] as const)(
    "labels only the handled canonical rail in %s",
    async (locale, label) => {
      const consumer = actualPlaceDetailConsumer(locale, () =>
        canonicalDetail("place-a"),
      );
      await consumer.select(canonicalLocation("place-a"));
      expect(consumer.rails.at(-1)).toContainEqual(
        expect.objectContaining({ label, value: "place-action:info:place-a" }),
      );
      expect(consumer.rails.at(-1)).toContainEqual(
        expect.objectContaining({
          label: "Photo channel label",
          value: "ver fotos",
        }),
      );
      expect(consumer.rails[0]).toContainEqual(
        expect.objectContaining({
          label: `ℹ️ ${getV1ExploreLabel("learnMore", locale)}`,
          value: "saiba mais",
        }),
      );
      const before = consumer.snapshot();
      consumer.click("place-action:info:place-a");
      expect(consumer.messages.at(-1)?.description).toBe("Full place details");
      expect(consumer.events).toEqual([]);
      expect(consumer.snapshot()).toEqual(before);
    },
  );

  it.each(["profile", "actions"] as const)(
    "rejects a mismatched %s ID without a free-text query",
    async (field) => {
      const detail = canonicalDetail("place-a");
      if (field === "profile") detail.profile.id = "place-b";
      else detail.actions.placeId = "place-b";
      const consumer = actualPlaceDetailConsumer("pt", () => detail);
      await consumer.select(canonicalLocation("place-a"));
      const count = consumer.messages.length;
      consumer.click("place-action:info:place-a");
      consumer.click("place-action:info:place-b");
      expect(consumer.messages).toHaveLength(count);
      expect(consumer.events).toEqual([]);
      expect(
        consumer.rails
          .at(-1)
          ?.some(({ value }) => value.startsWith("place-action:info:")),
      ).toBe(false);
    },
  );

  it("omits details when both descriptions are empty, but accepts a real short description", async () => {
    const empty = canonicalDetail("place-a", "  ");
    const consumer = actualPlaceDetailConsumer("pt", () => empty);
    await consumer.select(canonicalLocation("place-a"));
    expect(
      consumer.rails
        .at(-1)
        ?.some(({ value }) => value.startsWith("place-action:info:")),
    ).toBe(false);
    const count = consumer.messages.length;
    consumer.click("place-action:info:place-a");
    expect(consumer.messages).toHaveLength(count);
    expect(consumer.events).toEqual([]);

    empty.profile.shortDescription = "Short description from the profile";
    await consumer.select(canonicalLocation("place-a"));
    consumer.click("place-action:info:place-a");
    expect(consumer.messages.at(-1)?.description).toBe(
      empty.profile.shortDescription,
    );
  });

  it("ignores a late response for another ID with the same name", async () => {
    let resolveFirst!: (detail: ReturnType<typeof canonicalDetail>) => void;
    const first = new Promise<ReturnType<typeof canonicalDetail>>((resolve) => {
      resolveFirst = resolve;
    });
    const consumer = actualPlaceDetailConsumer("pt", (id) =>
      id === "place-a" ? first : canonicalDetail("place-b", "Details for B"),
    );
    const waiting = consumer.select(canonicalLocation("place-a"));
    await consumer.select(canonicalLocation("place-b"));
    resolveFirst(canonicalDetail("place-a", "Late details for A"));
    await waiting;
    const count = consumer.messages.length;
    consumer.click("place-action:info:place-a");
    expect(consumer.messages).toHaveLength(count);
    consumer.click("place-action:info:place-b");
    expect(consumer.messages.at(-1)?.description).toBe("Details for B");
    expect(consumer.rails.at(-1)).toContainEqual(
      expect.objectContaining({ value: "place-action:info:place-b" }),
    );
    expect(consumer.events).toEqual([]);
  });

  it("consumes info safely on a failed request and preserves other action channels", async () => {
    const consumer = actualPlaceDetailConsumer("pt", () =>
      Promise.reject(new Error("unavailable")),
    );
    await consumer.select(canonicalLocation("place-a"));
    const count = consumer.messages.length;
    consumer.click("place-action:info:place-a");
    expect(consumer.messages).toHaveLength(count);
    expect(consumer.events).toEqual([]);
    consumer.click("saiba mais");
    consumer.click("ver fotos");
    consumer.click("como chegar");
    expect(consumer.events.map(({ type }) => type)).toEqual([
      "morro:assistant-option-selected",
      "morro:assistant-option-selected",
      "morro:navigation-requested",
    ]);
    expect(consumer.events[0]?.detail.value).toBe("saiba mais");
    expect(consumer.events[1]?.detail.value).toBe("ver fotos");
    expect(consumer.events[2]?.detail.destination).toMatchObject({
      name: "Same place name",
      latitude: -13.38,
      longitude: -38.91,
    });
  });
});

describe("confirmed details conversation continuity", () => {
  it.each(["pt", "en", "es", "he"] as const)(
    "records an explicit linked turn and projects it through the actual renderer in %s",
    async (locale) => {
      const consumer = actualPlaceDetailConsumer(locale, () =>
        canonicalDetail("place-a"),
      );
      await consumer.select(canonicalLocation("place-a"));
      const previous = consumer.conversation.transition({
        cause: "place_selected",
        messageKey: "place_selected",
        renderedText: "Selected place A",
        place: "Same place name",
        category: "beaches",
        priority: "contextual",
      });
      consumer.setPresenterData({
        contextualState: "place_selected",
        conversationTurnId: previous.id,
        previousConversationTurnId: "obsolete",
        conversationCause: "place_selected",
        conversationMessageKey: "place_selected",
        conversationPriority: "contextual",
        contextualCta: "Old contextual action",
        contextualVoiceCopy: "Old contextual voice",
        contextualNonBlocking: "true",
      });
      const before = consumer.snapshot();
      consumer.click("place-action:info:place-a");
      const turn = consumer.conversation.recentTurns().at(-1);
      expect(turn).toMatchObject({
        previousTurnId: previous.id,
        cause: "place_details",
        messageKey: "place_details",
        intent: "place_info",
        userAction: "place-action:info:place-a",
        renderedText: "Full place details",
        priority: "explicit",
        entities: { placeId: "place-a" },
      });
      expect(turn?.id).not.toBe(previous.id);
      expect(consumer.conversation.snapshot()).toMatchObject({
        currentPlace: "Same place name",
        currentIntent: "place_info",
        previousAssistantMessage: "Full place details",
        mapContext: { selectedPlaceId: "place-a" },
      });
      expect(consumer.presenter()).toMatchObject({
        conversationTurnId: turn?.id,
        previousConversationTurnId: previous.id,
        conversationCause: "place_details",
        conversationMessageKey: "place_details",
        conversationPriority: turn?.priority,
      });
      expect(consumer.presenter().contextualState).toBeUndefined();
      expect(consumer.presenter().contextualCta).toBeUndefined();
      expect(consumer.presenter().contextualVoiceCopy).toBeUndefined();
      expect(consumer.presenter().contextualNonBlocking).toBeUndefined();
      expect(consumer.messages.at(-1)?.description).toBe(turn?.renderedText);
      expect(consumer.snapshot()).toEqual(before);
      expect(consumer.events).toEqual([]);
      consumer.click("place-action:info:place-a");
      expect(consumer.conversation.recentTurns()).toHaveLength(2);
      expect(consumer.presenter().conversationTurnId).toBe(turn?.id);
    },
  );

  it("clears a stale predecessor when details are the first conversation turn", async () => {
    const consumer = actualPlaceDetailConsumer("pt", () =>
      canonicalDetail("place-a"),
    );
    await consumer.select(canonicalLocation("place-a"));
    consumer.setPresenterData({
      previousConversationTurnId: "obsolete",
      contextualState: "place_selected",
    });
    consumer.click("place-action:info:place-a");
    const turns = consumer.conversation.recentTurns();
    expect(turns).toHaveLength(1);
    expect(turns[0]?.previousTurnId).toBeNull();
    expect(consumer.presenter().previousConversationTurnId).toBeUndefined();
    expect(consumer.presenter().contextualState).toBeUndefined();
    expect(consumer.presenter().conversationTurnId).toBe(turns[0]?.id);
  });

  it("does not retain prior turn metadata when selecting another place", async () => {
    const consumer = actualPlaceDetailConsumer("pt", (id) =>
      canonicalDetail(id),
    );
    await consumer.select(canonicalLocation("place-a"));
    consumer.click("place-action:info:place-a");
    const first = consumer.conversation.recentTurns().at(-1);
    expect(first?.cause).toBe("place_details");
    consumer.setPresenterData({
      conversationPriority: "explicit",
      contextualState: "place_selected",
      contextualCta: "Old contextual action",
      contextualVoiceCopy: "Old contextual voice",
      contextualNonBlocking: "true",
    });
    await consumer.select(canonicalLocation("place-b"));
    expect(consumer.presenter().conversationTurnId).toBeUndefined();
    expect(consumer.presenter().conversationCause).toBeUndefined();
    expect(consumer.presenter().conversationMessageKey).toBeUndefined();
    expect(consumer.presenter().conversationPriority).toBeUndefined();
    expect(consumer.presenter().contextualState).toBeUndefined();
    expect(consumer.presenter().contextualCta).toBeUndefined();
    expect(consumer.presenter().contextualVoiceCopy).toBeUndefined();
    expect(consumer.presenter().contextualNonBlocking).toBeUndefined();
    const count = consumer.conversation.recentTurns().length;
    consumer.click("place-action:info:place-a");
    expect(consumer.conversation.recentTurns()).toHaveLength(count);
    consumer.click("place-action:info:place-b");
    expect(consumer.conversation.recentTurns().at(-1)).toMatchObject({
      previousTurnId: first?.id,
      entities: { placeId: "place-b" },
    });
  });

  it.each(["profile", "actions", "empty", "error"] as const)(
    "does not invent a conversation turn for %s details",
    async (scenario) => {
      const detail = canonicalDetail("place-a");
      if (scenario === "profile") detail.profile.id = "place-b";
      if (scenario === "actions") detail.actions.placeId = "place-b";
      if (scenario === "empty") detail.profile.description = " ";
      const consumer = actualPlaceDetailConsumer("pt", () =>
        scenario === "error" ? Promise.reject(Error("unavailable")) : detail,
      );
      await consumer.select(canonicalLocation("place-a"));
      consumer.click("place-action:info:place-a");
      consumer.click("place-action:info:place-b");
      expect(consumer.conversation.recentTurns()).toEqual([]);
      expect(consumer.events).toEqual([]);
    },
  );
});
