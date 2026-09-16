from pathlib import Path

path = Path("apps/morro-digital-platform/src/assistant/assistant-v1-intelligence-adapter.ts")
text = path.read_text()
old = '''  const options = values.flatMap((value) => {\n    const item = menus.find((candidate) => candidate.value === value);\n    return item ? [{ label: item.label, value: item.label }] : [];\n  });'''
new = '''  const options: { label: string; value: string }[] = values.flatMap((value) => {\n    const item = menus.find((candidate) => candidate.value === value);\n    return item ? [{ label: item.label, value: item.label }] : [];\n  });'''
if text.count(old) != 1:
    raise SystemExit(f"expected one accessibility options block, got {text.count(old)}")
path.write_text(text.replace(old, new, 1))
print("assistant V1 parity option typing fixed")
