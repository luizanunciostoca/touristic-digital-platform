import { readFileSync } from "node:fs";
import { compileFunction } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import {
  createAssistantContextManager,
  createAssistantDialogController,
  getAssistantMainMenu,
  normalizeAssistantVoiceLanguage,
  type AssistantDialogResponse,
} from "@touristic/assistant";
import {
  getAssistantConversationOrchestrator,
  type AssistantConversationOrchestrator,
} from "../assistant/assistant-conversation-orchestrator.js";
import { morroV1SearchCatalog, normalizeSearchText } from "@touristic/search";
import {
  executeAssistantV1ResidualCommand,
  resolveAssistantV1ResidualCommand,
} from "../assistant/assistant-v1-residual-command-adapter.js";
import { readAssistantResponseOptions } from "../assistant/assistant-dom-view.js";
import { assistantUiStateStatus } from "../assistant/assistant-ui-state.js";
import {
  resolveAssistantMenuCommand,
  resolveAssistantRuntimeAction,
} from "../assistant/assistant-menu-command-router.js";
import {
  getV1ExploreSubcategoryOptions,
  resolveV1ExploreAppliedResult,
} from "./explore-locations-v1-flow.js";

import {
  appliedMapFilterSummary,
  createExploreLocationDetailsCommand,
  type ExternalTourMapPreparation,
  type ExploreLocationsCommand,
  type ExploreSearchResult,
  getAssistantCategoryButtonId,
  getExploreLocationsCategories,
  getExploreLocationsForCategory,
  resolveExploreLocationByName,
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
  document: Document;
  conversation: AssistantConversationOrchestrator;
  presenter(): Record<string, string>;
  setPresenterData(values: Record<string, string>): void;
  select(location: ExploreSearchResult): Promise<void>;
  changeLocale(locale: string): void;
  execute(command: ExploreLocationsCommand): Promise<boolean>;
  holdMarkers(): () => void;
  holdPosition(): () => void;
  listenerCount(type: string): number;
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
    positionRequests: number;
  };
}

function actualPlaceDetailConsumer(
  locale: "pt" | "en" | "es" | "he",
  getDetail: (placeId: string, options: { locale: string }) => unknown,
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
    "localeObserver",
    "replaceMarkersSerial",
    "installDataset",
    "updateMapState",
    "renderLocationsOnMap",
    "renderMapOnlyLocations",
    "execute",
    "applyFlowOption",
    "openCategory",
    "openCategoryByValue",
    "renderPlaces",
  ]);
  const declarations: string[] = [];
  const functions: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && names.has(node.name.getText(ast))) {
      declarations.push(`const ${node.getText(ast)};`);
    }
    if (
      ts.isFunctionDeclaration(node) &&
      node.name &&
      ["getCurrentPosition", "renderFilters"].includes(node.name.text)
    ) {
      functions.push(node.getText(ast));
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  if (declarations.length !== names.size || functions.length !== 2)
    throw new Error(
      "Expected the actual place detail consumers and locale observer",
    );

  // Run the production consumers together. Only browser/network boundaries
  // are fixtures; the ID, generation, copy and dispatch decisions are real.
  const javascript = ts.transpileModule(
    `
      const {locale,getDetail,normalizeSearchText,normalizeAssistantVoiceLanguage,getExploreLocationsCategories,getExploreLocationsForCategory,getAssistantCategoryButtonId,createExploreLocationDetailsCommand,resolveExploreLocationByName,getV1ExploreSubcategoryOptions,resolveV1ExploreAppliedResult,morroV1SearchCatalog,getV1ExploreLabel,getV1ExploreUiCopy,getV1ExplorePlaceActionOptions,getAssistantConversationOrchestrator}=dependencies;
      let activePlace,activePlaceLocation,activePlaceDetail,activeCategory,activeStage="menu",interactionGeneration=0;
      let activePlaceActionValues=[],datasetCriteria=[],mapCalls=0,detailRequests=0;
      const messages=[],events=[],rails=[];
      const listeners=new Map();
      let positionRequests=0,holdPosition=false,resolvePosition;
      const elements=new Map();
      class HTMLElement {
        constructor(){this.dataset={};this.textContent="";this.children=[];this.classList={remove(){},add(){}};}
        setAttribute(name,value){this[name]=value;if(name.startsWith("data-"))this.dataset[name.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=value;}
        removeAttribute(name){delete this[name];if(name.startsWith("data-"))delete this.dataset[name.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())];}
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
      class MutationObserverCtor { constructor(callback) { this.callback=callback; } }
      const ASSISTANT_FLOW_MESSAGE_ID="assistant-category-results-message";
      const ASSISTANT_FLOW_RESULTS_ID="assistant-category-results";
      const area=new HTMLElement();
      const map=new HTMLElement();map.dataset.exploreState="ready";elements.set("map",map);
      const document={documentElement:{lang:locale},activeElement:null,
        defaultView:{fetch() { throw Error("Unexpected direct network access"); },navigator:{geolocation:{getCurrentPosition(resolve){positionRequests+=1;if(holdPosition)resolvePosition=resolve;else resolve({coords:{latitude:-13.38,longitude:-38.91}});}}}},
        querySelector:()=>null,querySelectorAll:()=>[],
        getElementById:id=>elements.get(id)??null,
        createElement:()=>new HTMLElement(),
        addEventListener:(type,listener)=>{const current=listeners.get(type)??new Set();current.add(listener);listeners.set(type,current);},
        removeEventListener:(type,listener)=>listeners.get(type)?.delete(listener),
        dispatchEvent:event=>{events.push(event);for(const listener of listeners.get(event.type)??[])listener(event);}};
      for(const category of getExploreLocationsCategories(locale))elements.set(getAssistantCategoryButtonId(category.value),new HTMLButtonElement());
      const assistantMessagesArea=()=>area,hideMainMenu=()=>{};
      const currentLocale=()=>normalizeAssistantVoiceLanguage(document.documentElement.lang);
      const currentCategories=()=>getExploreLocationsCategories(currentLocale());
      const contextualRailScroll=null,exploreFlowBottomSheet={hide(){},setStatus(){}};
      const UNREGISTERED_COMMERCIAL_ACTION_IDS=new Set();
      const removeAssistantFlowResults=()=>{},requestAssistantOpen=()=>{};
      const renderContextualRail=(_stage,_label,options)=>{rails.push(options);return null;};
      const createPublicPlaceMapClient=()=>({getDetail:(id,options)=>{detailRequests+=1;return getDetail(id,options);}});
      let destroyed=false,renderGeneration=0,datasetGeneration=0,datasetGeometryGeneration=0;
      let externalTourOwnsMap=false,retainedMenuContext=false,activeMarkerMembers,datasetCategory,visibleLocations=[];
      let activeCategoryButton,activeSearchQuery="",restoreCurrentFlow,closeMarkerList,refreshMarkerList,returnToMarkerList;
      let placeReturnLocations=[],placeReturnCriteria=[],placeReturnMessage="",placeReturnIsSearch=false;
      let markerQueue=Promise.resolve(),markerProviderReady=Promise.resolve();
      const geospatialEngine={initialized:true,replaceMarkers:()=>{mapCalls+=1;return markerProviderReady;}};
      const markerRegistry=new Map();
      const clearDatasetGeometry=()=>{},publishDatasetGeometry=()=>{},syncLocationCounts=()=>{};
      const groupedMarkers=locations=>locations.map((location,index)=>({id:String(index),...location}));
      const frameLocationsOnMap=()=>{},clearTourPresentation=()=>{},resetCategoryTriggerState=()=>{},showMainMenu=()=>{},clearExploreRuntimeStatus=()=>{};
      const renderFlow=(text)=>{let message=elements.get(ASSISTANT_FLOW_MESSAGE_ID);if(!message){message=new HTMLElement();message.id=ASSISTANT_FLOW_MESSAGE_ID;elements.set(message.id,message);}message.textContent=text;return null;};
      const setExploreRuntimeStatus=()=>{},emitStateChange=()=>{};
      const shareActivePlace=()=>{},tourTicketingUrl=()=>null,startImmersiveTour=()=>{},returnFromPlaceDetail=()=>{};
      const refreshCategoryPresentation=()=>{},restoreCategoryRail=()=>{},renderExploreRuntimeStatus=()=>{};
      const exploreRuntimeStatusDescriptor=null,immersiveTourController=null;
      ${functions.join("\n")}
      ${declarations.join("\n")}
      return {document,execute,select:selectLocation,click:handlePlaceAction,rails,messages,events,
        listenerCount:type=>listeners.get(type)?.size??0,
        holdMarkers:()=>{let release;markerProviderReady=new Promise(resolve=>{release=resolve;});return ()=>{markerProviderReady=Promise.resolve();release();};},
        holdPosition:()=>{holdPosition=true;return ()=>{holdPosition=false;resolvePosition?.({coords:{latitude:-13.38,longitude:-38.91}});};},
        changeLocale:locale=>{document.documentElement.lang=locale;localeObserver.callback([{attributeName:"lang"}]);},
        conversation:getAssistantConversationOrchestrator(document),
        presenter:()=>({...elements.get(ASSISTANT_FLOW_MESSAGE_ID)?.dataset}),
        setPresenterData:values=>Object.assign(elements.get(ASSISTANT_FLOW_MESSAGE_ID).dataset,values),
        snapshot:()=>({place:activePlace,stage:activeStage,generation:interactionGeneration,mapCalls,detailRequests,positionRequests})};
    `,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const dependencies = {
    locale,
    getDetail,
    normalizeSearchText,
    normalizeAssistantVoiceLanguage,
    getExploreLocationsCategories,
    getExploreLocationsForCategory,
    getAssistantCategoryButtonId,
    createExploreLocationDetailsCommand,
    resolveExploreLocationByName,
    getV1ExploreSubcategoryOptions,
    resolveV1ExploreAppliedResult,
    morroV1SearchCatalog,
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
      expect(consumer.events).toEqual([
        {
          type: "morro:assistant-place-details-presented",
          detail: {
            turnId: consumer.conversation.snapshot().lastMeaningfulTurn,
          },
        },
      ]);
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
    expect(consumer.events).toEqual([
      {
        type: "morro:assistant-place-details-presented",
        detail: { turnId: consumer.conversation.snapshot().lastMeaningfulTurn },
      },
    ]);
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
      expect(consumer.events).toEqual([
        {
          type: "morro:assistant-place-details-presented",
          detail: { turnId: turn?.id },
        },
      ]);
      consumer.click("place-action:info:place-a");
      expect(consumer.conversation.recentTurns()).toHaveLength(2);
      expect(consumer.presenter().conversationTurnId).toBe(turn?.id);
      expect(consumer.events).toHaveLength(2);
      expect(consumer.events[1]?.detail.turnId).toBe(turn?.id);
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

const settleDetailRefresh = () =>
  new Promise<void>((resolve) => setImmediate(resolve));

function deferredDetail() {
  let resolve!: (detail: ReturnType<typeof canonicalDetail>) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<ReturnType<typeof canonicalDetail>>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function actualConversationRuntime(
  consumer: PlaceDetailConsumer,
  settings: {
    response?: AssistantDialogResponse;
    executionResult?: "reject" | "false";
    styles?: Promise<void>;
  } = {},
) {
  const source = readFileSync(
    new URL("../assistant/browser-assistant-runtime.ts", import.meta.url),
    "utf8",
  );
  const ast = ts.createSourceFile(
    "runtime.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const names = new Set([
    "runtimeErrorResponse",
    "withPresentationLanguage",
    "controller",
    "dropStaleResponse",
    "appendStandardMessage",
    "executeInputTurn",
    "processInputTurn",
    "processInput",
    "eventDetail",
    "onPlaceDetailsPresented",
  ]);
  const functionNames = new Set([
    "supersededResponse",
    "assistantRecoveryResponse",
    "snapshotPresentation",
    "readRuntimeAction",
    "isUnknownArray",
    "readDeterministicExploreCommands",
  ]);
  const declarations: string[] = [];
  const subscriptions: string[] = [];
  const cleanups: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && names.has(node.name.getText(ast))) {
      declarations.push(`const ${node.getText(ast)};`);
    }
    if (
      ts.isFunctionDeclaration(node) &&
      node.name &&
      functionNames.has(node.name.text)
    ) {
      declarations.push(node.getText(ast));
    }
    if (
      ts.isExpressionStatement(node) &&
      ts.isCallExpression(node.expression)
    ) {
      const call = node.expression;
      if (
        call.arguments[0] &&
        ts.isStringLiteral(call.arguments[0]) &&
        call.arguments[0].text === "morro:assistant-place-details-presented" &&
        ts.isPropertyAccessExpression(call.expression)
      ) {
        if (call.expression.name.text === "addEventListener")
          subscriptions.push(node.getText(ast));
        if (call.expression.name.text === "removeEventListener")
          cleanups.push(node.getText(ast));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  const context = createAssistantContextManager();
  context.updateContext({ lastCategory: "beaches" });
  const handler = vi.fn(
    async () => settings.response ?? { text: "Current intentional answer" },
  );
  const execute = vi.fn(async (command: ExploreLocationsCommand) => {
    const result = await consumer.execute(command);
    if (settings.executionResult === "reject")
      throw Error("Injected Explore boundary rejection");
    return settings.executionResult === "false" ? false : result;
  });
  const messages: Array<{ sender: string; html: string }> = [];
  const uiStates: string[] = [];
  const voice = { speak: vi.fn() };
  const dependencies = {
    options: {
      document: consumer.document,
      explore: { execute, getState: () => consumer.snapshot() },
    },
    conversation: consumer.conversation,
    context,
    createAssistantDialogController,
    profile: { recordInteraction: vi.fn() },
    domainHandlers: { help: handler },
    intelligenceHandlers: {},
    navigationHandlers: {},
    createAssistantLlmHandler: () => async () => null,
    getAssistantMainMenu,
    normalizeAssistantVoiceLanguage,
    assistantUiStateStatus,
    messages: {
      append: (message: { sender: string; html: string }) =>
        messages.push(message),
    },
    ensureFeatureStyles: () => settings.styles ?? null,
    dispatchAssistantUiState: (_document: Document, state: string) =>
      uiStates.push(state),
    syncExploreContext: () => undefined,
    commerceCheckoutUrl: () => null,
    resolveAssistantV1ResidualCommand,
    executeAssistantV1ResidualCommand,
    resolveAssistantV1PlaceAction: () => null,
    resolveAssistantMenuCommand,
    resolveAssistantRuntimeAction,
    presentationLanguage: () =>
      normalizeAssistantVoiceLanguage(consumer.document.documentElement.lang),
    voiceLanguage: () =>
      normalizeAssistantVoiceLanguage(consumer.document.documentElement.lang),
    readVisiblePresentation: () => null,
    readExploreState: () => consumer.snapshot(),
    clearAssistantDomOptions: () => undefined,
    removePhotoPresentation: () => undefined,
    readPlaceOwnedActionValues: () => [],
    readAssistantResponseOptions,
    renderAssistantDomOptions: vi.fn(),
    revealLatestAssistantContent: () => undefined,
    readPhotoPresentation: () => null,
    isPhotoResponse: () => false,
    CONTROLLER_OWNED_AWAITING_TYPES: new Set(),
    voice,
    CustomEvent: class {
      constructor(
        readonly type: string,
        readonly init: unknown,
      ) {}
    },
  };
  // The actual subscription, boundary consumers and controller run with the
  // same document as the real Explore queue/selection/locale consumers above.
  const javascript = ts.transpileModule(
    `
    let destroyed=false,requestGeneration=0,assistantUiGeneration=0,currentPresentation=null,legacyMenuRouting=false,navigationActive=false;
    ${declarations.join("\n")}
    ${subscriptions.join("\n")}
    return {process:processInput,dispose(){destroyed=true;${cleanups.join("\n")}}};
  `,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const create = compileFunction(javascript, Object.keys(dependencies)) as (
    ...values: unknown[]
  ) => {
    process(value: string): Promise<AssistantDialogResponse>;
    dispose(): void;
  };
  return {
    ...create(...Object.values(dependencies)),
    execute,
    handler,
    context,
    voice,
    messages,
    uiStates,
  };
}

describe("explicit details across actual runtime async boundaries", () => {
  it.each([
    ["mostrar só praias", undefined],
    ["mostrar todos os locais", undefined],
    ["mostrar só praias", "reject"],
  ] as const)(
    "supersedes residual %s (%s) after selection and locale complete before the marker queue",
    async (input, executionResult) => {
      const consumer = actualPlaceDetailConsumer("pt", (id, { locale }) =>
        canonicalDetail(id, `Confirmed ${locale} details`),
      );
      const runtime = actualConversationRuntime(consumer, {
        ...(executionResult ? { executionResult } : {}),
      });
      const releaseMap = consumer.holdMarkers();
      const old = runtime.process(input).then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      );
      await settleDetailRefresh();
      expect(consumer.snapshot()).toMatchObject({ stage: "menu", mapCalls: 1 });
      const selected = consumer.select(canonicalLocation("place-b"));
      await settleDetailRefresh();
      consumer.click("place-action:info:place-b");
      expect(consumer.conversation.recentTurns()).toEqual([]);
      consumer.changeLocale("en");
      await settleDetailRefresh();
      consumer.click("place-action:info:place-b");
      const details = consumer.conversation.recentTurns().at(-1)!;
      expect(details.cause).toBe("place_details");
      expect(consumer.snapshot().mapCalls).toBe(1);
      releaseMap();
      await selected;
      expect(await old).toMatchObject({
        value: { metadata: { state: "superseded" } },
      });
      expect(consumer.conversation.snapshot().lastMeaningfulTurn).toBe(
        details.id,
      );
      expect(
        runtime.messages.filter((message) => message.sender === "assistant"),
      ).toEqual([]);
      expect(runtime.context.getContext().history).toEqual([]);
      expect(runtime.voice.speak).not.toHaveBeenCalled();
      expect(runtime.uiStates.at(-1)).not.toBe("loading");
      expect(runtime.uiStates).not.toContain("error");
    },
  );

  it.each([undefined, "false", "reject"] as const)(
    "supersedes a real nearby menu command (%s) before fallback, answer or error",
    async (executionResult) => {
      const consumer = actualPlaceDetailConsumer("pt", (id) =>
        canonicalDetail(id),
      );
      await consumer.execute({ type: "open_category", category: "beaches" });
      const releasePosition = consumer.holdPosition();
      const runtime = actualConversationRuntime(consumer, {
        ...(executionResult ? { executionResult } : {}),
      });
      const old = runtime.process("próximo").then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      );
      await settleDetailRefresh();
      expect(consumer.snapshot().positionRequests).toBe(1);
      await consumer.select(canonicalLocation("place-b"));
      consumer.click("place-action:info:place-b");
      const details = consumer.conversation.recentTurns().at(-1)!;
      releasePosition();
      expect(await old).toMatchObject({
        value: { metadata: { state: "superseded" } },
      });
      expect(runtime.execute).toHaveBeenCalledOnce();
      expect(runtime.handler).not.toHaveBeenCalled();
      expect(runtime.voice.speak).not.toHaveBeenCalled();
      expect(runtime.context.getContext().history).toEqual([]);
      expect(consumer.conversation.snapshot().lastMeaningfulTurn).toBe(
        details.id,
      );
      expect(runtime.uiStates).not.toContain("error");
    },
  );

  it.each([undefined, "reject"] as const)(
    "stops the next deterministic command and late voice after a real nearby action (%s)",
    async (executionResult) => {
      const consumer = actualPlaceDetailConsumer("pt", (id) =>
        canonicalDetail(id),
      );
      await consumer.execute({ type: "open_category", category: "beaches" });
      const releasePosition = consumer.holdPosition();
      const runtime = actualConversationRuntime(consumer, {
        ...(executionResult ? { executionResult } : {}),
        response: {
          text: "Finding nearby places",
          metadata: {
            deterministic: true,
            exploreCommands: [
              { type: "show_nearby" },
              { type: "select_place", place: "Primeira Praia" },
            ],
          },
        },
      });
      const old = runtime.process("ajuda").then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      );
      await settleDetailRefresh();
      expect(consumer.snapshot().positionRequests).toBe(1);
      await consumer.select(canonicalLocation("place-b"));
      consumer.click("place-action:info:place-b");
      const details = consumer.conversation.recentTurns().at(-1)!;
      const messagesBeforeCompletion = [...runtime.messages];
      releasePosition();
      expect(await old).toMatchObject({
        value: { metadata: { state: "superseded" } },
      });
      expect(runtime.execute).toHaveBeenCalledOnce();
      expect(runtime.messages).toEqual(messagesBeforeCompletion);
      expect(runtime.voice.speak).not.toHaveBeenCalled();
      expect(consumer.conversation.snapshot().lastMeaningfulTurn).toBe(
        details.id,
      );
      expect(runtime.uiStates).not.toContain("error");
    },
  );

  it.each([undefined, "reject"] as const)(
    "stops late voice or error from a mapped show_place action (%s)",
    async (executionResult) => {
      const consumer = actualPlaceDetailConsumer("pt", (id) =>
        canonicalDetail(id),
      );
      await consumer.execute({ type: "open_category", category: "beaches" });
      await settleDetailRefresh();
      const releaseMap = consumer.holdMarkers();
      const runtime = actualConversationRuntime(consumer, {
        ...(executionResult ? { executionResult } : {}),
        response: {
          text: "Showing the requested beach",
          metadata: { action: "show_place:Primeira Praia" },
        },
      });
      const old = runtime.process("ajuda").then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      );
      await settleDetailRefresh();
      expect(runtime.execute).toHaveBeenCalledWith({
        type: "select_place",
        place: "Primeira Praia",
      });
      const selected = consumer.select(canonicalLocation("place-b"));
      consumer.changeLocale("en");
      await settleDetailRefresh();
      consumer.click("place-action:info:place-b");
      const details = consumer.conversation.recentTurns().at(-1)!;
      const messagesBeforeCompletion = [...runtime.messages];
      releaseMap();
      await selected;
      expect(await old).toMatchObject({
        value: { metadata: { state: "superseded" } },
      });
      expect(runtime.messages).toEqual(messagesBeforeCompletion);
      expect(runtime.voice.speak).not.toHaveBeenCalled();
      expect(consumer.conversation.snapshot().lastMeaningfulTurn).toBe(
        details.id,
      );
      expect(runtime.uiStates).not.toContain("error");
    },
  );

  it.each([
    [false, "resolve"],
    [false, "reject"],
    [true, "resolve"],
    [true, "reject"],
  ] as const)(
    "does not begin a request superseded by details (already open: %s) while styles %s",
    async (alreadyOpen, outcome) => {
      let resolve!: () => void;
      let reject!: (error: Error) => void;
      const styles = new Promise<void>((yes, no) => {
        resolve = yes;
        reject = no;
      });
      const consumer = actualPlaceDetailConsumer("pt", (id) =>
        canonicalDetail(id),
      );
      await consumer.select(canonicalLocation("place-b"));
      if (alreadyOpen) consumer.click("place-action:info:place-b");
      const runtime = actualConversationRuntime(consumer, { styles });
      const old = runtime.process("ajuda").then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      );
      consumer.click("place-action:info:place-b");
      const details = consumer.conversation.recentTurns().at(-1)!;
      if (outcome === "resolve") resolve();
      else reject(Error("Injected stylesheet failure"));
      expect(await old).toMatchObject({
        value: { metadata: { state: "superseded" } },
      });
      expect(runtime.handler).not.toHaveBeenCalled();
      expect(runtime.execute).not.toHaveBeenCalled();
      expect(runtime.voice.speak).not.toHaveBeenCalled();
      expect(consumer.conversation.snapshot().lastMeaningfulTurn).toBe(
        details.id,
      );
      expect(runtime.uiStates).not.toContain("loading");
      expect(runtime.uiStates).not.toContain("error");
    },
  );

  it("invalidates a waiting request when an open detail is reprojected in a new locale", async () => {
    let releaseStyles!: () => void;
    const styles = new Promise<void>((resolve) => {
      releaseStyles = resolve;
    });
    const consumer = actualPlaceDetailConsumer("pt", (id, { locale }) =>
      canonicalDetail(id, `Confirmed ${locale} details`),
    );
    await consumer.select(canonicalLocation("place-b"));
    consumer.click("place-action:info:place-b");
    const runtime = actualConversationRuntime(consumer, { styles });
    const old = runtime.process("ajuda");
    consumer.changeLocale("en");
    await settleDetailRefresh();
    const translated = consumer.conversation.recentTurns().at(-1)!;
    expect(translated.renderedText).toBe("Confirmed en details");
    releaseStyles();
    expect((await old).metadata?.state).toBe("superseded");
    expect(runtime.handler).not.toHaveBeenCalled();
    expect(consumer.conversation.snapshot().lastMeaningfulTurn).toBe(
      translated.id,
    );
    expect(runtime.uiStates).toEqual(["idle"]);
  });

  it("validates details notifications against the current turn and removes its listener", async () => {
    let releaseStyles!: () => void;
    const styles = new Promise<void>((resolve) => {
      releaseStyles = resolve;
    });
    const consumer = actualPlaceDetailConsumer("pt", (id) =>
      canonicalDetail(id),
    );
    await consumer.select(canonicalLocation("place-b"));
    consumer.click("place-action:info:place-b");
    const eventName = "morro:assistant-place-details-presented";
    expect(consumer.listenerCount(eventName)).toBe(0);
    const runtime = actualConversationRuntime(consumer, { styles });
    expect(consumer.listenerCount(eventName)).toBe(1);
    const pending = runtime.process("ajuda");
    consumer.document.dispatchEvent(
      new CustomEvent(eventName, { detail: { turnId: "unrelated-turn" } }),
    );
    releaseStyles();
    expect((await pending).text).toBe("Current intentional answer");
    expect(runtime.handler).toHaveBeenCalledOnce();
    runtime.dispose();
    expect(consumer.listenerCount(eventName)).toBe(0);
  });

  it.each(["mostrar só praias", "mostrar todos os locais", "próximo", "ajuda"])(
    "keeps current residual/menu/response-owned operations valid: %s",
    async (input) => {
      const consumer = actualPlaceDetailConsumer("pt", (id) =>
        canonicalDetail(id),
      );
      await consumer.execute({ type: "open_category", category: "beaches" });
      await consumer.select(canonicalLocation("place-b"));
      consumer.click("place-action:info:place-b");
      const runtime = actualConversationRuntime(consumer, {
        response: {
          text: "Current mapped action",
          metadata: { action: "show_place:Primeira Praia" },
        },
      });
      const response = await runtime.process(input);
      expect(response.metadata?.state).not.toBe("superseded");
      expect(runtime.voice.speak).toHaveBeenCalledExactlyOnceWith(
        response.text,
        "pt",
      );
      expect(runtime.execute).toHaveBeenCalledOnce();
      expect(runtime.uiStates.at(-1)).toBe("success");
    },
  );
});

describe("confirmed details locale refresh", () => {
  it("keeps the opened description while loading and links the translated details without selecting again", async () => {
    const english = deferredDetail();
    const requested: string[] = [];
    const consumer = actualPlaceDetailConsumer("pt", (id, { locale }) => {
      requested.push(locale);
      return locale === "pt"
        ? canonicalDetail(id, "Detalhes confirmados")
        : english.promise;
    });
    await consumer.select(canonicalLocation("place-a"));
    consumer.click("place-action:info:place-a");
    const previous = consumer.conversation.recentTurns().at(-1)!;
    consumer.changeLocale("en");
    expect(consumer.messages.at(-1)?.description).toBe("Detalhes confirmados");
    expect(consumer.presenter().conversationTurnId).toBe(previous.id);
    english.resolve(canonicalDetail("place-a", "Confirmed English details"));
    await settleDetailRefresh();
    const translated = consumer.conversation.recentTurns().at(-1)!;
    expect(translated).toMatchObject({
      previousTurnId: previous.id,
      cause: "place_details",
      messageKey: "place_details",
      priority: "explicit",
      renderedText: "Confirmed English details",
      entities: { placeId: "place-a" },
    });
    expect(consumer.presenter()).toMatchObject({
      conversationTurnId: translated.id,
      previousConversationTurnId: previous.id,
      conversationCause: "place_details",
      conversationPriority: "explicit",
    });
    expect(consumer.messages.at(-1)?.description).toBe(
      "Confirmed English details",
    );
    expect(requested).toEqual(["pt", "en"]);
    expect(consumer.snapshot().mapCalls).toBe(1);
    consumer.click("place-action:info:place-a");
    expect(consumer.conversation.recentTurns()).toHaveLength(2);
    expect(consumer.presenter().conversationTurnId).toBe(translated.id);
  });

  it("keeps the latest locale when PT, EN and HE details complete out of order", async () => {
    const english = deferredDetail();
    const hebrew = deferredDetail();
    const consumer = actualPlaceDetailConsumer("pt", (id, { locale }) =>
      locale === "pt"
        ? canonicalDetail(id, "Descrição em português")
        : locale === "en"
          ? english.promise
          : hebrew.promise,
    );
    await consumer.select(canonicalLocation("place-a"));
    consumer.click("place-action:info:place-a");
    const previous = consumer.conversation.recentTurns().at(-1)!;
    consumer.changeLocale("en");
    consumer.changeLocale("he");
    hebrew.resolve(canonicalDetail("place-a", "פרטים מאומתים"));
    await settleDetailRefresh();
    expect(consumer.messages.at(-1)?.description).toBe("פרטים מאומתים");
    const current = consumer.conversation.recentTurns().at(-1)!;
    expect(current.previousTurnId).toBe(previous.id);
    english.resolve(canonicalDetail("place-a", "Outdated English details"));
    await settleDetailRefresh();
    consumer.click("place-action:info:place-a");
    expect(consumer.messages.at(-1)?.description).toBe("פרטים מאומתים");
    expect(consumer.presenter().conversationTurnId).toBe(current.id);
    expect(consumer.conversation.recentTurns()).toHaveLength(2);
  });

  it("does not restore place A after selecting same-named place B during locale loading", async () => {
    const englishA = deferredDetail();
    const consumer = actualPlaceDetailConsumer("pt", (id, { locale }) =>
      locale === "en" && id === "place-a"
        ? englishA.promise
        : canonicalDetail(id, `Details for ${id}`),
    );
    await consumer.select(canonicalLocation("place-a"));
    consumer.click("place-action:info:place-a");
    consumer.changeLocale("en");
    await consumer.select(canonicalLocation("place-b"));
    englishA.resolve(canonicalDetail("place-a", "Obsolete A details"));
    await settleDetailRefresh();
    expect(consumer.messages.at(-1)?.description).toBe("");
    expect(consumer.presenter().conversationTurnId).toBeUndefined();
    consumer.click("place-action:info:place-a");
    expect(consumer.conversation.recentTurns()).toHaveLength(1);
    consumer.click("place-action:info:place-b");
    expect(consumer.messages.at(-1)?.description).toBe("Details for place-b");
    expect(consumer.conversation.recentTurns().at(-1)?.entities.placeId).toBe(
      "place-b",
    );
  });

  it("does not inherit opened details when the same ID is selected anew", async () => {
    const consumer = actualPlaceDetailConsumer("pt", (id) =>
      canonicalDetail(id),
    );
    await consumer.select(canonicalLocation("place-a"));
    consumer.click("place-action:info:place-a");
    await consumer.select(canonicalLocation("place-a"));
    consumer.changeLocale("en");
    await settleDetailRefresh();
    expect(consumer.messages.at(-1)?.description).toBe("");
    expect(consumer.presenter().conversationTurnId).toBeUndefined();
    expect(consumer.conversation.recentTurns()).toHaveLength(1);
  });

  it.each(["profile", "actions", "empty", "error"] as const)(
    "preserves confirmed text without inventing a translated turn for %s details",
    async (scenario) => {
      const english = deferredDetail();
      const consumer = actualPlaceDetailConsumer("pt", (id, { locale }) =>
        locale === "pt"
          ? canonicalDetail(id, "Texto confirmado")
          : english.promise,
      );
      await consumer.select(canonicalLocation("place-a"));
      consumer.click("place-action:info:place-a");
      const previous = consumer.conversation.recentTurns().at(-1)!;
      consumer.changeLocale("en");
      const invalid = canonicalDetail("place-a");
      if (scenario === "profile") invalid.profile.id = "place-b";
      if (scenario === "actions") invalid.actions.placeId = "place-b";
      if (scenario === "empty") invalid.profile.description = " ";
      if (scenario === "error")
        english.reject(Error("translation unavailable"));
      else english.resolve(invalid);
      await settleDetailRefresh();
      consumer.click("place-action:info:place-a");
      expect(consumer.messages.at(-1)?.description).toBe("Texto confirmado");
      expect(consumer.presenter().conversationTurnId).toBe(previous.id);
      expect(consumer.conversation.recentTurns()).toHaveLength(1);
    },
  );

  it.each(["pending request", "completed turn"])(
    "does not reopen translated details over a newer assistant %s",
    async (scenario) => {
      const english = deferredDetail();
      const consumer = actualPlaceDetailConsumer("pt", (id, { locale }) =>
        locale === "pt"
          ? canonicalDetail(id, "Texto confirmado")
          : english.promise,
      );
      await consumer.select(canonicalLocation("place-a"));
      consumer.click("place-action:info:place-a");
      consumer.changeLocale("en");
      consumer.conversation.issueSequence();
      if (scenario === "completed turn") {
        consumer.conversation.transition({
          cause: "assistant_response",
          messageKey: "assistant_response",
          renderedText: "A newer intentional answer",
          priority: "explicit",
        });
      }
      const current = consumer.conversation.recentTurns().at(-1)!;
      const turnCount = consumer.conversation.recentTurns().length;
      english.resolve(canonicalDetail("place-a", "Confirmed English details"));
      await settleDetailRefresh();
      expect(consumer.conversation.snapshot().lastMeaningfulTurn).toBe(
        current.id,
      );
      expect(consumer.conversation.recentTurns()).toHaveLength(turnCount);
      expect(consumer.messages.at(-1)?.description).toBe("Texto confirmado");
      consumer.click("place-action:info:place-a");
      expect(consumer.messages.at(-1)?.description).toBe(
        "Confirmed English details",
      );
      expect(consumer.conversation.recentTurns().at(-1)?.previousTurnId).toBe(
        current.id,
      );
    },
  );
});
