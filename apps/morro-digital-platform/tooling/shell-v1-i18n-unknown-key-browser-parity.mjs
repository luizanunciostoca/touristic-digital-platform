import playwright from "/tmp/pw/node_modules/playwright/index.js";

const { chromium } = playwright;

const weather = {
  temperatureCelsius: 28,
  temperatureMaxCelsius: 31,
  temperatureMinCelsius: 24,
  humidityPercent: 78,
  windSpeedKph: 18,
  rainChancePercent: 42,
  weatherCode: 1,
  isDay: true,
  forecast: [],
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  geolocation: { latitude: -13.3776181, longitude: -38.9142193 },
  permissions: ["geolocation"],
});

await context.addInitScript(() => {
  localStorage.setItem("morro-digital-onboarded", "1");
  localStorage.setItem("voice-enabled", "false");
});

const page = await context.newPage();
page.route("**/api/weather", (route) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(weather),
  }),
);

try {
  await page.goto("http://127.0.0.1:4173/", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page
    .locator('body[data-public-onboarding-settled="true"]')
    .waitFor({ state: "attached", timeout: 10000 });

  await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.id = "unknown-i18n-key-probe";
    probe.dataset.i18n = "toString";
    probe.textContent = "UNKNOWN_KEY_SENTINEL";
    document.body.appendChild(probe);
    document.documentElement.lang = "en-US";
  });

  await page.waitForTimeout(100);
  const observed =
    (await page.locator("#unknown-i18n-key-probe").textContent())?.trim() ?? "";
  if (observed !== "UNKNOWN_KEY_SENTINEL") {
    throw new Error(
      `unknown inherited i18n key mutated DOM: expected UNKNOWN_KEY_SENTINEL, got ${JSON.stringify(observed)}`,
    );
  }
} finally {
  await browser.close();
}
