import assert from "node:assert/strict";
import playwright from "/tmp/pw/node_modules/playwright/index.js";

const { chromium } = playwright;

const weather = {
  temperatureCelsius: 28,
  temperatureMaxCelsius: 31,
  temperatureMinCelsius: 24,
  humidityPercent: 78,
  windSpeedKph: 18,
  rainChancePercent: 42,
  weatherCode: 2,
  isDay: true,
  forecast: [
    {
      date: "2026-09-17",
      temperatureMaxCelsius: 31,
      temperatureMinCelsius: 24,
      humidityPercent: 78,
      windSpeedKph: 18,
      rainChancePercent: 42,
      weatherCode: 2,
    },
    {
      date: "2026-09-18",
      temperatureMaxCelsius: 29,
      temperatureMinCelsius: 23,
      humidityPercent: 81,
      windSpeedKph: 16,
      rainChancePercent: 67,
      weatherCode: 61,
    },
  ],
};

const expectations = [
  {
    lang: "pt-BR",
    clickHere: "Clique aqui",
    openLabel: "Abrir previsão do tempo",
    error: "Não foi possível atualizar o clima.",
    title: "Previsão do tempo",
    closeLabel: "Fechar previsão",
    daysLabel: "Dias da previsão",
    chartLabel: "Temperaturas máximas previstas",
    high: "Máxima",
    low: "Mínima",
    rain: "Chuva",
    humidity: "Umidade",
    wind: "Vento",
    condition: "Chuva",
    selectedDateNeedle: "sexta-feira",
  },
  {
    lang: "en-US",
    clickHere: "Click here",
    openLabel: "Open weather forecast",
    error: "Could not update the weather.",
    title: "Weather forecast",
    closeLabel: "Close forecast",
    daysLabel: "Forecast days",
    chartLabel: "Forecast high temperatures",
    high: "High",
    low: "Low",
    rain: "Rain",
    humidity: "Humidity",
    wind: "Wind",
    condition: "Rain",
    selectedDateNeedle: "Friday",
  },
  {
    lang: "es-ES",
    clickHere: "Haga clic aquí",
    openLabel: "Abrir previsión del tiempo",
    error: "No se pudo actualizar el clima.",
    title: "Previsión del tiempo",
    closeLabel: "Cerrar previsión",
    daysLabel: "Días de la previsión",
    chartLabel: "Temperaturas máximas previstas",
    high: "Máxima",
    low: "Mínima",
    rain: "Lluvia",
    humidity: "Humedad",
    wind: "Viento",
    condition: "Lluvia",
    selectedDateNeedle: "viernes",
  },
  {
    lang: "he-IL",
    clickHere: "לחץ כאן",
    openLabel: "פתח תחזית מזג האוויר",
    error: "לא ניתן היה לעדכן את מזג האוויר.",
    title: "תחזית מזג האוויר",
    closeLabel: "סגור תחזית",
    daysLabel: "ימי התחזית",
    chartLabel: "טמפרטורות מקסימום חזויות",
    high: "מקסימום",
    low: "מינימום",
    rain: "גשם",
    humidity: "לחות",
    wind: "רוח",
    condition: "גשם",
    selectedDateNeedle: "יום שישי",
  },
];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  geolocation: { latitude: -13.3776181, longitude: -38.9142193 },
  permissions: ["geolocation"],
});

await context.addInitScript(() => {
  localStorage.setItem("morro-digital-onboarded", "1");
  localStorage.setItem("voice-enabled", "false");

  const nativeSetInterval = window.setInterval.bind(window);
  window.__morroWeatherRefresh = undefined;
  window.setInterval = (handler, timeout, ...args) => {
    if (timeout === 10 * 60 * 1000 && typeof handler === "function") {
      window.__morroWeatherRefresh = handler;
    }
    return nativeSetInterval(handler, timeout, ...args);
  };
});

const page = await context.newPage();
let weatherMode = "success";
let pendingWeatherRoute;
await page.route("**/api/weather", async (route) => {
  if (weatherMode === "success") {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(weather),
    });
    return;
  }

  if (weatherMode === "error") {
    await route.fulfill({ status: 503, body: "weather unavailable" });
    return;
  }

  pendingWeatherRoute = route;
});

try {
  await page.goto("http://127.0.0.1:4173/", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page
    .locator('body[data-public-onboarding-settled="true"]')
    .waitFor({ state: "attached", timeout: 10000 });
  await page
    .locator('#weather-widget[data-weather-state="ready"]')
    .waitFor({ state: "attached", timeout: 10000 });

  await page.evaluate(() => {
    document.documentElement.lang = "pt-BR";
  });
  await page.waitForFunction(
    () =>
      document.querySelector("#weather-widget .click-here-text")
        ?.textContent === "Clique aqui",
  );
  await page.locator("#weather-widget").click();
  await page
    .locator(".weather-forecast-modal")
    .waitFor({ state: "visible", timeout: 10000 });

  await page.locator('.day-option[data-day-index="1"]').click();
  await page.waitForFunction(
    () =>
      document
        .querySelector('.day-option[data-day-index="1"]')
        ?.getAttribute("aria-pressed") === "true",
  );

  for (const expected of expectations) {
    await page.evaluate((lang) => {
      document.documentElement.lang = lang;
    }, expected.lang);
    await page.waitForFunction(
      (title) =>
        document.querySelector("#weather-forecast-title")?.textContent ===
        title,
      expected.title,
    );

    const snapshot = await page.evaluate(() => ({
      widgetAria: document
        .querySelector("#weather-widget")
        ?.getAttribute("aria-label"),
      clickHere: document.querySelector("#weather-widget .click-here-text")
        ?.textContent,
      title: document.querySelector("#weather-forecast-title")?.textContent,
      closeAria: document
        .querySelector(".forecast-close-btn")
        ?.getAttribute("aria-label"),
      daysAria: document
        .querySelector(".day-selector")
        ?.getAttribute("aria-label"),
      chartAria: document
        .querySelector(".temp-chart-container svg")
        ?.getAttribute("aria-label"),
      currentDetails:
        document.querySelector(".current-weather-details")?.textContent ?? "",
      condition:
        document.querySelector(".weather-selected-day .current-condition")
          ?.textContent ?? "",
      labels: Array.from(
        document.querySelectorAll(
          ".weather-selected-day .forecast-detail-item .label",
        ),
      ).map((node) => node.textContent ?? ""),
      selectedDate:
        document.querySelector(".weather-selected-day .day-full-date")
          ?.textContent ?? "",
      selectedIndex: document
        .querySelector('.day-option[aria-pressed="true"]')
        ?.getAttribute("data-day-index"),
    }));

    assert.equal(snapshot.widgetAria, expected.openLabel);
    assert.equal(snapshot.clickHere, expected.clickHere);
    assert.equal(snapshot.title, expected.title);
    assert.equal(snapshot.closeAria, expected.closeLabel);
    assert.equal(snapshot.daysAria, expected.daysLabel);
    assert.equal(snapshot.chartAria, expected.chartLabel);
    assert.equal(snapshot.condition, expected.condition);
    assert.deepEqual(snapshot.labels, [
      expected.high,
      expected.low,
      expected.rain,
      expected.humidity,
      expected.wind,
    ]);
    assert.match(snapshot.currentDetails, new RegExp(expected.humidity));
    assert.match(snapshot.currentDetails, new RegExp(expected.wind));
    assert.match(snapshot.currentDetails, new RegExp(expected.rain));
    assert.match(
      snapshot.selectedDate,
      new RegExp(expected.selectedDateNeedle),
    );
    assert.equal(
      snapshot.selectedIndex,
      "1",
      `selected forecast day must survive live locale switch to ${expected.lang}`,
    );
  }

  await page.locator(".forecast-close-btn").click();
  weatherMode = "error";
  await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
  await page
    .locator('body[data-public-onboarding-settled="true"]')
    .waitFor({ state: "attached", timeout: 10000 });
  await page
    .locator('#weather-widget[data-weather-state="error"] .weather-error')
    .waitFor({ state: "visible", timeout: 10000 });

  for (const expected of expectations) {
    await page.evaluate((lang) => {
      document.documentElement.lang = lang;
    }, expected.lang);
    await page.waitForFunction(
      (errorText) =>
        document.querySelector("#weather-widget .weather-error")?.textContent ===
        errorText,
      expected.error,
    );
    assert.equal(
      await page.locator("#weather-widget").getAttribute("aria-label"),
      expected.openLabel,
    );
  }

  await page.evaluate(() => {
    document.documentElement.lang = "pt-BR";
  });
  await page.waitForFunction(
    () =>
      document.querySelector("#weather-widget .weather-error")?.textContent ===
      "Não foi possível atualizar o clima.",
  );

  weatherMode = "pending";
  pendingWeatherRoute = undefined;
  await page.evaluate(() => {
    if (typeof window.__morroWeatherRefresh !== "function") {
      throw new Error("Weather refresh callback was not captured.");
    }
    window.__morroWeatherRefresh();
  });
  await page.waitForFunction(
    () =>
      document.querySelector("#weather-widget")?.getAttribute("aria-busy") ===
        "true" &&
      document.querySelector("#weather-widget")?.dataset.weatherState ===
        "loading",
  );

  for (let attempt = 0; attempt < 50 && !pendingWeatherRoute; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.ok(pendingWeatherRoute, "refresh request should remain pending");

  await page.evaluate(() => {
    document.documentElement.lang = "en-US";
  });
  await page.waitForFunction(
    () =>
      document.querySelector("#weather-widget .weather-error")?.textContent ===
      "Could not update the weather.",
  );
  assert.equal(
    await page.locator("#weather-widget").getAttribute("data-weather-state"),
    "loading",
    "visible stale error must relocalize while a refresh is still in flight",
  );

  weatherMode = "error";
  await pendingWeatherRoute.fulfill({
    status: 503,
    body: "weather unavailable",
  });
  pendingWeatherRoute = undefined;
  await page.waitForFunction(
    () =>
      document.querySelector("#weather-widget")?.dataset.weatherState ===
        "error" &&
      document.querySelector("#weather-widget .weather-error")?.textContent ===
        "Could not update the weather.",
  );

  console.log("WEATHER_V1_I18N_BROWSER_PARITY=PASS");
} finally {
  await browser.close();
}
