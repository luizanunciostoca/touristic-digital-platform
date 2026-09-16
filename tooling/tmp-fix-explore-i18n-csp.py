from pathlib import Path

path = Path('.github/workflows/explore-v1-i18n-browser-parity.yml')
text = path.read_text(encoding='utf-8')
old = '''          async function waitCategoryPresentation(page, value, text, aria) {
            const button = page.locator(`#assistant-category-${value}`);
            await button.waitFor({ state: 'attached', timeout: 5000 });
            await page.waitForFunction(
              ({ value, text, aria }) => {
                const button = document.getElementById(`assistant-category-${value}`);
                return button?.textContent?.trim() === text && button.getAttribute('aria-label') === aria;
              },
              { value, text, aria },
              { timeout: 5000 },
            );
          }
'''
new = '''          async function waitCategoryPresentation(page, value, text, aria) {
            const button = page.locator(`#assistant-category-${value}`);
            await button.waitFor({ state: 'attached', timeout: 5000 });
            const deadline = Date.now() + 5000;
            let observed = { text: '', aria: null };
            while (Date.now() < deadline) {
              observed = {
                text: (await button.textContent())?.trim() ?? '',
                aria: await button.getAttribute('aria-label'),
              };
              if (observed.text === text && observed.aria === aria) return;
              await page.waitForTimeout(50);
            }
            throw new Error(
              `Category ${value} presentation mismatch: expected ${JSON.stringify({ text, aria })}, got ${JSON.stringify(observed)}`,
            );
          }
'''
if text.count(old) != 1:
    raise SystemExit(f'expected exactly one waitCategoryPresentation block, found {text.count(old)}')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
