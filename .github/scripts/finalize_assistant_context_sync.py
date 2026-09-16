from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected 1 match, got {count}: {old[:140]!r}")
    target.write_text(text.replace(old, new, 1))


explore = "apps/morro-digital-platform/src/map/explore-locations-control.ts"
replace_once(
    explore,
    '''export interface ExploreLocationsStateSnapshot {
  readonly category: string | null;
  readonly stage: ExploreStage;
  readonly markerCount: number;
}''',
    '''export interface ExploreLocationsStateSnapshot {
  readonly category: string | null;
  readonly place: string | null;
  readonly stage: ExploreStage;
  readonly markerCount: number;
}''',
)
replace_once(
    explore,
    '''  let activeCategory: ExploreLocationsCategory | undefined;
  let activeStage: ExploreStage = "menu";
  let visibleLocations: readonly MorroV1SearchCatalogItem[] = Object.freeze([]);''',
    '''  let activeCategory: ExploreLocationsCategory | undefined;
  let activePlace: string | undefined;
  let activeStage: ExploreStage = "menu";
  let visibleLocations: readonly MorroV1SearchCatalogItem[] = Object.freeze([]);''',
)
replace_once(
    explore,
    '''  const categoryListeners = new Map<HTMLButtonElement, EventListener>();
  const categories = getExploreLocationsCategories();

  const updateMapState = (''',
    '''  const categoryListeners = new Map<HTMLButtonElement, EventListener>();
  const categories = getExploreLocationsCategories();

  const stateSnapshot = (): ExploreLocationsStateSnapshot =>
    Object.freeze({
      category: activeCategory?.value ?? null,
      place: activeStage === "detail" ? activePlace ?? null : null,
      stage: activeStage,
      markerCount: Number(
        document.getElementById("map")?.dataset.mapMarkerCount ?? "0",
      ),
    });

  const emitStateChange = (): void => {
    document.dispatchEvent(
      new CustomEvent("morro:explore-state-changed", {
        detail: stateSnapshot(),
      }),
    );
  };

  const updateMapState = (''',
)
replace_once(
    explore,
    '''    mapElement?.setAttribute("data-explore-stage", activeStage);
  };''',
    '''    mapElement?.setAttribute("data-explore-stage", activeStage);
    if (activeStage === "detail" && activePlace) {
      mapElement?.setAttribute("data-explore-place", activePlace);
    } else {
      mapElement?.removeAttribute("data-explore-place");
    }
  };''',
)
replace_once(
    explore,
    '''      updateMapState(locations.length, category, "ready");
      frameLocationsOnMap(locations, geospatialEngine);''',
    '''      updateMapState(locations.length, category, "ready");
      frameLocationsOnMap(locations, geospatialEngine);
      emitStateChange();''',
)
replace_once(
    explore,
    '''      document
        .getElementById("runtime-status")
        ?.replaceChildren(''',
    '''      emitStateChange();
      document
        .getElementById("runtime-status")
        ?.replaceChildren(''',
)
replace_once(
    explore,
    '''    activeCategory = undefined;
    activeCategoryButton = undefined;
    activeStage = "menu";
    visibleLocations = Object.freeze([]);''',
    '''    activeCategory = undefined;
    activeCategoryButton = undefined;
    activePlace = undefined;
    activeStage = "menu";
    visibleLocations = Object.freeze([]);''',
)
replace_once(
    explore,
    '''    updateMapState(
      Number(document.getElementById("map")?.dataset.mapMarkerCount ?? "0"),
      undefined,
    );
    if (restoreFocus) {''',
    '''    updateMapState(
      Number(document.getElementById("map")?.dataset.mapMarkerCount ?? "0"),
      undefined,
    );
    emitStateChange();
    if (restoreFocus) {''',
)
replace_once(
    explore,
    '''    const generation = ++interactionGeneration;
    activeStage = "detail";
    removeAssistantFlowResults(document);''',
    '''    const generation = ++interactionGeneration;
    activePlace = location.name;
    activeStage = "detail";
    removeAssistantFlowResults(document);''',
)
replace_once(
    explore,
    '''    document
      .getElementById("runtime-status")
      ?.replaceChildren(
        document.createTextNode(`${location.name} selecionado.`),
      );
    ensureAssistantVisible(document);''',
    '''    document
      .getElementById("runtime-status")
      ?.replaceChildren(
        document.createTextNode(`${location.name} selecionado.`),
      );
    emitStateChange();
    ensureAssistantVisible(document);''',
)
replace_once(
    explore,
    '''    if (!activeCategory) return;
    activeStage = "places";
    const options:''',
    '''    if (!activeCategory) return;
    activePlace = undefined;
    activeStage = "places";
    const options:''',
)
replace_once(
    explore,
    '''    first?.focus();
    void renderLocationsOnMap(locations, activeCategory.value);
  };

  const startImmersiveTour''',
    '''    first?.focus();
    emitStateChange();
    void renderLocationsOnMap(locations, activeCategory.value);
  };

  const startImmersiveTour''',
)
replace_once(
    explore,
    '''    if (!(tourSelect instanceof HTMLSelectElement)) return;
    activeStage = "tour";
    removeAssistantFlowResults(document);''',
    '''    if (!(tourSelect instanceof HTMLSelectElement)) return;
    activePlace = undefined;
    activeStage = "tour";
    removeAssistantFlowResults(document);''',
)
replace_once(
    explore,
    '''    tourSelect.value = tourId;
    tourSelect.dispatchEvent(new Event("change", { bubbles: true }));
  };''',
    '''    tourSelect.value = tourId;
    tourSelect.dispatchEvent(new Event("change", { bubbles: true }));
    emitStateChange();
  };''',
)
replace_once(
    explore,
    '''    if (!activeCategory) return;
    activeStage = "filters";
    const allLocations''',
    '''    if (!activeCategory) return;
    activePlace = undefined;
    activeStage = "filters";
    const allLocations''',
)
replace_once(
    explore,
    '''    first?.focus();
    void renderLocationsOnMap(allLocations, activeCategory.value);
  }
''',
    '''    first?.focus();
    emitStateChange();
    void renderLocationsOnMap(allLocations, activeCategory.value);
  }
''',
)
replace_once(
    explore,
    '''    getState: () =>
      Object.freeze({
        category: activeCategory?.value ?? null,
        stage: activeStage,
        markerCount: Number(
          document.getElementById("map")?.dataset.mapMarkerCount ?? "0",
        ),
      }),''',
    '''    getState: stateSnapshot,''',
)
replace_once(
    explore,
    '''      activeCategory = undefined;
      activeCategoryButton = undefined;
      activeStage = "menu";''',
    '''      activeCategory = undefined;
      activeCategoryButton = undefined;
      activePlace = undefined;
      activeStage = "menu";''',
)

router = "apps/morro-digital-platform/src/assistant/assistant-menu-command-router.ts"
replace_once(
    router,
    '''export interface AssistantExploreStateSnapshot {
  readonly category: string | null;
  readonly stage: string | null;
  readonly markerCount: number;
}''',
    '''export interface AssistantExploreStateSnapshot {
  readonly category: string | null;
  readonly place: string | null;
  readonly stage: string | null;
  readonly markerCount: number;
}''',
)
replace_once(
    router,
    '''  return Object.freeze({
    category: map?.getAttribute("data-explore-category") ?? null,
    stage: map?.getAttribute("data-explore-stage") ?? null,
    markerCount: Number(map?.getAttribute("data-map-marker-count") ?? "0"),
  });''',
    '''  return Object.freeze({
    category: map?.getAttribute("data-explore-category") ?? null,
    place: map?.getAttribute("data-explore-place") ?? null,
    stage: map?.getAttribute("data-explore-stage") ?? null,
    markerCount: Number(map?.getAttribute("data-map-marker-count") ?? "0"),
  });''',
)

runtime = "apps/morro-digital-platform/src/assistant/browser-assistant-runtime.ts"
replace_once(
    runtime,
    '''  let destroyed = false;
  let requestGeneration = 0;
  let currentPresentation: AssistantPresentationSnapshot | null = null;''',
    '''  let destroyed = false;
  let requestGeneration = 0;
  let currentPresentation: AssistantPresentationSnapshot | null = null;
  let profiledExploreCategory: string | null = null;
  let profiledExplorePlace: string | null = null;''',
)
replace_once(
    runtime,
    '''  const syncExploreContext = (placeHint?: string): void => {
    const state = readExploreState();
    if (state.stage === "filters" && state.category) {''',
    '''  const syncExploreContext = (placeHint?: string): void => {
    const state = readExploreState();
    const interestCategory = toProfileInterestCategory(state.category);
    if (
      interestCategory &&
      state.category !== profiledExploreCategory
    ) {
      profile.recordInteraction(state.category ?? interestCategory, interestCategory);
      profiledExploreCategory = state.category;
    }
    const selectedPlace = placeHint ?? state.place;
    if (
      selectedPlace &&
      selectedPlace !== profiledExplorePlace
    ) {
      profile.recordInteraction(
        selectedPlace,
        interestCategory,
        { name: selectedPlace, category: interestCategory },
      );
      profiledExplorePlace = selectedPlace;
    }
    if (state.stage === "filters" && state.category) {''',
)
replace_once(
    runtime,
    '''    if (state.stage === "detail" && state.category) {
      context.updateContext({
        lastCategory: state.category,
        lastIntent: "detalhes",
        awaiting: null,
        ...(placeHint ? { lastPlace: placeHint } : {}),
      });
      return;
    }
    if (state.stage === "menu") {
      context.updateContext({ awaiting: null });
    }''',
    '''    if (state.stage === "detail" && state.category) {
      context.updateContext({
        lastCategory: state.category,
        lastIntent: "detalhes",
        awaiting: null,
        ...(selectedPlace ? { lastPlace: selectedPlace } : {}),
      });
      return;
    }
    if (state.stage === "tour" && state.category) {
      context.updateContext({
        lastCategory: state.category,
        lastIntent: "tour",
        awaiting: null,
      });
      return;
    }
    if (state.stage === "menu") {
      profiledExploreCategory = null;
      profiledExplorePlace = null;
      context.updateContext({ awaiting: null });
    }''',
)
replace_once(
    runtime,
    '''    const awaitingType = context.getContext().awaiting?.type;
    const controllerOwnsTurn =
      (typeof awaitingType === "string" &&
        CONTROLLER_OWNED_AWAITING_TYPES.has(awaitingType)) ||
      (source === "option" && optionOverride !== undefined);

    let menuRouted = false;
    if (!controllerOwnsTurn) {
      if (options.explore) {
        const command = resolveAssistantMenuCommand(options.document, value);
        menuRouted = command ? await options.explore.execute(command) : false;
      } else {
        menuRouted = routeAssistantMenuCommand(options.document, value);
      }
    }''',
    '''    const awaitingType = context.getContext().awaiting?.type;
    const menuCommand = resolveAssistantMenuCommand(options.document, value);
    const explicitCategoryInterrupt =
      (awaitingType === "awaiting_place" ||
        awaitingType === "awaiting_destination") &&
      menuCommand?.type === "open_category";
    const controllerOwnsTurn =
      ((typeof awaitingType === "string" &&
        CONTROLLER_OWNED_AWAITING_TYPES.has(awaitingType)) &&
        !explicitCategoryInterrupt) ||
      (source === "option" && optionOverride !== undefined);

    let menuRouted = false;
    if (!controllerOwnsTurn) {
      if (options.explore) {
        menuRouted = menuCommand
          ? await options.explore.execute(menuCommand)
          : false;
      } else {
        menuRouted = routeAssistantMenuCommand(options.document, value);
      }
    }''',
)
replace_once(
    runtime,
    '''    if (menuRouted) {
      const routedState = readExploreState();
      profile.recordInteraction(
        value,
        toProfileInterestCategory(routedState.category),
      );
      if (context.getContext().awaiting?.type === "confirmar_navegacao") {''',
    '''    if (menuRouted) {
      if (context.getContext().awaiting?.type === "confirmar_navegacao") {''',
)
replace_once(
    runtime,
    '''      currentPresentation = null;
      queueMicrotask(() => syncExploreContext());
      options.document.dispatchEvent(''',
    '''      currentPresentation = null;
      syncExploreContext();
      options.document.dispatchEvent(''',
)
replace_once(
    runtime,
    '''      if (routedText) voice?.speak(routedText, voiceLanguage());
      return {''',
    '''      context.addToHistory({ input: value, response: routedText });
      if (routedText) voice?.speak(routedText, voiceLanguage());
      return {''',
)
replace_once(
    runtime,
    '''    if (actionExecuted && generation === requestGeneration) {
      queueMicrotask(() => syncExploreContext());''',
    '''    if (actionExecuted && generation === requestGeneration) {
      syncExploreContext();''',
)
replace_once(
    runtime,
    '''  const onExploreEscape = (event: Event): void => {
    if (!(event instanceof KeyboardEvent) || event.key !== "Escape") return;
    queueMicrotask(() => syncExploreContext());
  };

  sendButton?.addEventListener("click", onSendClick);''',
    '''  const onExploreEscape = (event: Event): void => {
    if (!(event instanceof KeyboardEvent) || event.key !== "Escape") return;
    queueMicrotask(() => syncExploreContext());
  };
  const onExploreStateChanged = (): void => syncExploreContext();

  sendButton?.addEventListener("click", onSendClick);''',
)
replace_once(
    runtime,
    '''  options.document.addEventListener(
    "morro:assistant-option-selected",
    scheduleExploreContextSync,
    true,
  );
  options.document.addEventListener("click", scheduleExploreContextSync, true);
  options.document.addEventListener("keydown", onExploreEscape, true);''',
    '''  if (options.explore) {
    options.document.addEventListener(
      "morro:explore-state-changed",
      onExploreStateChanged,
    );
  } else {
    options.document.addEventListener(
      "morro:assistant-option-selected",
      scheduleExploreContextSync,
      true,
    );
    options.document.addEventListener("click", scheduleExploreContextSync, true);
    options.document.addEventListener("keydown", onExploreEscape, true);
  }''',
)
replace_once(
    runtime,
    '''      options.document.removeEventListener(
        "morro:assistant-option-selected",
        scheduleExploreContextSync,
        true,
      );
      options.document.removeEventListener(
        "click",
        scheduleExploreContextSync,
        true,
      );
      options.document.removeEventListener("keydown", onExploreEscape, true);''',
    '''      if (options.explore) {
        options.document.removeEventListener(
          "morro:explore-state-changed",
          onExploreStateChanged,
        );
      } else {
        options.document.removeEventListener(
          "morro:assistant-option-selected",
          scheduleExploreContextSync,
          true,
        );
        options.document.removeEventListener(
          "click",
          scheduleExploreContextSync,
          true,
        );
        options.document.removeEventListener("keydown", onExploreEscape, true);
      }''',
)
