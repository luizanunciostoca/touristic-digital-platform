from pathlib import Path

path = Path('apps/morro-digital-platform/tooling/explore-v1-i18n-browser-parity.mjs')
text = path.read_text(encoding='utf-8')
old = '''async function readDynamic(page) {\n  const containers = page.locator(\n    ".assistant-options:not(#assistant-category-results):not(:has([data-explore-category]))",\n  );\n  const count = await containers.count();\n  return count > 0\n    ? readOptions(\n        page,\n        `.assistant-options:not(#assistant-category-results):not(:has([data-explore-category])):nth-of-type(${count})`,\n      )\n    : { labels: [], values: [] };\n}\n'''
new = '''async function readDynamic(page) {\n  const containers = page.locator(\n    ".assistant-options:not(#assistant-category-results):not(:has([data-explore-category]))",\n  );\n  if ((await containers.count()) === 0) return { labels: [], values: [] };\n  const options = containers.last().locator(".assistant-option-btn");\n  return {\n    labels: await options\n      .allTextContents()\n      .then((items) => items.map((item) => item.trim())),\n    values: await options.evaluateAll((buttons) =>\n      buttons.map((button) => button.getAttribute("data-value")),\n    ),\n  };\n}\n'''
if text.count(old) != 1:
    raise SystemExit(f'dynamic reader anchor mismatch: {text.count(old)}')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
