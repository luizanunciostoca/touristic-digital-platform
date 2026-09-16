from pathlib import Path

router = Path('apps/morro-digital-platform/src/assistant/assistant-menu-command-router.ts')
test = Path('apps/morro-digital-platform/src/assistant/assistant-menu-command-router-runtime-action.test.ts')

text = router.read_text(encoding='utf-8')
old = '''    "volver al menu principal",\n    "חזרה לתפריט הראשי",\n'''
new = '''    "volver al menu principal",\n    "חזרה לתפריט",\n    "חזורה לתפריט",\n    "חזרה לתפריט הראשי",\n'''
if text.count(old) != 1:
    raise SystemExit(f'router alias anchor mismatch: {text.count(old)}')
router.write_text(text.replace(old, new, 1), encoding='utf-8')

content = test.read_text(encoding='utf-8')
content = content.replace(
    'import { resolveAssistantRuntimeAction } from "./assistant-menu-command-router.js";',
    'import {\n  resolveAssistantMenuCommand,\n  resolveAssistantRuntimeAction,\n} from "./assistant-menu-command-router.js";',
    1,
)
anchor = '''  it("rejects actions outside the strict runtime vocabulary", () => {\n    expect(resolveAssistantRuntimeAction("navigate:Primeira Praia")).toBeNull();\n    expect(resolveAssistantRuntimeAction("javascript:alert(1)")).toBeNull();\n  });\n'''
addition = anchor + '''\n  it.each(["חזרה לתפריט", "חזורה לתפריט"])(\n    "maps the Hebrew V1 back-menu alias %s through the shared text/voice resolver",\n    (message) => {\n      const document = {\n        getElementById: () => null,\n        querySelectorAll: () => [],\n      } as unknown as Document;\n\n      expect(resolveAssistantMenuCommand(document, message)).toEqual({\n        type: "back_to_menu",\n      });\n    },\n  );\n'''
if content.count(anchor) != 1:
    raise SystemExit(f'test anchor mismatch: {content.count(anchor)}')
test.write_text(content.replace(anchor, addition, 1), encoding='utf-8')
