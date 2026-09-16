from pathlib import Path

path = Path("apps/morro-digital-platform/src/assistant/browser-assistant-runtime.ts")
text = path.read_text(encoding="utf-8")
old = '''    const generation = ++requestGeneration;\n\n    const mapResponse = await executeAssistantV1MapCommand({'''
new = '''    const generation = ++requestGeneration;\n\n    // V1 exposes some labels (notably “ver todos”) in both MapCommander and\n    // contextual Explore menus. Preserve the active product flow first so a\n    // visible menu choice is not stolen by the global map command router.\n    const exploreStateBeforeMap = options.explore?.getState();\n    const contextualExploreCommand =\n      exploreStateBeforeMap && exploreStateBeforeMap.stage !== "menu"\n        ? resolveAssistantMenuCommand(options.document, value)\n        : null;\n\n    const mapResponse = contextualExploreCommand\n      ? null\n      : await executeAssistantV1MapCommand({'''
count = text.count(old)
if count != 1:
    raise SystemExit(f"map precedence insertion: expected one match, found {count}")
text = text.replace(old, new, 1)
old2 = '''        : {}),\n    });\n    if (mapResponse) {'''
new2 = '''        : {}),\n        });\n    if (mapResponse) {'''
count = text.count(old2)
if count != 1:
    raise SystemExit(f"map precedence closing: expected one match, found {count}")
path.write_text(text.replace(old2, new2, 1), encoding="utf-8")
