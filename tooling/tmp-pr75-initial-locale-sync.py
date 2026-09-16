from pathlib import Path

path = Path('apps/morro-digital-platform/src/map/explore-locations-control.ts')
text = path.read_text(encoding='utf-8')
old = '''    button.addEventListener("click", onCategoryClick);\n    categoryListeners.set(button, onCategoryClick);\n  }\n\n  const MutationObserverCtor = document.defaultView?.MutationObserver;\n'''
new = '''    button.addEventListener("click", onCategoryClick);\n    categoryListeners.set(button, onCategoryClick);\n  }\n\n  // The app shell ships English fallback labels while the runtime locale can\n  // already be PT/ES/HE before this control is installed. Reconcile both the\n  // visible labels and accessible names immediately, not only after a later\n  // <html lang> mutation.\n  refreshCategoryPresentation();\n\n  const MutationObserverCtor = document.defaultView?.MutationObserver;\n'''
if text.count(old) != 1:
    raise SystemExit(f'initial locale sync anchor mismatch: {text.count(old)}')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
