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

const expected = {
  pt: {
    headline:
      "👋 Olá! Sou o assistente virtual do Morro Digital. Como posso ajudar você hoje?",
    tagline:
      "É a sua primeira vez em Morro de São Paulo? Posso te mostrar os melhores lugares para visitar.",
    mapSection: "Mapa interativo",
    mapRegion: "Mapa interativo de Morro de São Paulo",
    submenu: "Explorar locais",
    submenuClose: "Fechar menu",
    inputPlaceholder: "Digite sua pergunta...",
    inputAria: "Mensagem para o assistente",
    sendAria: "Enviar mensagem",
    voiceAria: "Enviar mensagem por voz",
    settingsAria: "Configurações do assistente",
    globalView: "Alternar visão global do mapa",
    navigationMain: "Siga em frente",
    navigationMinimize: "Minimizar instruções de navegação",
    distance: "Distância",
    time: "Tempo",
    loading: "Carregando Morro Digital...",
    stop: "Parar navegação",
    carouselClose: "Fechar",
    voiceTitle: "Voz",
    voiceClose: "Fechar configurações de voz",
    voiceSpeed: "Velocidade da voz",
    voiceLanguage: "Idioma",
    voiceSupport: "As preferências são salvas neste navegador.",
    voiceAutomatic: "Automática",
  },
  en: {
    headline:
      "👋 Hello! I'm the Morro Digital virtual assistant. How can I help you today?",
    tagline:
      "Is this your first time in Morro de São Paulo? I can show you the best places to visit.",
    mapSection: "Interactive map",
    mapRegion: "Interactive map of Morro de São Paulo",
    submenu: "Explore places",
    submenuClose: "Close menu",
    inputPlaceholder: "Type your question...",
    inputAria: "Message to the assistant",
    sendAria: "Send message",
    voiceAria: "Send voice message",
    settingsAria: "Assistant settings",
    globalView: "Toggle global map view",
    navigationMain: "Continue straight",
    navigationMinimize: "Minimize navigation instructions",
    distance: "Distance",
    time: "Time",
    loading: "Loading Morro Digital...",
    stop: "Stop navigation",
    carouselClose: "Close",
    voiceTitle: "Assistant Voice",
    voiceClose: "Close voice settings",
    voiceSpeed: "Speech Speed",
    voiceLanguage: "Assistant Language",
    voiceSupport: "Preferences are saved in this browser.",
    voiceAutomatic: "Automatic",
  },
  es: {
    headline:
      "👋 ¡Hola! Soy el asistente virtual de Morro Digital. ¿Cómo puedo ayudarte hoy?",
    tagline:
      "¿Es tu primera vez en Morro de São Paulo? Puedo mostrarte los mejores lugares para visitar.",
    mapSection: "Mapa interactivo",
    mapRegion: "Mapa interactivo de Morro de São Paulo",
    submenu: "Explorar lugares",
    submenuClose: "Cerrar menú",
    inputPlaceholder: "Escribe tu pregunta...",
    inputAria: "Mensaje para el asistente",
    sendAria: "Enviar mensaje",
    voiceAria: "Enviar mensaje por voz",
    settingsAria: "Configuraciones del asistente",
    globalView: "Alternar vista global del mapa",
    navigationMain: "Continúa recto",
    navigationMinimize: "Minimizar instrucciones de navegación",
    distance: "Distancia",
    time: "Tiempo",
    loading: "Cargando Morro Digital...",
    stop: "Detener navegación",
    carouselClose: "Cerrar",
    voiceTitle: "Voz del Asistente",
    voiceClose: "Cerrar configuración de voz",
    voiceSpeed: "Velocidad del Habla",
    voiceLanguage: "Idioma del Asistente",
    voiceSupport: "Las preferencias se guardan en este navegador.",
    voiceAutomatic: "Automática",
  },
  he: {
    headline:
      "👋 שלום! אני העוזר הווירטואלי של מורו דיגיטל. איך אוכל לעזור לך היום?",
    tagline:
      "האם זו הפעם הראשונה שלך במורו דה סאו פאולו? אני יכול להראות לך את המקומות הטובים ביותר לבקר.",
    mapSection: "מפה אינטראקטיבית",
    mapRegion: "מפה אינטראקטיבית של Morro de São Paulo",
    submenu: "חקר מקומות",
    submenuClose: "סגור תפריט",
    inputPlaceholder: "הקלד את שאלתך...",
    inputAria: "הודעה לעוזר",
    sendAria: "שלח הודעה",
    voiceAria: "שלח הודעה קולית",
    settingsAria: "הגדרות העוזר",
    globalView: "החלף לתצוגה גלובלית של המפה",
    navigationMain: "המשך ישר",
    navigationMinimize: "מזעור הוראות ניווט",
    distance: "מרחק",
    time: "זמן",
    loading: "טוען את Morro Digital...",
    stop: "עצור ניווט",
    carouselClose: "סגור",
    voiceTitle: "קול העוזר",
    voiceClose: "סגור הגדרות קול",
    voiceSpeed: "מהירות דיבור",
    voiceLanguage: "שפת העוזר",
    voiceSupport: "ההעדפות נשמרות בדפדפן הזה.",
    voiceAutomatic: "אוטומטי",
  },
};

function equal(actual, expectedValue, label) {
  if (actual !== expectedValue) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expectedValue)}, got ${JSON.stringify(actual)}`,
    );
  }
}

async function setLanguage(page, language) {
  await page.evaluate((next) => {
    document.documentElement.lang = next;
  }, language);
}

async function readShell(page) {
  return page.evaluate(() => {
    const text = (selector) =>
      document.querySelector(selector)?.textContent?.trim() ?? "";
    const attr = (selector, name) =>
      document.querySelector(selector)?.getAttribute(name) ?? null;
    return {
      headline: text("header h1"),
      tagline: text("header .tagline"),
      mapSection: attr("#map-section", "aria-label"),
      mapRegion: attr("#map", "aria-label"),
      submenu: text("#submenu .submenu-title"),
      submenuClose: attr("#submenu .close-button", "aria-label"),
      inputPlaceholder: attr("#assistantInput", "placeholder"),
      inputAria: attr("#assistantInput", "aria-label"),
      sendAria: attr("#sendButton", "aria-label"),
      voiceAria: attr("#voiceButton", "aria-label"),
      settingsAria: attr("#configButton", "aria-label"),
      globalTitle: attr("#toggle-globe-view", "title"),
      globalAria: attr("#toggle-globe-view", "aria-label"),
      globalTooltip: text("#toggle-globe-view .control-tooltip"),
      navigationMain: text("#instruction-main"),
      navigationMinimize: attr("#minimize-navigation-btn", "aria-label"),
      distance: text("#instruction-distance")
        ? text("#instruction-distance").replace(
            text("#instruction-distance"),
            "",
          )
        : "",
      distanceLabel:
        text("#instruction-distance") === ""
          ? ""
          : text("#instruction-distance"),
      metricLabels: Array.from(
        document.querySelectorAll("#instruction-banner .metric-label"),
      ).map((element) => element.textContent?.trim() ?? ""),
      loading: text("#loading-overlay p"),
      stopText: text("#end-navigation-btn"),
      stopAria: attr("#end-navigation-btn", "aria-label"),
      carouselClose: attr("#carousel-modal-close", "aria-label"),
      voiceTitle: text("#assistantVoiceSettingsTitle"),
      voiceClose: attr("#assistantVoiceSettingsClose", "aria-label"),
      voiceSpeed: text('label[for="assistantVoiceSpeed"] > span')
        .replace(text("#assistantVoiceSpeedValue"), "")
        .trim(),
      voiceLanguage: text('label[for="assistantVoiceLanguage"] > span'),
      voiceSupport: text(".assistant-voice-settings-support"),
      voiceAutomatic:
        document
          .querySelector("#assistantVoiceSelect option")
          ?.textContent?.trim() ?? "",
      categoryValues: Array.from(
        document.querySelectorAll(".assistant-options .assistant-option-btn"),
      ).map((button) => button.getAttribute("data-value")),
    };
  });
}

async function waitShell(page, locale, expectedCopy) {
  const deadline = Date.now() + 8000;
  let observed = null;
  while (Date.now() < deadline) {
    observed = await readShell(page);
    if (
      observed.headline === expectedCopy.headline &&
      observed.tagline === expectedCopy.tagline &&
      observed.mapSection === expectedCopy.mapSection &&
      observed.mapRegion === expectedCopy.mapRegion &&
      observed.inputPlaceholder === expectedCopy.inputPlaceholder &&
      observed.globalAria === expectedCopy.globalView &&
      observed.navigationMain === expectedCopy.navigationMain
    ) {
      return observed;
    }
    await page.waitForTimeout(50);
  }
  throw new Error(
    `shell ${locale}: expected ${JSON.stringify(expectedCopy)}, got ${JSON.stringify(observed)}`,
  );
}

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
    .locator('body[data-public-onboarding-settled="true"]')
    .waitFor({ state: "attached", timeout: 10000 });
  await page
    .locator('#map[data-map-state="ready"]')
    .waitFor({ state: "attached", timeout: 30000 });
  await page
    .locator('#configButton[aria-controls="assistantVoiceSettings"]')
    .waitFor({ state: "attached", timeout: 10000 });

  const canonicalCategoryValues = [
    "beaches",
    "restaurants",
    "hotels",
    "shops",
    "transport",
    "attractions",
    "tours",
    "nightlife",
    "emergencies",
    "help",
  ];

  for (const [locale, browserLocale] of [
    ["pt", "pt-BR"],
    ["en", "en-US"],
    ["es", "es-ES"],
    ["he", "he-IL"],
  ]) {
    await setLanguage(page, browserLocale);
    await page.locator("#configButton").click();
    const observed = await waitShell(page, browserLocale, expected[locale]);
    equal(observed.submenu, expected[locale].submenu, `${locale} submenu`);
    equal(
      observed.submenuClose,
      expected[locale].submenuClose,
      `${locale} submenu close`,
    );
    equal(
      observed.inputAria,
      expected[locale].inputAria,
      `${locale} input aria`,
    );
    equal(observed.sendAria, expected[locale].sendAria, `${locale} send aria`);
    equal(
      observed.voiceAria,
      expected[locale].voiceAria,
      `${locale} voice aria`,
    );
    equal(
      observed.settingsAria,
      expected[locale].settingsAria,
      `${locale} settings aria`,
    );
    equal(
      observed.globalTitle,
      expected[locale].globalView,
      `${locale} global title`,
    );
    equal(
      observed.globalTooltip,
      expected[locale].globalView,
      `${locale} global tooltip`,
    );
    equal(
      observed.navigationMinimize,
      expected[locale].navigationMinimize,
      `${locale} navigation minimize`,
    );
    equal(
      observed.metricLabels[0],
      expected[locale].distance,
      `${locale} distance`,
    );
    equal(observed.metricLabels[1], expected[locale].time, `${locale} time`);
    equal(observed.loading, expected[locale].loading, `${locale} loading`);
    equal(observed.stopText, expected[locale].stop, `${locale} stop text`);
    equal(observed.stopAria, expected[locale].stop, `${locale} stop aria`);
    equal(
      observed.carouselClose,
      expected[locale].carouselClose,
      `${locale} carousel close`,
    );
    equal(
      observed.voiceTitle,
      expected[locale].voiceTitle,
      `${locale} voice title`,
    );
    equal(
      observed.voiceClose,
      expected[locale].voiceClose,
      `${locale} voice close`,
    );
    equal(
      observed.voiceSpeed,
      expected[locale].voiceSpeed,
      `${locale} voice speed`,
    );
    equal(
      observed.voiceLanguage,
      expected[locale].voiceLanguage,
      `${locale} voice language`,
    );
    equal(
      observed.voiceSupport,
      expected[locale].voiceSupport,
      `${locale} voice support`,
    );
    equal(
      observed.voiceAutomatic,
      expected[locale].voiceAutomatic,
      `${locale} automatic voice`,
    );
    equal(
      JSON.stringify(observed.categoryValues),
      JSON.stringify(canonicalCategoryValues),
      `${locale} canonical category values`,
    );
    await page.locator("#assistantVoiceSettingsClose").click();
  }

  await page.evaluate(() => {
    const banner = document.getElementById("instruction-banner");
    const instruction = document.getElementById("instruction-main");
    banner?.classList.remove("hidden");
    if (instruction) instruction.textContent = "RUNTIME_SENTINEL";
  });
  await setLanguage(page, "en-US");
  await page.waitForTimeout(100);
  equal(
    await page.locator("#instruction-main").textContent(),
    "RUNTIME_SENTINEL",
    "active navigation instruction ownership",
  );

  if (pageErrors.length > 0) {
    throw new Error(`page errors: ${JSON.stringify(pageErrors)}`);
  }
} finally {
  await browser.close();
}
