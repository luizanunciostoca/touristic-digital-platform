from pathlib import Path

path = Path("apps/morro-digital-platform/tooling/explore-v1-i18n-browser-parity.mjs")
text = path.read_text()
old = '''  equal(\n    dynamic.values,\n    restaurantSecondaryValues,\n    "en restaurant secondary canonical values",\n  );\n\n  await setLanguage(page, "he");\n  await waitRuntimeAccessibility(page, "he", runtimeAccessibility.he);\n'''
new = '''  equal(\n    dynamic.values,\n    restaurantSecondaryValues,\n    "en restaurant secondary canonical values",\n  );\n\n  // Leave the active Explore detail before asserting the generic runtime status.\n  // While a place is selected, Explore intentionally owns #runtime-status and\n  // must survive language changes; that contract is verified above with\n  // Primeira Praia. Re-enter the category flow and Escape back to the main menu\n  // so the runtime owns the status again for the HE accessibility assertion.\n  await page.evaluate(() => {\n    const category = document.getElementById("assistant-category-restaurants");\n    if (!(category instanceof HTMLButtonElement)) {\n      throw new Error("restaurants category button missing");\n    }\n    category.click();\n  });\n  await page\n    .locator('#assistant-category-results[data-stage="filters"]')\n    .waitFor({ state: "visible" });\n  await page.keyboard.press("Escape");\n\n  await setLanguage(page, "he");\n  await waitRuntimeAccessibility(page, "he", runtimeAccessibility.he);\n'''
count = text.count(old)
if count != 1:
    raise SystemExit(f"expected one restaurant-to-he transition, got {count}")
path.write_text(text.replace(old, new, 1))
