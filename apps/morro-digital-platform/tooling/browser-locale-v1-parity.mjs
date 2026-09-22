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
    assistantWelcome:
      "🎉 Bem-vindo ao Morro Digital! Sou seu guia virtual oficial em Morro de São Paulo, pronto para ajudar você a explorar com facilidade pontos turísticos, praias, restaurantes, festas, passeios e tudo o que precisar, na palma da sua mão. Como posso ajudar? 😄",
    placeholder: "Digite sua pergunta...",
  },
  {
    browserLocale: "en-US",
    expectedLocale: "en-US",
    expectedDir: "ltr",
    headline:
      "👋 Hello! I'm the Morro Digital virtual assistant. How can I help you today?",
    assistantWelcome:
      "🎉 Welcome to Morro Digital! I am your official virtual guide to Morro de São Paulo, ready to help you easily explore tourist spots, beaches, restaurants, parties, tours, and everything you need at your fingertips. How can I help you? 😄",
    placeholder: "Type your question...",
  },
  {
    browserLocale: "es-AR",
    expectedLocale: "es-ES",
    expectedDir: "ltr",
    headline:
      "👋 ¡Hola! Soy el asistente virtual de Morro Digital. ¿Cómo puedo ayudarte hoy?",
    assistantWelcome:
      "🎉 ¡Bienvenido a Morro Digital! Soy tu guía virtual oficial de Morro de São Paulo, listo para ayudarte a explorar fácilmente lugares turísticos, playas, restaurantes, fiestas, paseos y todo lo que necesites al alcance de tu mano. ¿Cómo puedo ayudarte? 😄",
    placeholder: "Escribe tu pregunta...",
  },
  {
    browserLocale: "he-IL",
    expectedLocale: "he-IL",
    expectedDir: "rtl",
    headline:
      "👋 שלום! אני העוזר הווירטואלי של מורו דיגיטל. איך אוכל לעזור לך היום?",
    assistantWelcome:
      "🎉 ברוכים הבאים ל-Morro Digital! אני המדריך הווירטואלי הרשמי שלכם למורו דה סאו פאולו, מוכן לעזור לכם לגלות בקלות אתרי תיירות, חופים, מסעדות, מסיבות, סיורים וכל מה שאתם צריכים — ממש בהישג יד. איך אוכל לעזור? 😄",
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

async function prepareContext(
  browser,
  locale,
  override = null,
  onboarded = true,
) {
  const context = await browser.newContext({
    locale,
    viewport: { width: 390, height: 844 },
    geolocation: { latitude: -13.3776181, longitude: -38.9142193 },
    permissions: ["geolocation"],
  });
  await context.addInitScript(
    ({ manualOverride, markOnboarded }) => {
      if (markOnboarded) {
        localStorage.setItem("morro-digital-onboarded", "1");
      } else {
        localStorage.removeItem("morro-digital-onboarded");
      }
      localStorage.setItem("voice-enabled", "false");
      localStorage.removeItem("morro-digital-language");
      if (manualOverride) {
        localStorage.setItem("morro-digital-language", manualOverride);
      }
    },
    { manualOverride: override, markOnboarded: onboarded },
  );
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
  await page
    .locator("header h1")
    .waitFor({ state: "attached", timeout: 10000 });
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
      assistantWelcome:
        document
          .querySelector("#assistant-messages .message.assistant")
          ?.textContent?.trim() ?? "",
      placeholder:
        document
          .getElementById("assistantInput")
          ?.getAttribute("placeholder") ?? "",
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
      observed.assistantWelcome,
      testCase.assistantWelcome,
      `${testCase.browserLocale} assistant initial welcome`,
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

  const firstRunCases = [
    {
      browserLocale: "pt-BR",
      locale: "pt-BR",
      dir: "ltr",
      title: "Bem-vindo ao Morro Digital",
      start: "Conhecer o App",
      step: "Passo 1 de 6",
      stepTitle: "Explore Morro pelo mapa",
    },
    {
      browserLocale: "en-US",
      locale: "en-US",
      dir: "ltr",
      title: "Welcome to Morro Digital",
      start: "Explore the App",
      step: "Step 1 of 6",
      stepTitle: "Explore Morro on the map",
    },
    {
      browserLocale: "es-AR",
      locale: "es-ES",
      dir: "ltr",
      title: "Bienvenido a Morro Digital",
      start: "Conocer la App",
      step: "Paso 1 de 6",
      stepTitle: "Explora Morro en el mapa",
    },
    {
      browserLocale: "he-IL",
      locale: "he-IL",
      dir: "rtl",
      title: "ברוכים הבאים ל-Morro Digital",
      start: "הכירו את האפליקציה",
      step: "שלב 1 מתוך 6",
      stepTitle: "גלו את מורו דרך המפה",
    },
  ];

  for (const testCase of firstRunCases) {
    const context = await prepareContext(
      browser,
      testCase.browserLocale,
      null,
      false,
    );
    const page = await context.newPage();
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
    await page.goto(BASE_URL, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page
      .locator('#map[data-home-state="ready"]')
      .waitFor({ state: "attached", timeout: 20000 });
    await page
      .locator("#onboarding-overlay")
      .waitFor({ state: "visible", timeout: 10000 });

    const onboarding = await page.evaluate(() => ({
      lang: document.documentElement.lang,
      dir: document.documentElement.dir,
      title:
        document
          .getElementById("public-onboarding-title")
          ?.textContent?.trim() ?? "",
      start:
        document.querySelector(".profile-card-title")?.textContent?.trim() ??
        "",
    }));
    assertEqual(
      onboarding.lang,
      testCase.locale,
      `${testCase.browserLocale} first-run locale`,
    );
    assertEqual(
      onboarding.dir,
      testCase.dir,
      `${testCase.browserLocale} first-run direction`,
    );
    assertEqual(
      onboarding.title,
      testCase.title,
      `${testCase.browserLocale} onboarding title`,
    );
    assertEqual(
      onboarding.start,
      testCase.start,
      `${testCase.browserLocale} onboarding action`,
    );

    await page.locator('[data-public-onboarding-action="start"]').click();
    await page
      .locator("#tour-tooltip")
      .waitFor({ state: "visible", timeout: 10000 });
    assertEqual(
      (await page.locator(".tour-step-label").textContent())?.trim() ?? "",
      testCase.step,
      `${testCase.browserLocale} tour step label`,
    );
    assertEqual(
      (await page.locator(".tour-step-title").textContent())?.trim() ?? "",
      testCase.stepTitle,
      `${testCase.browserLocale} tour step title`,
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
