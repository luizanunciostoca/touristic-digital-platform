import playwright from "/tmp/pw/node_modules/playwright/index.js";

const { chromium } = playwright;

const expected = new Map([
  ["pt-BR", "Morro Default (pt-BR) • padrão"],
  ["en-US", "Morro Default (pt-BR) • default"],
  ["es-ES", "Morro Default (pt-BR) • predeterminada"],
  ["he-IL", "Morro Default (pt-BR) • ברירת מחדל"],
]);

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

  const voice = {
    default: true,
    lang: "pt-BR",
    localService: true,
    name: "Morro Default",
    voiceURI: "morro-default",
  };

  Object.defineProperty(window.speechSynthesis, "getVoices", {
    configurable: true,
    value: () => [voice],
  });
});

const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
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
    .locator('#configButton[aria-controls="assistantVoiceSettings"]')
    .waitFor({ state: "attached", timeout: 10000 });

  for (const [locale, label] of expected) {
    await page.evaluate((nextLocale) => {
      document.documentElement.lang = nextLocale;
    }, locale);
    await page.locator("#configButton").click();

    const option = page.locator(
      '#assistantVoiceSelect option[value="Morro Default"]',
    );
    await option.waitFor({ state: "attached", timeout: 5000 });
    const actual = (await option.textContent())?.trim() ?? "";
    if (actual !== label) {
      throw new Error(
        `${locale} default voice label: expected ${JSON.stringify(label)}, got ${JSON.stringify(actual)}`,
      );
    }

    await page.locator("#assistantVoiceSettingsClose").click();
  }

  if (pageErrors.length > 0) {
    throw new Error(`page errors: ${JSON.stringify(pageErrors)}`);
  }
} finally {
  await browser.close();
}
