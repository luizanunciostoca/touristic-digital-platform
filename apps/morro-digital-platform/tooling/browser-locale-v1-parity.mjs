import playwright from "/tmp/pw/node_modules/playwright/index.js";

const { chromium } = playwright;
const BASE_URL = process.env.MORRO_BROWSER_URL || "http://127.0.0.1:4173/";

const cases = [
  {
    browserLocale: "pt-BR",
    expectedLocale: "pt-BR",
    expectedDir: "ltr",
    headline:
      "👋 Olá! Sou o assistente virtual do Morro Digital. Como posso ajudar você hoje?",
    placeholder: "Digite sua pergunta...",
  },
  {
    browserLocale: "en-US",
    expectedLocale: "en-US",
    expectedDir: "ltr",
    headline:
      "👋 Hello! I'm the Morro Digital virtual assistant. How can I help you today?",
    placeholder: "Type your question...",
  },
  {
    browserLocale: "es-AR",
    expectedLocale: "es-ES",
    expectedDir: "ltr",
    headline:
      "👋 ¡Hola! Soy el asistente virtual de Morro Digital. ¿Cómo puedo ayudarte hoy?",
    placeholder: "Escribe tu pregunta...",
  },
  {
    browserLocale: "he-IL",
    expectedLocale: "he-IL",
    expectedDir: "rtl",
    headline:
      "👋 שלום! אני העוזר הווירטואלי של מורו דיגיטל. איך אוכל לעזור לך היום?",
    placeholder: "הקלד את שאלתך...",
  },
];

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

async function prepareContext(browser, locale, override = null) {
  const context = await browser.newContext({
    locale,
    viewport: { width: 390, height: 844 },
    geolocation: { latitude: -13.3776181, longitude: -38.9142193 },
    permissions: ["geolocation"],
  });
  await context.addInitScript((manualOverride) => {
    localStorage.setItem("morro-digital-onboarded", "1");
    localStorage.setItem("voice-enabled", "false");
    localStorage.removeItem("morro-digital-language");
    if (manualOverride) {
      localStorage.setItem("morro-digital-language", manualOverride);
    }
  }, override);
  return context;
}

async function waitForShell(page) {
  await page.goto(BASE_URL, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page
    .locator('body[data-public-onboarding-settled="true"]')
    .waitFor({ state: "attached", timeout: 15000 });
  await page.locator("header h1").waitFor({ state: "attached", timeout: 10000 });
}

const browser = await chromium.launch({ headless: true });
try {
  for (const testCase of cases) {
    const context = await prepareContext(browser, testCase.browserLocale);
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.route("**/api/weather", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          temperatureCelsius: 28,
          temperatureMaxCelsius: 31,
          temperatureMinCelsius: 24,
          humidityPercent: 78,
          windSpeedKph: 18,
          rainChancePercent: 42,
          weatherCode: 1,
          isDay: true,
          forecast: [],
        }),
      }),
    );

    await waitForShell(page);
    const observed = await page.evaluate(() => ({
      lang: document.documentElement.lang,
      dir: document.documentElement.dir,
      headline: document.querySelector("header h1")?.textContent?.trim() ?? "",
      placeholder:
        document.getElementById("assistantInput")?.getAttribute("placeholder") ??
        "",
      voiceLanguage:
        document.getElementById("assistantVoiceLanguage")?.value ?? "",
    }));

    assertEqual(
      observed.lang,
      testCase.expectedLocale,
      `${testCase.browserLocale} document locale`,
    );
    assertEqual(
      observed.dir,
      testCase.expectedDir,
      `${testCase.browserLocale} document direction`,
    );
    assertEqual(
      observed.headline,
      testCase.headline,
      `${testCase.browserLocale} shell translation`,
    );
    assertEqual(
      observed.placeholder,
      testCase.placeholder,
      `${testCase.browserLocale} assistant placeholder`,
    );
    assertEqual(
      observed.voiceLanguage,
      testCase.expectedLocale.slice(0, 2),
      `${testCase.browserLocale} assistant voice language`,
    );
    assertEqual(
      pageErrors.length,
      0,
      `${testCase.browserLocale} browser errors`,
    );
    await context.close();
  }

  const manualContext = await prepareContext(browser, "en-US", "es-ES");
  const manualPage = await manualContext.newPage();
  await manualPage.route("**/api/weather", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        temperatureCelsius: 28,
        temperatureMaxCelsius: 31,
        temperatureMinCelsius: 24,
        humidityPercent: 78,
        windSpeedKph: 18,
        rainChancePercent: 42,
        weatherCode: 1,
        isDay: true,
        forecast: [],
      }),
    }),
  );
  await waitForShell(manualPage);
  assertEqual(
    await manualPage.evaluate(() => document.documentElement.lang),
    "es-ES",
    "manual language override precedence",
  );
  assertEqual(
    await manualPage.locator("header h1").textContent(),
    "👋 ¡Hola! Soy el asistente virtual de Morro Digital. ¿Cómo puedo ayudarte hoy?",
    "manual language override translation",
  );
  await manualContext.close();

  const unsupportedContext = await prepareContext(browser, "fr-FR");
  const unsupportedPage = await unsupportedContext.newPage();
  await unsupportedPage.route("**/api/weather", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        temperatureCelsius: 28,
        temperatureMaxCelsius: 31,
        temperatureMinCelsius: 24,
        humidityPercent: 78,
        windSpeedKph: 18,
        rainChancePercent: 42,
        weatherCode: 1,
        isDay: true,
        forecast: [],
      }),
    }),
  );
  await waitForShell(unsupportedPage);
  assertEqual(
    await unsupportedPage.evaluate(() => document.documentElement.lang),
    "en-US",
    "unsupported browser locale V1 fallback",
  );
  await unsupportedContext.close();

  console.log("V1 browser locale auto-detection parity: PASS");
} finally {
  await browser.close();
}
