from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 match, got {count}")
    return text.replace(old, new, 1)


# 1) Browser-entry: preserve Explore ownership of the shared aria-live status.
path = Path("apps/morro-digital-platform/src/browser-entry.ts")
text = path.read_text()
text = replace_once(
    text,
    '''function renderRuntimeAccessibility(): void {\n  applyRuntimeAccessibilityPresentation(document);\n  if (status) {\n    status.textContent = formatRuntimeStatus(\n      runtimeStatusDescriptor,\n      document.documentElement.lang,\n    );\n  }\n}\n\nfunction updateStatus(descriptor: RuntimeStatusDescriptor): void {\n  runtimeStatusDescriptor = Object.freeze(descriptor);\n  renderRuntimeAccessibility();\n}\n\nconst runtimeAccessibilityLocaleObserver = new MutationObserver(() => {\n  renderRuntimeAccessibility();\n});\n''',
    '''function renderRuntimeAccessibility(): void {\n  applyRuntimeAccessibilityPresentation(document);\n  if (status?.dataset.statusOwner === "explore") return;\n  if (status) {\n    status.dataset.statusOwner = "runtime";\n    status.textContent = formatRuntimeStatus(\n      runtimeStatusDescriptor,\n      document.documentElement.lang,\n    );\n  }\n}\n\nfunction updateStatus(descriptor: RuntimeStatusDescriptor): void {\n  runtimeStatusDescriptor = Object.freeze(descriptor);\n  if (status) status.dataset.statusOwner = "runtime";\n  renderRuntimeAccessibility();\n}\n\nconst onRuntimeStatusRefresh = (): void => {\n  if (status) status.dataset.statusOwner = "runtime";\n  renderRuntimeAccessibility();\n};\ndocument.addEventListener("morro:runtime-status-refresh", onRuntimeStatusRefresh);\n\nconst runtimeAccessibilityLocaleObserver = new MutationObserver(() => {\n  renderRuntimeAccessibility();\n});\n''',
    "browser runtime status ownership",
)
path.write_text(text)


# 2) Explore control: own/re-render selected/error announcements across language changes.
path = Path("apps/morro-digital-platform/src/map/explore-locations-control.ts")
text = path.read_text()
text = replace_once(
    text,
    'type ExploreStage = "menu" | "filters" | "places" | "detail" | "tour";\n',
    '''type ExploreStage = "menu" | "filters" | "places" | "detail" | "tour";\n\ntype ExploreRuntimeStatusDescriptor =\n  | Readonly<{ kind: "selected"; place: string }>\n  | Readonly<{ kind: "map-error"; error: unknown }>;\n''',
    "explore runtime status type",
)
text = replace_once(
    text,
    '''  const currentCategories = (): readonly ExploreLocationsCategory[] =>\n    getExploreLocationsCategories(currentLocale());\n\n  const stateSnapshot = (): ExploreLocationsStateSnapshot =>\n''',
    '''  const currentCategories = (): readonly ExploreLocationsCategory[] =>\n    getExploreLocationsCategories(currentLocale());\n  let exploreRuntimeStatusDescriptor: ExploreRuntimeStatusDescriptor | undefined;\n\n  const renderExploreRuntimeStatus = (): void => {\n    const descriptor = exploreRuntimeStatusDescriptor;\n    const statusElement = document.getElementById("runtime-status");\n    if (!descriptor || !statusElement) return;\n\n    const copy = getV1ExploreUiCopy(currentLocale());\n    statusElement.dataset.statusOwner = "explore";\n    statusElement.replaceChildren(\n      document.createTextNode(\n        descriptor.kind === "selected"\n          ? copy.selected(descriptor.place)\n          : copy.mapCategoryError(\n              describeExploreError(descriptor.error, currentLocale()),\n            ),\n      ),\n    );\n  };\n\n  const setExploreRuntimeStatus = (\n    descriptor: ExploreRuntimeStatusDescriptor,\n  ): void => {\n    exploreRuntimeStatusDescriptor = Object.freeze(descriptor);\n    renderExploreRuntimeStatus();\n  };\n\n  const clearExploreRuntimeStatus = (): void => {\n    exploreRuntimeStatusDescriptor = undefined;\n    const statusElement = document.getElementById("runtime-status");\n    if (statusElement?.dataset.statusOwner !== "explore") return;\n    delete statusElement.dataset.statusOwner;\n    document.dispatchEvent(new CustomEvent("morro:runtime-status-refresh"));\n  };\n\n  const stateSnapshot = (): ExploreLocationsStateSnapshot =>\n''',
    "explore status helpers",
)
text = replace_once(
    text,
    '''      emitStateChange();\n      document\n        .getElementById("runtime-status")\n        ?.replaceChildren(\n          document.createTextNode(\n            getV1ExploreUiCopy(currentLocale()).mapCategoryError(\n              describeExploreError(error, currentLocale()),\n            ),\n          ),\n        );\n''',
    '''      emitStateChange();\n      setExploreRuntimeStatus({ kind: "map-error", error });\n''',
    "explore map error status",
)
text = replace_once(
    text,
    '''    activePlace = undefined;\n    activeStage = "menu";\n    visibleLocations = Object.freeze([]);\n    showMainMenu();\n''',
    '''    activePlace = undefined;\n    activeStage = "menu";\n    visibleLocations = Object.freeze([]);\n    clearExploreRuntimeStatus();\n    showMainMenu();\n''',
    "clear explore status on menu",
)
text = replace_once(
    text,
    '''    document\n      .getElementById("runtime-status")\n      ?.replaceChildren(\n        document.createTextNode(\n          getV1ExploreUiCopy(currentLocale()).selected(location.name),\n        ),\n      );\n''',
    '''    setExploreRuntimeStatus({ kind: "selected", place: location.name });\n''',
    "selected explore status",
)
text = replace_once(
    text,
    '''    activePlace = undefined;\n    activeStage = "places";\n    const options: readonly Readonly<{\n''',
    '''    activePlace = undefined;\n    activeStage = "places";\n    clearExploreRuntimeStatus();\n    const options: readonly Readonly<{\n''',
    "clear explore status on places",
)
text = replace_once(
    text,
    '''    activePlace = undefined;\n    activeStage = "tour";\n    removeAssistantFlowResults(document);\n''',
    '''    activePlace = undefined;\n    activeStage = "tour";\n    clearExploreRuntimeStatus();\n    removeAssistantFlowResults(document);\n''',
    "clear explore status on tour",
)
text = replace_once(
    text,
    '''    activePlace = undefined;\n    activeStage = "filters";\n    const allLocations = getExploreLocationsForCategory(activeCategory.value);\n''',
    '''    activePlace = undefined;\n    activeStage = "filters";\n    clearExploreRuntimeStatus();\n    const allLocations = getExploreLocationsForCategory(activeCategory.value);\n''',
    "clear explore status on filters",
)
text = replace_once(
    text,
    '''        if (!records.some((record) => record.attributeName === "lang")) return;\n        refreshCategoryPresentation();\n        if (activeStage === "filters" && activeCategory) renderFilters();\n''',
    '''        if (!records.some((record) => record.attributeName === "lang")) return;\n        refreshCategoryPresentation();\n        if (exploreRuntimeStatusDescriptor) renderExploreRuntimeStatus();\n        if (activeStage === "filters" && activeCategory) renderFilters();\n''',
    "re-render explore status on locale mutation",
)
text = replace_once(
    text,
    '''      localeObserver?.disconnect();\n      document.removeEventListener("keydown", onKeyDown);\n''',
    '''      localeObserver?.disconnect();\n      clearExploreRuntimeStatus();\n      document.removeEventListener("keydown", onKeyDown);\n''',
    "clear explore status on destroy",
)
path.write_text(text)


# 3) Browser parity: assert every tour label/value and Explore status ownership.
path = Path("apps/morro-digital-platform/tooling/explore-v1-i18n-browser-parity.mjs")
text = path.read_text()
text = replace_once(
    text,
    '''const runtimeAccessibility = {\n  pt: {\n    selectAria: "Roteiro exibido no mapa",\n    firstTour: "Passeio Volta à Ilha",\n    statusNeedle: "Runtime ativo",\n  },\n  en: {\n    selectAria: "Tour displayed on the map",\n    firstTour: "Island Round Trip",\n    statusNeedle: "Runtime active",\n  },\n  es: {\n    selectAria: "Recorrido mostrado en el mapa",\n    firstTour: "Vuelta a la Isla",\n    statusNeedle: "Runtime activo",\n  },\n  he: {\n    selectAria: "המסלול המוצג במפה",\n    firstTour: "סיבוב האי",\n    statusNeedle: "המערכת פעילה",\n  },\n};\n''',
    '''const tourValues = ["volta-a-ilha", "trilha-gamboa", "passeio-quadriciclo"];\nconst runtimeAccessibility = {\n  pt: {\n    selectAria: "Roteiro exibido no mapa",\n    tourLabels: [\n      "Passeio Volta à Ilha",\n      "Trilha Ecológica para a Gamboa",\n      "Expedição de Quadriciclo",\n    ],\n    statusNeedle: "Runtime ativo",\n  },\n  en: {\n    selectAria: "Tour displayed on the map",\n    tourLabels: [\n      "Island Round Trip",\n      "Ecological Trail to Gamboa",\n      "ATV Expedition",\n    ],\n    statusNeedle: "Runtime active",\n  },\n  es: {\n    selectAria: "Recorrido mostrado en el mapa",\n    tourLabels: [\n      "Vuelta a la Isla",\n      "Sendero Ecológico a Gamboa",\n      "Expedición en Cuadriciclo",\n    ],\n    statusNeedle: "Runtime activo",\n  },\n  he: {\n    selectAria: "המסלול המוצג במפה",\n    tourLabels: ["סיבוב האי", "שביל אקולוגי לגמבואה", "מסע קוואדריציקל"],\n    statusNeedle: "המערכת פעילה",\n  },\n};\n''',
    "all localized tour expectations",
)
text = replace_once(
    text,
    '''      const select = document.getElementById("tour-select");\n      const firstOption = select?.querySelector("option");\n      return {\n        selectAria: select?.getAttribute("aria-label") ?? null,\n        firstTour: firstOption?.textContent?.trim() ?? null,\n        status:\n          document.getElementById("runtime-status")?.textContent?.trim() ?? "",\n      };\n''',
    '''      const select = document.getElementById("tour-select");\n      const options = Array.from(select?.querySelectorAll("option") ?? []);\n      return {\n        selectAria: select?.getAttribute("aria-label") ?? null,\n        tourLabels: options.map((option) => option.textContent?.trim() ?? ""),\n        tourValues: options.map((option) => option.value),\n        status:\n          document.getElementById("runtime-status")?.textContent?.trim() ?? "",\n      };\n''',
    "read all tour options",
)
text = replace_once(
    text,
    '''      observed.selectAria === expected.selectAria &&\n      observed.firstTour === expected.firstTour &&\n      observed.status.includes(expected.statusNeedle)\n''',
    '''      observed.selectAria === expected.selectAria &&\n      JSON.stringify(observed.tourLabels) === JSON.stringify(expected.tourLabels) &&\n      JSON.stringify(observed.tourValues) === JSON.stringify(tourValues) &&\n      observed.status.includes(expected.statusNeedle)\n''',
    "assert tour labels and values",
)
text = replace_once(
    text,
    '''async function waitCategory(page, value, text, aria) {\n''',
    '''async function waitExploreSelectedStatus(page, expectedText) {\n  const deadline = Date.now() + 5000;\n  let observed = null;\n  while (Date.now() < deadline) {\n    observed = await page.evaluate(() => {\n      const status = document.getElementById("runtime-status");\n      return {\n        owner: status?.getAttribute("data-status-owner") ?? null,\n        text: status?.textContent?.trim() ?? "",\n      };\n    });\n    if (observed.owner === "explore" && observed.text === expectedText) return;\n    await page.waitForTimeout(50);\n  }\n  throw new Error(\n    `explore status: expected ${JSON.stringify({ owner: "explore", text: expectedText })}, got ${JSON.stringify(observed)}`,\n  );\n}\n\nasync function waitCategory(page, value, text, aria) {\n''',
    "explore status browser helper",
)
text = replace_once(
    text,
    '''  dynamic = await readDynamic(page);\n  equal(dynamic.labels, beachDetailHebrew, "he beach detail labels");\n  equal(dynamic.values, beachDetailValues, "he beach canonical values");\n  await page\n    .locator('.assistant-option-btn[data-value="[sub]beaches"]')\n    .click();\n''',
    '''  dynamic = await readDynamic(page);\n  equal(dynamic.labels, beachDetailHebrew, "he beach detail labels");\n  equal(dynamic.values, beachDetailValues, "he beach canonical values");\n  await waitExploreSelectedStatus(page, "Primeira Praia נבחר.");\n  await setLanguage(page, "en");\n  await waitExploreSelectedStatus(page, "Primeira Praia selected.");\n  await setLanguage(page, "he");\n  await waitExploreSelectedStatus(page, "Primeira Praia נבחר.");\n  await page\n    .locator('.assistant-option-btn[data-value="[sub]beaches"]')\n    .click();\n''',
    "preserve explore status across language changes",
)
path.write_text(text)


# 4) Workflow path coverage: watch all transitive tour localization inputs.
path = Path(".github/workflows/explore-v1-i18n-browser-parity.yml")
text = path.read_text()
text = replace_once(
    text,
    '      - apps/morro-digital-platform/src/config/tour-localization.ts\n',
    '      - apps/morro-digital-platform/src/config/**\n',
    "tour config workflow coverage",
)
path.write_text(text)
