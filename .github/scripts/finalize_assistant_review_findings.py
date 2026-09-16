from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected 1 match, got {count}: {old[:160]!r}")
    target.write_text(text.replace(old, new, 1))


controller = "packages/assistant/src/dialog-controller.ts"
replace_once(
    controller,
    '''const AWAITING_INTERRUPT_INTENTS = new Set<AssistantIntentResult["intent"]>([\n  "cancel_navigation",\n  "deny",\n  "greeting",\n  "thanks",\n  "help",\n  "weather",\n  "my_location",\n]);''',
    '''const AWAITING_INTERRUPT_INTENTS = new Set<AssistantIntentResult["intent"]>([\n  "cancel_navigation",\n  "confirm",\n  "deny",\n  "navigate",\n  "photos",\n  "price",\n  "hours",\n  "open_now",\n  "more_info",\n  "nearby",\n  "favorites",\n  "recommendation",\n  "compare",\n  "category_filtered",\n  "practical_tips",\n  "cultural_history",\n  "transport",\n  "accessibility",\n  "greeting",\n  "thanks",\n  "help",\n  "weather",\n  "my_location",\n]);''',
)

runtime = "apps/morro-digital-platform/src/assistant/browser-assistant-runtime.ts"
replace_once(
    runtime,
    '''  let currentPresentation: AssistantPresentationSnapshot | null = null;\n  let profiledExploreCategory: string | null = null;''',
    '''  let currentPresentation: AssistantPresentationSnapshot | null = null;\n  let legacyMenuRouting = false;\n  let profiledExploreCategory: string | null = null;''',
)
replace_once(
    runtime,
    '''      } else {\n        menuRouted = routeAssistantMenuCommand(options.document, value);\n      }''',
    '''      } else {\n        legacyMenuRouting = true;\n        try {\n          menuRouted = routeAssistantMenuCommand(options.document, value);\n        } finally {\n          legacyMenuRouting = false;\n        }\n      }''',
)
replace_once(
    runtime,
    '''  const onOptionSelected = (event: Event): void => {\n    if (!(event instanceof CustomEvent)) return;''',
    '''  const onOptionSelected = (event: Event): void => {\n    if (legacyMenuRouting || !(event instanceof CustomEvent)) return;''',
)

dialog_test = "packages/assistant/src/dialog-controller.test.ts"
replace_once(
    dialog_test,
    '''  it("updates category context and records the user profile after classification", async () => {''',
    '''  it("lets an explicit domain command interrupt an awaiting place slot", async () => {\n    const photos = vi.fn(() => ({ text: "photos" }));\n    const hours = vi.fn(() => ({ text: "hours" }));\n    const context = createContextPort({\n      awaiting: { type: "awaiting_place", intent: "photos" },\n    });\n    const controller = createAssistantDialogController({\n      context,\n      handlers: { photos, hours },\n    });\n\n    await expect(controller.processUserInput("horário")).resolves.toEqual({\n      text: "hours",\n    });\n    expect(hours).toHaveBeenCalledOnce();\n    expect(photos).not.toHaveBeenCalled();\n  });\n\n  it("does not reinterpret a fresh navigation command as an awaited destination", async () => {\n    let captured: AssistantDialogIntentHandlerContext | undefined;\n    const navigate = vi.fn((request: AssistantDialogIntentHandlerContext) => {\n      captured = request;\n      return {\n        text: "destination?",\n        metadata: { navigation: "awaiting_destination" },\n      };\n    });\n    const context = createContextPort({\n      awaiting: { type: "awaiting_destination", intent: "navigate" },\n    });\n    const controller = createAssistantDialogController({\n      context,\n      handlers: { navigate },\n    });\n\n    await controller.processUserInput("como chegar");\n    expect(captured?.intent.intent).toBe("navigate");\n    expect(captured?.intent.entities.place).toBeUndefined();\n  });\n\n  it("updates category context and records the user profile after classification", async () => {''',
)

Path("apps/morro-digital-platform/src/assistant/assistant-menu-command-router-runtime-action.test.ts").write_text('''import { describe, expect, it } from "vitest";\n\nimport { resolveAssistantRuntimeAction } from "./assistant-menu-command-router.js";\n\ndescribe("assistant allowlisted runtime action mapping", () => {\n  it("maps category and place actions to the typed Explore command contract", () => {\n    expect(resolveAssistantRuntimeAction("show_category:beaches")).toEqual({\n      type: "open_category",\n      category: "beaches",\n    });\n    expect(resolveAssistantRuntimeAction("show_place:Primeira Praia")).toEqual({\n      type: "select_place",\n      place: "Primeira Praia",\n    });\n  });\n\n  it("rejects actions outside the strict runtime vocabulary", () => {\n    expect(resolveAssistantRuntimeAction("navigate:Primeira Praia")).toBeNull();\n    expect(resolveAssistantRuntimeAction("javascript:alert(1)")).toBeNull();\n  });\n});\n''')
