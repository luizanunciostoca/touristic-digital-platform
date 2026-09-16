from pathlib import Path

path = Path("apps/morro-digital-platform/tooling/explore-v1-i18n-browser-parity.mjs")
text = path.read_text()
old = '''  await page\n    .locator("#loading-overlay.fade-out")\n    .waitFor({ state: "attached", timeout: 5000 });\n  const assistant = page.locator("#assistant-messages");\n'''
new = '''  await page\n    .locator("#loading-overlay.fade-out")\n    .waitFor({ state: "attached", timeout: 5000 });\n  await page\n    .locator('body[data-public-onboarding-settled="true"]')\n    .waitFor({ state: "attached", timeout: 5000 });\n  const assistant = page.locator("#assistant-messages");\n'''
count = text.count(old)
if count != 1:
    raise SystemExit(f"expected one assistant bootstrap site, got {count}")
path.write_text(text.replace(old, new, 1))
