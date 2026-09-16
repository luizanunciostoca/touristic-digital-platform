from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected 1 match, got {count}: {old[:140]!r}")
    target.write_text(text.replace(old, new, 1))


router = "apps/morro-digital-platform/src/assistant/assistant-menu-command-router.ts"
replace_once(
    router,
    '''function commandForVisibleOption(
  document: Document,
  message: string,
): ExploreLocationsCommand | null {''',
    '''function globalExploreCommandForMessage(
  message: string,
): ExploreLocationsCommand | null {
  const normalized = normalizeAssistantMenuCommand(message);
  const matches = (value: keyof typeof OPTION_ALIASES): boolean => {
    const canonical = normalizeAssistantMenuCommand(value);
    return (
      normalized === canonical ||
      (NORMALIZED_OPTION_ALIASES[canonical] ?? []).includes(normalized)
    );
  };

  if (
    matches("ver todos") ||
    ["mapa", "ver no mapa", "show map", "mostrar mapa", "מפה"].includes(
      normalized,
    )
  ) {
    return Object.freeze({ type: "show_all" });
  }
  if (matches("proximo")) return Object.freeze({ type: "show_nearby" });
  if (matches("voltar filtros")) {
    return Object.freeze({ type: "back_to_filters" });
  }
  if (matches("voltar menu")) {
    return Object.freeze({ type: "back_to_menu" });
  }
  return null;
}

function commandForVisibleOption(
  document: Document,
  message: string,
): ExploreLocationsCommand | null {''',
)
replace_once(
    router,
    '''  const visible = commandForVisibleOption(document, message);
  if (visible) return visible;

  const place = exactCatalogPlace(message);''',
    '''  const visible = commandForVisibleOption(document, message);
  if (visible) return visible;

  const globalCommand = globalExploreCommandForMessage(message);
  if (globalCommand) return globalCommand;

  const place = exactCatalogPlace(message);''',
)

runtime = "apps/morro-digital-platform/src/assistant/browser-assistant-runtime.ts"
replace_once(
    runtime,
    '''    const value = rawInput.trim();
    if (!value) return { text: "Como posso ajudar?" };

    const generation = ++requestGeneration;''',
    '''    const submittedValue = rawInput.trim();
    if (!submittedValue) return { text: "Como posso ajudar?" };
    const numericIndex = /^\\d+$/u.test(submittedValue)
      ? Number(submittedValue) - 1
      : -1;
    const selectedNumericOption =
      numericIndex >= 0 ? currentPresentation?.options[numericIndex] : undefined;
    const value = selectedNumericOption?.value.trim() || submittedValue;

    const generation = ++requestGeneration;''',
)
replace_once(
    runtime,
    '''      if (options.explore) {
        menuRouted = menuCommand
          ? await options.explore.execute(menuCommand)
          : false;
      } else {''',
    '''      if (options.explore) {
        menuRouted = menuCommand
          ? await options.explore.execute(menuCommand)
          : false;
        if (
          !menuRouted &&
          menuCommand &&
          (menuCommand.type === "show_all" ||
            menuCommand.type === "show_nearby")
        ) {
          const lastCategory = context.getContext().lastCategory;
          if (lastCategory) {
            const opened = await options.explore.execute({
              type: "open_category",
              category: lastCategory,
            });
            menuRouted = opened
              ? await options.explore.execute(menuCommand)
              : false;
          }
        }
      } else {''',
)
replace_once(
    runtime,
    '''          detail: { message: value, source },''',
    '''          detail: { message: submittedValue, semanticValue: value, source },''',
)
replace_once(
    runtime,
    '''      context.addToHistory({ input: value, response: routedText });''',
    '''      context.addToHistory({ input: submittedValue, response: routedText });''',
)
replace_once(
    runtime,
    '''    appendStandardMessage("user", value);
    const response = await controller.processUserInput(value);''',
    '''    appendStandardMessage("user", submittedValue);
    const response = await controller.processUserInput(value);''',
)
