import { chromium } from "/tmp/pw/node_modules/playwright/index.js";

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
    labels: await options.allTextContents().then((items) => items.map((item) => item.trim())),
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
  const count = await containers.count();
  return count > 0
    ? readOptions(page, `.assistant-options:not(#assistant-category-results):not(:has([data-explore-category])):nth-of-type(${count})`)
    : { labels: [], values: [] };
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
  await page.locator("#loading-overlay.fade-out").waitFor({ state: "attached", timeout: 5000 });
  const assistant = page.locator("#assistant-messages");
  const quickAction = page.locator('.mood-button[data-assistant-shell-ready="true"]');
  await quickAction.waitFor({ state: "visible", timeout: 5000 });
  if (!(await assistant.isVisible())) await quickAction.click();
  await assistant.waitFor({ state: "visible", timeout: 5000 });

  await waitCategory(page, "beaches", "Praias", "Praias, 8 locais");
  for (const locale of ["en", "es"]) {
    await setLanguage(page, locale);
    const expected = filters[locale];
    await waitCategory(page, "beaches", expected.category, expected.aria);
    await page.locator("#assistant-category-beaches").click();
    await page.locator('#assistant-category-results[data-stage="filters"]').waitFor({ state: "visible" });
    const flow = await readFlow(page);
    equal(flow.labels, expected.labels, `${locale} filter labels`);
    equal(flow.values, filterValues, `${locale} canonical filter values`);
    await page.keyboard.press("Escape");
  }

  await setLanguage(page, "he");
  await waitCategory(page, "beaches", filters.he.category, filters.he.aria);
  await page.locator("#assistant-category-beaches").click();
  await page.locator('#assistant-category-results[data-stage="filters"]').waitFor({ state: "visible" });
  equal((await readFlow(page)).labels, filters.he.labels, "he filter labels");
  await page.locator('#assistant-category-results [data-value="ver todos"]').click();
  await page
    .locator('#assistant-category-results[data-stage="places"] [data-location-name="Primeira Praia"]')
    .waitFor({ state: "visible" });
  await page.locator('#assistant-category-results [data-location-name="Primeira Praia"]').click();
  await page.locator('.assistant-option-btn[data-value="condições da praia"]').waitFor({ state: "visible" });
  let dynamic = await readDynamic(page);
  equal(dynamic.labels, beachDetailHebrew, "he beach detail labels");
  equal(dynamic.values, beachDetailValues, "he beach canonical values");
  await page.locator('.assistant-option-btn[data-value="[sub]beaches"]').click();
  await page.locator('#assistant-category-results[data-stage="places"]').waitFor({ state: "visible" });
  await page.keyboard.press("Escape");

  await setLanguage(page, "en-US");
  await waitCategory(page, "restaurants", "Restaurants", "Restaurants, 45 places");
  await page.locator("#assistant-category-restaurants").click();
  await page.locator('#assistant-category-results[data-stage="filters"]').waitFor({ state: "visible" });
  await page.locator('#assistant-category-results [data-value="ver todos"]').click();
  await page
    .locator('#assistant-category-results[data-stage="places"] [data-location-name="Morena Bela"]')
    .waitFor({ state: "visible" });
  await page.locator('#assistant-category-results [data-location-name="Morena Bela"]').click();
  await page.locator('.assistant-option-btn[data-value="cardápio"]').waitFor({ state: "visible" });
  dynamic = await readDynamic(page);
  equal(dynamic.labels, restaurantPrimaryEnglish, "en restaurant primary labels");
  await page.locator('.assistant-option-btn[data-value="mais opções"]').last().click();
  await page.locator('.assistant-option-btn[data-value="avaliações"]').last().waitFor({ state: "visible" });
  dynamic = await readDynamic(page);
  equal(dynamic.labels, restaurantSecondaryEnglish, "en restaurant secondary labels");
  equal(dynamic.values, restaurantSecondaryValues, "en restaurant secondary canonical values");

  await setLanguage(page, "pt-BR");
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
