from pathlib import Path

path = Path('apps/morro-digital-platform/tooling/explore-v1-i18n-browser-parity.mjs')
text = path.read_text(encoding='utf-8')
old = 'import { chromium } from "/tmp/pw/node_modules/playwright/index.js";\n'
new = 'import playwright from "/tmp/pw/node_modules/playwright/index.js";\n\nconst { chromium } = playwright;\n'
if text.count(old) != 1:
    raise SystemExit(f'playwright import anchor mismatch: {text.count(old)}')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
