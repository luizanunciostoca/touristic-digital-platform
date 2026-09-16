from pathlib import Path

path = Path("apps/morro-digital-platform/src/navigation/browser-navigation-runtime-install.test.ts")
text = path.read_text(encoding="utf-8")
old = '''    expect(installAssistant).toHaveBeenCalledWith({\n      document,\n      navigation: lifecycle,\n    });'''
new = '''    expect(installAssistant).toHaveBeenCalledWith({\n      document,\n      navigation: lifecycle,\n      map,\n    });'''
count = text.count(old)
if count != 1:
    raise SystemExit(f"assistant install expectation: expected one match, found {count}")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
