from pathlib import Path

root = Path("apps/morro-digital-platform/src")
control = root / "map/explore-locations-control.ts"
runtime = root / "assistant/browser-assistant-runtime.ts"
adapter = root / "assistant/assistant-v1-residual-command-adapter.ts"


def once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


c = control.read_text(encoding="utf-8")
c = once(
    c,
    '  | Readonly<{ type: "select_place"; place: string }>\n  | Readonly<{ type: "back_to_filters" }>\n  | Readonly<{ type: "back_to_menu" }>;',
    '  | Readonly<{ type: "select_place"; place: string }>\n  | Readonly<{ type: "map_filter_category"; category: string }>\n  | Readonly<{ type: "show_all_locations" }>\n  | Readonly<{ type: "back_to_filters" }>\n  | Readonly<{ type: "back_to_menu" }>;',
    "explore command union",
)

map_only = r'''
  const renderMapOnlyLocations = async (
    locations: readonly MorroV1SearchCatalogItem[],
    category?: string,
  ): Promise<boolean> => {
    if (!geospatialEngine?.initialized) return false;
    const generation = ++interactionGeneration;
    clearTourPresentation(document);
    removeAssistantFlowResults(document);
    resetCategoryTriggerState();
    activeCategory = undefined;
    activeCategoryButton = undefined;
    activePlace = undefined;
    activeStage = "menu";
    visibleLocations = Object.freeze([...locations]);
    showMainMenu();
    updateMapState(locations.length, category, "loading");

    try {
      await geospatialEngine.replaceMarkers(
        locations.map((location, index) => markerForLocation(location, index)),
      );
      if (generation !== interactionGeneration) return false;
      updateMapState(locations.length, category, "ready");
      frameLocationsOnMap(locations, geospatialEngine);
      emitStateChange();
      return true;
    } catch (error) {
      if (generation !== interactionGeneration) return false;
      updateMapState(0, undefined, "error");
      try {
        await geospatialEngine.replaceMarkers([]);
      } catch {
        // Preserve the first provider failure for diagnostics.
      }
      emitStateChange();
      document
        .getElementById("runtime-status")
        ?.replaceChildren(
          document.createTextNode(
            getV1ExploreUiCopy(currentLocale()).mapCategoryError(
              describeExploreError(error, currentLocale()),
            ),
          ),
        );
      return false;
    }
  };

'''
c = once(
    c,
    '  const execute = async (\n    command: ExploreLocationsCommand,\n  ): Promise<boolean> => {',
    map_only + '  const execute = async (\n    command: ExploreLocationsCommand,\n  ): Promise<boolean> => {',
    "map-only renderer insertion",
)

c = once(
    c,
    '    if (command.type === "select_place") {\n      const normalized = normalizeSearchText(command.place);',
    '    if (command.type === "map_filter_category") {\n      const locations = getExploreLocationsForCategory(command.category);\n      if (locations.length === 0) return false;\n      return renderMapOnlyLocations(locations, command.category);\n    }\n\n    if (command.type === "show_all_locations") {\n      return renderMapOnlyLocations(morroV1SearchCatalog);\n    }\n\n    if (command.type === "select_place") {\n      const normalized = normalizeSearchText(command.place);',
    "map-only execute branches",
)
control.write_text(c, encoding="utf-8")

r = runtime.read_text(encoding="utf-8")
r = once(
    r,
    'import { resolveAssistantV1PlaceAction } from "./assistant-v1-place-action-adapter.js";\n',
    'import { resolveAssistantV1PlaceAction } from "./assistant-v1-place-action-adapter.js";\nimport {\n  executeAssistantV1ResidualCommand,\n  resolveAssistantV1ResidualCommand,\n  type AssistantV1MapCommandMap,\n} from "./assistant-v1-residual-command-adapter.js";\n',
    "residual adapter import",
)
r = once(
    r,
    '  readonly __MORRO_RUNTIME_ENV__?: {\n    readonly VITE_MAPBOX_ACCESS_TOKEN?: string;\n  };\n}',
    '  readonly __MORRO_RUNTIME_ENV__?: {\n    readonly VITE_MAPBOX_ACCESS_TOKEN?: string;\n    readonly VITE_MAPBOX_STYLE?: string;\n  };\n  readonly mapboxPrimaryInstance?: AssistantV1MapCommandMap;\n}',
    "runtime environment map fields",
)
r = once(
    r,
    '  const view = options.document.defaultView;\n  const onNavigationEnded = (event: Event): void => {',
    '  const view = options.document.defaultView;\n  let navigationActive = false;\n  const onNavigationStarted = (): void => {\n    navigationActive = true;\n  };\n  const onNavigationEnded = (event: Event): void => {\n    navigationActive = false;',
    "navigation active state",
)
r = once(
    r,
    '  view?.addEventListener("navigationEnded", onNavigationEnded);',
    '  view?.addEventListener("navigationStarted", onNavigationStarted);\n  view?.addEventListener("navigationEnded", onNavigationEnded);',
    "navigation started listener",
)

residual_block = r'''
    const residualCommand = resolveAssistantV1ResidualCommand(value);
    if (residualCommand) {
      const residualContext = context.getContext();
      const runtimeGlobal = globalThis as typeof globalThis &
        AssistantRuntimeEnvironmentGlobal;
      const defaultMapStyle =
        runtimeGlobal.__MORRO_RUNTIME_ENV__?.VITE_MAPBOX_STYLE?.trim();
      const response = await executeAssistantV1ResidualCommand({
        command: residualCommand,
        language: presentationLanguage(),
        history: residualContext.history,
        ...(runtimeGlobal.mapboxPrimaryInstance
          ? { map: runtimeGlobal.mapboxPrimaryInstance }
          : {}),
        ...(options.explore ? { explore: options.explore } : {}),
        ...(defaultMapStyle ? { defaultMapStyle } : {}),
        navigationActive,
      });
      if (destroyed || generation !== requestGeneration) {
        return supersededResponse();
      }

      clearAssistantDomOptions(options.document);
      removePhotoPresentation(options.document);
      appendStandardMessage("user", submittedValue);
      appendStandardMessage("assistant", response.text);
      const responseOptions = readAssistantResponseOptions(response);
      if (responseOptions.length > 0) {
        renderAssistantDomOptions(options.document, responseOptions);
      }
      currentPresentation = snapshotPresentation(
        response.text,
        responseOptions,
      );
      context.updateContext({
        lastIntent:
          residualCommand.type === "history" ? "history" : "map_command",
        fallbackCount: 0,
      });
      context.addToHistory({ input: submittedValue, response: response.text });
      options.document.dispatchEvent(
        new CustomEvent("morro:assistant-residual-command-routed", {
          detail: {
            command: residualCommand.type,
            source,
            state: response.metadata?.state ?? null,
          },
        }),
      );
      voice?.speak(response.text, voiceLanguage());
      return response;
    }

'''
r = once(
    r,
    '    const generation = ++requestGeneration;\n    const placeActionContext = context.getContext();',
    '    const generation = ++requestGeneration;\n' + residual_block + '    const placeActionContext = context.getContext();',
    "residual runtime route",
)
r = once(
    r,
    '      view?.removeEventListener("navigationEnded", onNavigationEnded);',
    '      view?.removeEventListener("navigationStarted", onNavigationStarted);\n      view?.removeEventListener("navigationEnded", onNavigationEnded);',
    "navigation listener cleanup",
)
runtime.write_text(r, encoding="utf-8")

a = adapter.read_text(encoding="utf-8")
a = once(
    a,
    '    options: mapCommandOptions(language),',
    '    options: [...mapCommandOptions(language)],',
    "dialog options mutability",
)
a = once(
    a,
    '`🔍 Zoom ${language === "he" ? "" : ""}${target.toFixed(0)}.`,',
    '`🔍 Zoom ${target.toFixed(0)}.`,',
    "zoom response cleanup",
)
adapter.write_text(a, encoding="utf-8")
