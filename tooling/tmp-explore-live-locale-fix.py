from pathlib import Path

path = Path('apps/morro-digital-platform/src/map/explore-locations-control.ts')
text = path.read_text(encoding='utf-8')

def one(old: str, new: str, label: str):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected one match, found {count}')
    text = text.replace(old, new, 1)

one(
    '  const categories = getExploreLocationsCategories(currentLocale());',
    '  const currentCategories = (): readonly ExploreLocationsCategory[] =>\n    getExploreLocationsCategories(currentLocale());',
    'dynamic categories',
)
one(
    '    const category = categories.find(\n      (candidate) => normalizeSearchText(candidate.value) === normalized,\n    );',
    '    const category = currentCategories().find(\n      (candidate) => normalizeSearchText(candidate.value) === normalized,\n    );',
    'dynamic category lookup',
)
one(
    '  for (const category of categories) {',
    '  const refreshCategoryPresentation = (): void => {\n    const localized = currentCategories();\n    for (const category of localized) {\n      const button = document.getElementById(\n        getAssistantCategoryButtonId(category.value),\n      );\n      if (!(button instanceof HTMLButtonElement)) continue;\n      button.textContent = category.label;\n      button.setAttribute(\n        "aria-label",\n        getV1ExploreUiCopy(currentLocale()).categoryAria(\n          category.label,\n          category.count,\n        ),\n      );\n      if (activeCategory?.value === category.value) activeCategory = category;\n    }\n  };\n\n  for (const category of currentCategories()) {',
    'initial dynamic categories',
)
anchor = '''    button.addEventListener("click", onCategoryClick);\n    categoryListeners.set(button, onCategoryClick);\n  }\n\n  const onKeyDown ='''
replacement = '''    button.addEventListener("click", onCategoryClick);\n    categoryListeners.set(button, onCategoryClick);\n  }\n\n  const MutationObserverCtor = document.defaultView?.MutationObserver;\n  const localeObserver = MutationObserverCtor\n    ? new MutationObserverCtor((records) => {\n        if (!records.some((record) => record.attributeName === "lang")) return;\n        refreshCategoryPresentation();\n        if (activeStage === "filters" && activeCategory) renderFilters();\n      })\n    : null;\n  localeObserver?.observe(document.documentElement, {\n    attributes: true,\n    attributeFilter: ["lang"],\n  });\n\n  const onKeyDown ='''
one(anchor, replacement, 'locale observer')
one(
    '      interactionGeneration += 1;\n      document.removeEventListener("keydown", onKeyDown);',
    '      interactionGeneration += 1;\n      localeObserver?.disconnect();\n      document.removeEventListener("keydown", onKeyDown);',
    'observer cleanup',
)
path.write_text(text, encoding='utf-8')
