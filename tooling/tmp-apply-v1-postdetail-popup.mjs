import { readFile, writeFile } from "node:fs/promises";

async function patch(path, replacements) {
  let source = await readFile(path, "utf8");
  for (const [before, after, label] of replacements) {
    if (!source.includes(before)) {
      throw new Error(`${path}: missing patch anchor: ${label}`);
    }
    source = source.replace(before, after);
  }
  await writeFile(path, source);
}

await patch("packages/geospatial/src/provider.ts", [
  [
    `export interface MapMarker {\n  readonly id: string;\n  readonly position: Coordinates;\n  readonly label?: string;\n}`,
    `export interface MapMarker {\n  readonly id: string;\n  readonly position: Coordinates;\n  readonly label?: string;\n  readonly openPopup?: boolean;\n}`,
    "MapMarker openPopup",
  ],
]);

await patch("packages/geospatial/src/adapters/mapbox.ts", [
  [
    `  createMarker(input: {\n    readonly id: string;\n    readonly label?: string;\n  }): MapboxMarkerHandle;`,
    `  createMarker(input: {\n    readonly id: string;\n    readonly label?: string;\n    readonly openPopup?: boolean;\n  }): MapboxMarkerHandle;`,
    "driver marker input",
  ],
  [
    `        const handle = options.driver.createMarker({\n          id: marker.id,\n          ...(marker.label ? { label: marker.label } : {}),\n        });`,
    `        const handle = options.driver.createMarker({\n          id: marker.id,\n          ...(marker.label ? { label: marker.label } : {}),\n          ...(marker.openPopup ? { openPopup: true } : {}),\n        });`,
    "pass openPopup",
  ],
]);

await patch("packages/geospatial/src/infrastructure/mapbox-gl-driver.ts", [
  [
    `export interface MapboxGlMapLike {\n  setCenter(center: [number, number]): void;\n  remove(): void;`,
    `export interface MapboxGlMapLike {\n  setCenter(center: [number, number]): void;\n  setZoom?(zoom: number): void;\n  getZoom?(): number;\n  getCenter?(): Readonly<{ lng: number; lat: number }>;\n  flyTo?(options: {\n    readonly center: [number, number];\n    readonly zoom?: number;\n    readonly duration?: number;\n    readonly essential?: boolean;\n  }): void;\n  remove(): void;`,
    "map camera compatibility",
  ],
  [
    `export interface MapboxGlMarkerLike {\n  setLngLat(coordinates: [number, number]): MapboxGlMarkerLike;\n  addTo(map: MapboxGlMapLike): MapboxGlMarkerLike;\n  remove(): void;\n}`,
    `export interface MapboxGlPopupLike {\n  setText(text: string): MapboxGlPopupLike;\n}\n\nexport interface MapboxGlMarkerLike {\n  setLngLat(coordinates: [number, number]): MapboxGlMarkerLike;\n  setPopup?(popup: MapboxGlPopupLike): MapboxGlMarkerLike;\n  togglePopup?(): MapboxGlMarkerLike;\n  addTo(map: MapboxGlMapLike): MapboxGlMarkerLike;\n  remove(): void;\n}`,
    "marker popup compatibility",
  ],
  [
    `  Marker: new (options?: {\n    readonly element?: HTMLElement;\n    readonly anchor?: string;\n  }) => MapboxGlMarkerLike;\n}`,
    `  Marker: new (options?: {\n    readonly element?: HTMLElement;\n    readonly anchor?: string;\n  }) => MapboxGlMarkerLike;\n  Popup?: new (options?: { readonly closeButton?: boolean }) => MapboxGlPopupLike;\n}`,
    "optional Popup constructor",
  ],
  [
    `      const marker = new options.sdk.Marker(\n        element ? { element, anchor: "bottom" } : undefined,\n      );\n\n      const handle: MapboxMarkerHandle = Object.freeze({`,
    `      const marker = new options.sdk.Marker(\n        element ? { element, anchor: "bottom" } : undefined,\n      );\n      if (input.label && options.sdk.Popup && marker.setPopup) {\n        const popup = new options.sdk.Popup({ closeButton: false });\n        marker.setPopup(popup.setText(input.label));\n      }\n\n      const handle: MapboxMarkerHandle = Object.freeze({`,
    "attach safe text popup",
  ],
  [
    `          marker.addTo(nativeMap);\n          return handle;`,
    `          marker.addTo(nativeMap);\n          if (input.openPopup) marker.togglePopup?.();\n          return handle;`,
    "open selected popup",
  ],
]);

await patch("apps/morro-digital-platform/src/assistant/browser-assistant-runtime.ts", [
  [
    `  renderAssistantDomOptions,\n} from "./assistant-dom-view.js";`,
    `  renderAssistantDomOptions,\n  type AssistantDomOption,\n} from "./assistant-dom-view.js";`,
    "AssistantDomOption import",
  ],
  [
    `function resolveStorage(\n  document: Document,`,
    `function readOptionOverride(value: unknown): readonly AssistantDomOption[] | null {\n  if (!Array.isArray(value) || value.length === 0) return null;\n  const result: AssistantDomOption[] = [];\n  for (const option of value) {\n    if (!option || typeof option !== "object") return null;\n    const label = Reflect.get(option, "label");\n    const optionValue = Reflect.get(option, "value");\n    if (typeof label !== "string" || typeof optionValue !== "string") {\n      return null;\n    }\n    result.push(Object.freeze({ label, value: optionValue }));\n  }\n  return Object.freeze(result);\n}\n\nfunction resolveStorage(\n  document: Document,`,
    "option override parser",
  ],
  [
    `  const process = async (\n    rawInput: string,\n  ): Promise<AssistantDialogResponse> => {`,
    `  const processInput = async (\n    rawInput: string,\n    optionOverride?: readonly AssistantDomOption[],\n  ): Promise<AssistantDialogResponse> => {`,
    "internal processInput",
  ],
  [
    `    const responseOptions = readAssistantResponseOptions(response);\n    if (responseOptions.length > 0) {\n      renderAssistantDomOptions(options.document, responseOptions);\n    }`,
    `    const responseOptions =\n      optionOverride ?? readAssistantResponseOptions(response);\n    if (responseOptions.length > 0) {\n      renderAssistantDomOptions(options.document, responseOptions);\n    }`,
    "override response options",
  ],
  [
    `    return response;\n  };\n\n  const Recognition = view`,
    `    return response;\n  };\n\n  const process = (rawInput: string): Promise<AssistantDialogResponse> =>\n    processInput(rawInput);\n\n  const Recognition = view`,
    "public process wrapper",
  ],
  [
    `  const onOptionSelected = (event: Event): void => {\n    if (!(event instanceof CustomEvent)) return;\n    const detail = event.detail as { value?: unknown } | null;\n    const value = typeof detail?.value === "string" ? detail.value : "";\n    if (value) void process(value);\n  };`,
    `  const onOptionSelected = (event: Event): void => {\n    if (!(event instanceof CustomEvent)) return;\n    const detail = event.detail as\n      | { value?: unknown; optionsOverride?: unknown }\n      | null;\n    const value = typeof detail?.value === "string" ? detail.value : "";\n    if (!value || value.startsWith("[sub]")) return;\n    const optionOverride = readOptionOverride(detail?.optionsOverride);\n    void processInput(value, optionOverride ?? undefined);\n  };`,
    "option override event",
  ],
]);

await patch("apps/morro-digital-platform/src/map/explore-locations-control.ts", [
  [
    `import {\n  filterV1ExploreLocations,`,
    `import { getV1ExplorePlaceActionOptions } from "./explore-location-actions-v1.js";\nimport {\n  filterV1ExploreLocations,`,
    "post-detail action import",
  ],
  [
    `type ExploreStage = "menu" | "filters" | "places" | "tour";`,
    `type ExploreStage = "menu" | "filters" | "places" | "detail" | "tour";`,
    "detail stage",
  ],
  [
    `function markerForLocation(\n  location: MorroV1SearchCatalogItem,\n  index: number,\n): MapMarker {`,
    `function markerForLocation(\n  location: MorroV1SearchCatalogItem,\n  index: number,\n  openPopup = false,\n): MapMarker {`,
    "marker openPopup argument",
  ],
  [
    `    label: location.name,\n  });`,
    `    label: location.name,\n    ...(openPopup ? { openPopup: true } : {}),\n  });`,
    "selected marker popup flag",
  ],
  [
    `  if (locations.length === 1) {\n    const location = locations[0];\n    if (!location) return;\n    if (geospatialEngine?.initialized) {\n      void geospatialEngine.setCenter({\n        latitude: location.latitude,\n        longitude: location.longitude,\n      });\n    } else {\n      map?.setCenter([location.longitude, location.latitude]);\n    }\n    return;\n  }`,
    `  if (locations.length === 1) {\n    const location = locations[0];\n    if (!location) return;\n    if (map?.flyTo) {\n      map.flyTo({\n        center: [location.longitude, location.latitude],\n        zoom: 16,\n        duration: 650,\n        essential: true,\n      });\n    } else if (map) {\n      map.setCenter([location.longitude, location.latitude]);\n      map.setZoom?.(16);\n    } else if (geospatialEngine?.initialized) {\n      void geospatialEngine.setCenter({\n        latitude: location.latitude,\n        longitude: location.longitude,\n      });\n    }\n    return;\n  }`,
    "V1 selected camera zoom",
  ],
  [
    `  const renderLocationsOnMap = async (\n    locations: readonly MorroV1SearchCatalogItem[],\n    category: string,\n  ): Promise<void> => {`,
    `  const renderLocationsOnMap = async (\n    locations: readonly MorroV1SearchCatalogItem[],\n    category: string,\n    openSelectedPopup = false,\n  ): Promise<void> => {`,
    "render popup parameter",
  ],
  [
    `        locations.map((location, index) => markerForLocation(location, index)),`,
    `        locations.map((location, index) =>\n          markerForLocation(\n            location,\n            index,\n            openSelectedPopup && locations.length === 1,\n          ),\n        ),`,
    "marker popup mapping",
  ],
  [
    `    activeStage = "places";\n    removeAssistantFlowResults(document);\n    await renderLocationsOnMap([location], activeCategory.value);`,
    `    activeStage = "detail";\n    removeAssistantFlowResults(document);\n    await renderLocationsOnMap([location], activeCategory.value, true);`,
    "selected detail stage",
  ],
  [
    `    document.dispatchEvent(\n      new CustomEvent("morro:assistant-option-selected", {\n        detail: { value: createExploreLocationDetailsCommand(location.name) },\n      }),\n    );`,
    `    const optionsOverride = getV1ExplorePlaceActionOptions(\n      activeCategory.value,\n    ).map(({ label, value }) => Object.freeze({ label, value }));\n    document.dispatchEvent(\n      new CustomEvent("morro:assistant-option-selected", {\n        detail: {\n          value: createExploreLocationDetailsCommand(location.name),\n          optionsOverride: Object.freeze(optionsOverride),\n        },\n      }),\n    );`,
    "dispatch V1 detail options",
  ],
  [
    `    const value = typeof candidate === "string" ? candidate : "";\n    if (!isBackToMenuValue(value)) return;\n    event.stopImmediatePropagation();\n    backToMenu(false);`,
    `    const value = typeof candidate === "string" ? candidate : "";\n    if (\n      activeStage === "detail" &&\n      activeCategory &&\n      value === \`[sub]\${activeCategory.value}\`\n    ) {\n      event.stopImmediatePropagation();\n      const allLocations = getExploreLocationsForCategory(activeCategory.value);\n      renderPlaces(\n        allLocations,\n        \`${activeCategory.label}: escolha outro local para ver os detalhes.\`,\n      );\n      return;\n    }\n    if (!isBackToMenuValue(value)) return;\n    event.stopImmediatePropagation();\n    backToMenu(false);`,
    "detail back to places",
  ],
]);

await patch(".github/workflows/v1-explore-locations-browser-regression.yml", [
  [
    `      - apps/morro-digital-platform/src/map/explore-locations-control.ts\n      - apps/morro-digital-platform/src/map/explore-locations-v1-flow.ts`,
    `      - apps/morro-digital-platform/src/map/explore-locations-control.ts\n      - apps/morro-digital-platform/src/map/explore-location-actions-v1.ts\n      - apps/morro-digital-platform/src/map/explore-location-actions-v1.test.ts\n      - apps/morro-digital-platform/src/map/explore-locations-v1-flow.ts`,
    "action workflow paths",
  ],
  [
    `      - apps/morro-digital-platform/src/assistant/**\n      - apps/morro-digital-platform/src/map/explore-locations-control.ts`,
    `      - apps/morro-digital-platform/src/assistant/**\n      - packages/geospatial/src/**\n      - apps/morro-digital-platform/src/map/explore-locations-control.ts`,
    "geospatial workflow path",
  ],
  [
    `          async function waitForMapCenter(page, longitude, latitude) {\n            const deadline = Date.now() + 6000;\n            let last = null;\n            while (Date.now() < deadline) {\n              last = await page.evaluate(() => {\n                const center = globalThis.mapboxPrimaryInstance?.getCenter?.();\n                return center ? { lng: center.lng, lat: center.lat } : null;\n              });\n              if (last && Math.abs(last.lng - longitude) < 0.001 && Math.abs(last.lat - latitude) < 0.001) return last;\n              await new Promise(resolve => setTimeout(resolve, 100));\n            }\n            throw new Error(\`Selected location did not recenter map: \${JSON.stringify(last)}\`);\n          }`,
    `          async function waitForSelectedMapCamera(page, longitude, latitude) {\n            const deadline = Date.now() + 6000;\n            let last = null;\n            while (Date.now() < deadline) {\n              last = await page.evaluate(() => {\n                const map = globalThis.mapboxPrimaryInstance;\n                const center = map?.getCenter?.();\n                return center ? { lng: center.lng, lat: center.lat, zoom: map?.getZoom?.() } : null;\n              });\n              if (\n                last &&\n                Math.abs(last.lng - longitude) < 0.001 &&\n                Math.abs(last.lat - latitude) < 0.001 &&\n                typeof last.zoom === 'number' &&\n                Math.abs(last.zoom - 16) < 0.05\n              ) return last;\n              await new Promise(resolve => setTimeout(resolve, 100));\n            }\n            throw new Error(\`Selected location did not reach the V1 camera: \${JSON.stringify(last)}\`);\n          }`,
    "selected camera helper",
  ],
  [
    `              await page.locator('#assistant-category-results [data-location-name="Primeira Praia"]').click();\n              await waitMap(page, 'beaches', 1, 'places');\n              const center = await waitForMapCenter(page, -38.9142193, -13.3776181);\n              const selected = await page.evaluate(() => ({`,
    `              await page.locator('#assistant-category-results [data-location-name="Primeira Praia"]').click();\n              await waitMap(page, 'beaches', 1, 'detail');\n              const center = await waitForSelectedMapCamera(page, -38.9142193, -13.3776181);\n              await page.locator('.mapboxgl-popup').filter({ hasText: 'Primeira Praia' }).waitFor({ state: 'visible', timeout: 5000 });\n              await page.locator('.assistant-options .assistant-option-btn[data-value="condições da praia"]').waitFor({ state: 'visible', timeout: 8000 });\n              const selected = await page.evaluate(() => ({`,
    "selected popup and detail stage",
  ],
  [
    `                activeTour: document.getElementById('map')?.getAttribute('data-active-tour'),\n              }));\n              if (!selected.flowRemoved || !selected.mainHidden || selected.markerCount !== '1' || selected.activeTour !== null || !selected.selectedValues.includes('Fale sobre Primeira Praia')) {\n                throw new Error(\`Location selection diverged in \${viewport.id}: \${JSON.stringify(selected)}\`);\n              }`,
    `                activeTour: document.getElementById('map')?.getAttribute('data-active-tour'),\n                popupText: document.querySelector('.mapboxgl-popup')?.textContent?.trim() ?? '',\n                detailValues: Array.from(\n                  document.querySelectorAll('.assistant-options:not(:has([data-explore-category])) .assistant-option-btn'),\n                  button => button.getAttribute('data-value'),\n                ),\n              }));\n              const expectedBeachDetailValues = [\n                'condições da praia',\n                'como chegar',\n                'ver fotos',\n                'informações',\n                'mais opções',\n                '[sub]beaches',\n              ];\n              if (\n                !selected.flowRemoved ||\n                !selected.mainHidden ||\n                selected.markerCount !== '1' ||\n                selected.activeTour !== null ||\n                !selected.selectedValues.includes('Fale sobre Primeira Praia') ||\n                !selected.popupText.includes('Primeira Praia') ||\n                JSON.stringify(selected.detailValues) !== JSON.stringify(expectedBeachDetailValues)\n              ) {\n                throw new Error(\`Location selection diverged in \${viewport.id}: \${JSON.stringify(selected)}\`);\n              }\n\n              await page.locator('.assistant-options .assistant-option-btn[data-value="[sub]beaches"]').click();\n              await page.locator('#assistant-category-results[data-stage="places"]').waitFor({ state: 'visible', timeout: 5000 });\n              await waitMap(page, 'beaches', 8, 'places');\n              const returnedPlaces = await page.locator('#assistant-category-results [data-location-name]').count();\n              if (returnedPlaces !== 8) {\n                throw new Error(\`Detail back did not restore the V1 places list: \${returnedPlaces}\`);\n              }`,
    "detail option matrix and back behavior",
  ],
]);
