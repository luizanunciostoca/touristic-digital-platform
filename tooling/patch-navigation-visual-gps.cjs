const fs = require('node:fs');

const path = '.github/workflows/navigation-visual-baseline.yml';
const text = fs.readFileSync(path, 'utf8');
const oldBlock = `            await page.locator('#instruction-banner:not(.hidden)').waitFor({ state: 'visible', timeout: 15000 });
            await page.locator('#end-navigation-btn').waitFor({ state: 'visible', timeout: 15000 });
            await poll(page, () => {
              const evidence = globalThis.__navigationEvidence;
              return Boolean(
                evidence?.events?.some((event) => event.type === 'navigationRouteRuntimeUpdated') &&
                evidence?.events?.some((event) => event.type === 'navigationStarted') &&
                evidence.camera.length > 0
              );
            });
            await page.waitForTimeout(700);
`;
const newBlock = `            await page.locator('#instruction-banner:not(.hidden)').waitFor({ state: 'visible', timeout: 15000 });
            await page.locator('#end-navigation-btn').waitFor({ state: 'visible', timeout: 15000 });
            await poll(page, () =>
              globalThis.__navigationEvidence?.events?.some((event) => event.type === 'navigationStarted'),
            );

            // getCurrentPosition() seeds routing; watchPosition() needs a deterministic
            // movement to exercise the live runtime/presenter path in Chromium.
            await context.setGeolocation({
              latitude: -13.37615,
              longitude: -38.91715,
            });
            await poll(page, () => {
              const evidence = globalThis.__navigationEvidence;
              return Boolean(
                evidence?.events?.some((event) => event.type === 'navigationRouteRuntimeUpdated') &&
                evidence?.events?.some((event) => event.type === 'userLocationUpdated') &&
                evidence.camera.length > 0
              );
            });
            await page.waitForTimeout(700);
`;
if (!text.includes(oldBlock)) throw new Error('navigation visual GPS target block not found');
fs.writeFileSync(path, text.replace(oldBlock, newBlock));
