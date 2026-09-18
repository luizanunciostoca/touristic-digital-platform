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

const filters = {
  en: {
    category: "Beaches",
    aria: "Beaches, 8 places",
    labels: [
      "🏄 Good waves for surfing",
      "🤿 For diving / snorkel",
      "🌅 For sunset",
      "👨‍👩‍👧 Family-friendly / calm",
      "🎵 With bars / facilities",
      "📍 Nearby",
      "🗺️ See all",
      "🔙 Back to menu",
    ],
  },
  es: {
    category: "Playas",
    aria: "Playas, 8 lugares",
    labels: [
      "🏄 Con olas para surf",
      "🤿 Para buceo / snorkel",
      "🌅 Para ver el atardecer",
      "👨‍👩‍👧 Familiar / tranquila",
      "🎵 Con estructura / bares",
      "📍 Cercanos a mí",
      "🗺️ Ver todos",
      "🔙 Volver al menú",
    ],
  },
  he: {
    category: "חופים",
    aria: "חופים, 8 מקומות",
    labels: [
      "🏄 עם גלים לגלישה",
      "🤿 לצלילה / שנורקל",
      "🌅 לשקיעה",
      "👨‍👩‍👧 משפחתי / רגוע",
      "🎵 עם ברים / תשתיות",
      "📍 קרובים אלי",
      "🗺️ ראה הכל",
      "🔙 חזרה לתפריט",
    ],
  },
};

const tourValues = ["volta-a-ilha", "trilha-gamboa", "passeio-quadriciclo"];
const runtimeAccessibility = {
  pt: {
    selectAria: "Roteiro exibido no mapa",
    tourLabels: [
      "Passeio Volta à Ilha",
      "Trilha Ecológica para a Gamboa",
      "Expedição de Quadriciclo",
    ],
    statusNeedle: "Runtime ativo",
  },
  en: {
    selectAria: "Tour displayed on the map",
    tourLabels: [
      "Island Round Trip",
      "Ecological Trail to Gamboa",
      "ATV Expedition",
    ],
    statusNeedle: "Runtime active",
  },
  es: {
    selectAria: "Recorrido mostrado en el mapa",
    tourLabels: [
      "Vuelta a la Isla",
      "Sendero Ecológico a Gamboa",
      "Expedición en Cuadriciclo",
    ],
    statusNeedle: "Runtime activo",
  },
  he: {
    selectAria: "המסלול המוצג במפה",
    tourLabels: ["סיבוב האי", "שביל אקולוגי לגמבואה", "מסע קוואדריציקל"],
    statusNeedle: "המערכת פעילה",
  },
};

const filterValues = [
  "surf",
  "mergulho",
  "por do sol",
  "familiar",
  "estrutura",
  "proximo",
  "ver todos",
  "voltar_menu",
];
const beachDetailValues = [
  "condições da praia",
  "como chegar",
  "ver fotos",
  "informações",
  "mais opções",
  "[sub]beaches",
];
const beachDetailHebrew = [
  "🌊 תנאי החוף",
  "📍 איך להגיע",
  "📸 צפה תמונות",
  "ℹ️ מידע",
  "אפשרויות נוספות",
  "⬅️ חזרה",
];
const restaurantPrimaryEnglish = [
  "🍴 Menu",
  "📍 Directions",
  "📸 View photos",
  "📞 Contact",
  "More options",
  "⬅️ Back",
];
const restaurantSecondaryEnglish = [
  "ℹ️ Information",
  "🕒 Hours",
  "💰 Price range",
  "⭐ Reviews",
  "❤️ Favorite",
  "⬅️ Back",
];
const restaurantSecondaryValues = [
  "mais detalhes",
  "horário de funcionamento",
  "quanto custa",
  "avaliações",
  "adicionar aos favoritos",
  "Morena Bela",
];

function equal(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

async function setLanguage(page, language) {
  await page.evaluate((next) => {
    document.documentElement.lang = next;
  }, language);
}

async function waitRuntimeAccessibility(page, locale, expected) {
  const deadline = Date.now() + 5000;
  let observed = null;
  while (Date.now() < deadline) {
    observed = await page.evaluate(() => {
      const select = document.getElementById("tour-select");
      const options = Array.from(select?.querySelectorAll("option") ?? []);
      return {
        selectAria: select?.getAttribute("aria-label") ?? null,
        tourLabels: options.map((option) => option.textContent?.trim() ?? ""),
        tourValues: options.map((option) => option.value),
        status:
          document.getElementById("runtime-status")?.textContent?.trim() ?? "",
      };
    });
    if (
      observed.selectAria === expected.selectAria &&
      JSON.stringify(observed.tourLabels) ===
        JSON.stringify(expected.tourLabels) &&
      JSON.stringify(observed.tourValues) === JSON.stringify(tourValues) &&
      observed.status.includes(expected.statusNeedle)
    ) {
      return;
    }
    await page.waitForTimeout(50);
  }
  throw new Error(
    `runtime accessibility ${locale}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(observed)}`,
  );
}

async function waitExploreSelectedStatus(page, expectedText) {
  const deadline = Date.now() + 5000;
  let observed = null;
  while (Date.now() < deadline) {
    observed = await page.evaluate(() => {
      const status = document.getElementById("runtime-status");
      return {
        owner: status?.getAttribute("data-status-owner") ?? null,
        text: status?.textContent?.trim() ?? "",
      };
    });
    if (observed.owner === "explore" && observed.text === expectedText) return;
    await page.waitForTimeout(50);
  }
  throw new Error(
    `explore status: expected ${JSON.stringify({ owner: "explore", text: expectedText })}, got ${JSON.stringify(observed)}`,
  );
}

async function waitCategory(page, value, text, aria) {
  const button = page.locator(`#assistant-category-${value}`);
  await button.waitFor({ state: "attached", timeout: 5000 });
  const deadline = Date.now() + 5000;
  let observed = { text: "", aria: null };
  while (Date.now() < deadline) {
    observed = {
      text: (await button.textContent())?.trim() ?? "",
      aria: await button.getAttribute("aria-label"),
    };
    if (observed.text === text && observed.aria === aria) return;
    await page.waitForTimeout(50);
  }
  throw new Error(
    `category ${value}: expected ${JSON.stringify({ text, aria })}, got ${JSON.stringify(observed)}`,
  );
}

async function readOptions(page, selector) {
  const options = page.locator(`${selector} .assistant-option-btn`);
  return {
    labels: await options
      .allTextContents()
      .then((items) => items.map((item) => item.trim())),
    values: await options.evaluateAll((buttons) =>
      buttons.map((button) => button.getAttribute("data-value")),
    ),
  };
}

async function readFlow(page) {
  return readOptions(page, "#assistant-category-results");
}

async function readDynamic(page) {
  const containers = page.locator(
    ".assistant-options:not(#assistant-category-results):not(:has([data-explore-category]))",
  );
  if ((await containers.count()) === 0) return { labels: [], values: [] };
  const options = containers.last().locator(".assistant-option-btn");
  return {
    labels: await options
      .allTextContents()
      .then((items) => items.map((item) => item.trim())),
    values: await options.evaluateAll((buttons) =>
      buttons.map((button) => button.getAttribute("data-value")),
    ),
  };
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
const mapboxHttpErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
page.on("response", (response) => {
  if (response.url().includes("mapbox.com") && response.status() >= 400) {
    mapboxHttpErrors.push(response.status());
  }
});
await page.route("**/api/weather", (route) =>
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
    .locator('#map[data-map-state="ready"][data-map-mode="real"]')
    .waitFor({ state: "attached", timeout: 30000 });
  await page
    .locator("#loading-overlay.fade-out")
    .waitFor({ state: "attached", timeout: 5000 });
  await page
    .locator('body[data-public-onboarding-settled="true"]')
    .waitFor({ state: "attached", timeout: 5000 });
  const assistant = page.locator("#assistant-messages");
  const quickAction = page.locator(
    '.mood-button[data-assistant-shell-ready="true"]',
  );
  await quickAction.waitFor({ state: "visible", timeout: 5000 });
  if (!(await assistant.isVisible())) await quickAction.click();
  await assistant.waitFor({ state: "visible", timeout: 5000 });

  await waitCategory(page, "beaches", "Praias", "Praias, 8 locais");
  await waitRuntimeAccessibility(page, "pt", runtimeAccessibility.pt);
  for (const locale of ["en", "es"]) {
    await setLanguage(page, locale);
    await waitRuntimeAccessibility(page, locale, runtimeAccessibility[locale]);
    const expected = filters[locale];
    await waitCategory(page, "beaches", expected.category, expected.aria);
    await page.locator("#assistant-category-beaches").click();
    await page
      .locator('#assistant-category-results[data-stage="filters"]')
      .waitFor({ state: "visible" });
    const flow = await readFlow(page);
    equal(flow.labels, expected.labels, `${locale} filter labels`);
    equal(flow.values, filterValues, `${locale} canonical filter values`);
    await page.keyboard.press("Escape");
  }

  await setLanguage(page, "he");
  await waitRuntimeAccessibility(page, "he", runtimeAccessibility.he);
  await waitCategory(page, "beaches", filters.he.category, filters.he.aria);
  await page.locator("#assistant-category-beaches").click();
  await page
    .locator('#assistant-category-results[data-stage="filters"]')
    .waitFor({ state: "visible" });
  equal((await readFlow(page)).labels, filters.he.labels, "he filter labels");
  await page
    .locator('#assistant-category-results [data-value="ver todos"]')
    .click();
  await page
    .locator(
      '#assistant-category-results[data-stage="places"] [data-location-name="Primeira Praia"]',
    )
    .waitFor({ state: "visible" });
  await page
    .locator(
      '#assistant-category-results [data-location-name="Primeira Praia"]',
    )
    .click();
  await page
    .locator('.assistant-option-btn[data-value="condições da praia"]')
    .waitFor({ state: "visible" });
  let dynamic = await readDynamic(page);
  equal(dynamic.labels, beachDetailHebrew, "he beach detail labels");
  equal(dynamic.values, beachDetailValues, "he beach canonical values");
  await waitExploreSelectedStatus(page, "Primeira Praia נבחר.");
  await setLanguage(page, "en");
  await waitExploreSelectedStatus(page, "Primeira Praia selected.");
  await setLanguage(page, "he");
  await waitExploreSelectedStatus(page, "Primeira Praia נבחר.");
  await page
    .locator('.assistant-option-btn[data-value="[sub]beaches"]')
    .click();
  await page
    .locator('#assistant-category-results[data-stage="places"]')
    .waitFor({ state: "visible" });
  await page.keyboard.press("Escape");

  await setLanguage(page, "en-US");
  await waitRuntimeAccessibility(page, "en-US", runtimeAccessibility.en);
  await waitCategory(
    page,
    "restaurants",
    "Restaurants",
    "Restaurants, 45 places",
  );
  await page.locator("#assistant-category-restaurants").click();
  await page
    .locator('#assistant-category-results[data-stage="filters"]')
    .waitFor({ state: "visible" });
  await page
    .locator('#assistant-category-results [data-value="ver todos"]')
    .click();
  await page
    .locator(
      '#assistant-category-results[data-stage="places"] [data-location-name="Morena Bela"]',
    )
    .waitFor({ state: "visible" });
  await page
    .locator('#assistant-category-results [data-location-name="Morena Bela"]')
    .click();
  await page
    .locator('.assistant-option-btn[data-value="cardápio"]')
    .waitFor({ state: "visible" });
  dynamic = await readDynamic(page);
  equal(
    dynamic.labels,
    restaurantPrimaryEnglish,
    "en restaurant primary labels",
  );
  await page
    .locator('.assistant-option-btn[data-value="mais opções"]')
    .last()
    .click();
  await page
    .locator('.assistant-option-btn[data-value="avaliações"]')
    .last()
    .waitFor({ state: "visible" });
  dynamic = await readDynamic(page);
  equal(
    dynamic.labels,
    restaurantSecondaryEnglish,
    "en restaurant secondary labels",
  );
  equal(
    dynamic.values,
    restaurantSecondaryValues,
    "en restaurant secondary canonical values",
  );

  // Leave the active Explore detail before asserting the generic runtime status.
  // While a place is selected, Explore intentionally owns #runtime-status and
  // must survive language changes; that contract is verified above with
  // Primeira Praia. Re-enter the category flow and Escape back to the main menu
  // so the runtime owns the status again for the HE accessibility assertion.
  await page.evaluate(() => {
    const category = document.getElementById("assistant-category-restaurants");
    if (!(category instanceof HTMLButtonElement)) {
      throw new Error("restaurants category button missing");
    }
    category.click();
  });
  await page
    .locator('#assistant-category-results[data-stage="filters"]')
    .waitFor({ state: "visible" });
  await page.keyboard.press("Escape");

  await setLanguage(page, "he");
  await waitRuntimeAccessibility(page, "he", runtimeAccessibility.he);
  await page.evaluate(() => {
    const select = document.getElementById("tour-select");
    if (!(select instanceof HTMLSelectElement))
      throw new Error("tour-select missing");
    select.value = "volta-a-ilha";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page
    .locator('#map[data-tour-state="ready"][data-active-tour="volta-a-ilha"]')
    .waitFor({ state: "attached", timeout: 30000 });
  const tourMarker = page
    .locator(
      '.tour-stop-marker[data-tour-id="volta-a-ilha"][data-stop-id="stop-1"]',
    )
    .first();
  await tourMarker.waitFor({ state: "attached", timeout: 5000 });
  equal(
    await tourMarker.getAttribute("aria-label"),
    "יציאה: Terceira Praia",
    "he tour marker aria label",
  );
  if (
    !(await page.locator("#runtime-status").textContent())?.includes(
      "סיבוב האי",
    )
  ) {
    throw new Error(
      "he tour runtime status did not localize the active tour title",
    );
  }

  await setLanguage(page, "en");
  await waitRuntimeAccessibility(page, "en", runtimeAccessibility.en);
  const markerDeadline = Date.now() + 5000;
  while (Date.now() < markerDeadline) {
    if (
      (await tourMarker.getAttribute("aria-label")) ===
      "Departure: Terceira Praia"
    )
      break;
    await page.waitForTimeout(50);
  }
  equal(
    await tourMarker.getAttribute("aria-label"),
    "Departure: Terceira Praia",
    "live language switch tour marker aria label",
  );

  await setLanguage(page, "pt-BR");
  await waitRuntimeAccessibility(page, "pt-BR", runtimeAccessibility.pt);
  await waitCategory(page, "beaches", "Praias", "Praias, 8 locais");
  if (pageErrors.length || mapboxHttpErrors.length) {
    throw new Error(
      `browser/provider errors: ${JSON.stringify({ pageErrors, mapboxHttpErrors })}`,
    );
  }
  console.log(
    JSON.stringify({
      result: "pass",
      locales: ["pt", "en", "es", "he"],
      canonicalValuesPreserved: true,
      liveLanguageSwitch: true,
    }),
  );
} finally {
  await context.close();
  await browser.close();
}
