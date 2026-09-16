from pathlib import Path

path = Path("apps/morro-digital-platform/src/assistant/assistant-v1-residual-command-adapter.test.ts")
text = path.read_text(encoding="utf-8")
old = 'import {\n  executeAssistantV1ResidualCommand,\n  formatAssistantV1History,\n  resolveAssistantV1ResidualCommand,\n  type AssistantV1MapCommandMap,\n} from "./assistant-v1-residual-command-adapter.js";\n\nfunction fakeMap() {'
new = 'import {\n  executeAssistantV1ResidualCommand,\n  formatAssistantV1History,\n  resolveAssistantV1ResidualCommand,\n  type AssistantV1MapCommandMap,\n} from "./assistant-v1-residual-command-adapter.js";\n\ntype FlyToOptions = Parameters<\n  NonNullable<AssistantV1MapCommandMap["flyTo"]>\n>[0];\n\nfunction fakeMap() {'
if text.count(old) != 1:
    raise SystemExit(f"test type alias anchor: expected one match, found {text.count(old)}")
text = text.replace(old, new, 1)
old = '    flyTo: vi.fn((options) => {'
new = '    flyTo: vi.fn((options: FlyToOptions) => {'
if text.count(old) != 1:
    raise SystemExit(f"flyTo annotation anchor: expected one match, found {text.count(old)}")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
