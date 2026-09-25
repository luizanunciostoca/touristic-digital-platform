import { writeFileSync } from "node:fs";

import playwright from "/tmp/pw/node_modules/playwright/index.js";

const { chromium } = playwright;

const canonicalPlaces = Object.freeze([
  Object.freeze({
    id: "place-toca",
    name: "Toca do Morcego",
    category: "nightlife",
    lat: -13.377,
    lng: -38.915,
    presentation: Object.freeze({
      markerKey: "nightlife",
      priority: 10,
    }),
  }),
  Object.freeze({
    id: "place-fail",
    name: "Canonical Sem Detalhe",
    category: "nightlife",
    lat: -13.378,
    lng: -38.916,
    presentation: Object.freeze({
      markerKey: "nightlife",
      priority: 20,
    }),
  }),
]);

const canonicalDetail = Object.freeze({
  profile: Object.freeze({
    id: "place-toca",
    destinationId: "morro-de-sao-paulo",
    name: "Toca do Morcego",
    slug: "toca-do-morcego",
    categoryId: "nightlife",
    subcategoryIds: Object.freeze([]),
    shortDescription: "Sunset",
    description: "Experiência publicada",
    location: Object.freeze({
      latitude: -13.377,
      longitude: -38.915,
      address: "Morro de São Paulo",
      area: "Primeira Praia",
    }),
    contact: Object.freeze({
      phone: null,
      whatsapp: null,
      email: null,
      website: null,
    }),
    openingHours: null,
    amenities: Object.freeze([]),
    tags: Object.freeze(["sunset"]),
    capabilities: Object.freeze(["directions", "tickets"]),
  }),
  media: null,
  commerce: null,
  actions: Object.freeze({
    placeId: "place-toca",
    businessId: "business-toca",
    destinationId: "morro-de-sao-paulo",
    primaryAction: Object.freeze({
      id: "nightlife.tickets",
      label: "Comprar ingressos",
      value: "commerce:offer:offer-1",
      presentation: "primary",
      priority: 10,
      disabled: false,
      availability: "available",
    }),
    secondaryActions: Object.freeze([
      Object.freeze({
        id: "place.directions",
        label: "Como chegar",
        value: "place-action:directions:place-toca",
        presentation: "secondary",
        priority: 20,
        disabled: false,
        availability: "available",
      }),
    ]),
  }),
  partial: Object.freeze({
    media: "unavailable",
    commerce: "unavailable",
    actions: "ready",
  }),
  revision: Object.freeze({
    id: "place-toca:r3",
    number: 3,
  }),
});

async function waitFor(page, probe, label, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await probe()) return;
    await page.waitForTimeout(50);
  }
  throw new Error(`${label} did not become ready`);
}

async function railSnapshot(page) {
  return page.evaluate(() => {
    const rail = document.getElementById("assistant-category-rail");
    return {
      stage: rail?.getAttribute("data-rail-stage") ?? null,
      place: rail?.getAttribute("data-context-place") ?? null,
      options: Array.from(
        rail?.querySelectorAll(
          '[data-context-rail-option="true"][data-value]',
        ) ?? [],
      ).map((node) => ({
        label: node.textContent?.trim() ?? "",
        value: node.getAttribute("data-value"),
        action: node.getAttribute("data-explore-action"),
      })),
    };
  });
}

async function clickPlace(page, name) {
  const selector =
    '#assistant-category-rail[data-rail-stage="places"] ' +
    `[data-location-name="${name}"]`;
  const target = page.locator(selector);
  await target.waitFor({ state: "visible", timeout: 10_000 });
  await target.click();
  await page
    .locator(
      `#assistant-category-rail[data-rail-stage="detail"][data-context-place="${name}"]`,
    )
    .waitFor({ state: "visible", timeout: 10_000 });
}

function assertNoCommercialFallback(snapshot, label) {
  const forbidden = new Set([
    "ver cardápio",
    "reservar mesa",
    "comprar ingressos",
    "ver acomodações",
    "reservar",
    "whatsapp",
  ]);
  const normalized = snapshot.options.map((option) =>
    (option.value ?? "").toLocaleLowerCase("pt-BR"),
  );
  const leaked = normalized.filter((value) => forbidden.has(value));
  if (leaked.length > 0) {
    throw new Error(
      `${label} exposed inferred commercial actions: ${JSON.stringify({
        leaked,
        snapshot,
      })}`,
    );
  }
  if (snapshot.options.some((option) => option.action === "primary")) {
    throw new Error(
      `${label} exposed a primary commercial action without canonical authority: ${JSON.stringify(
        snapshot,
      )}`,
    );
  }
}

const browser = await chromium.launch({ headless: true });

try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  const pageErrors = [];
  const canonicalRequests = {
    map: 0,
    detail: [],
  };

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
        rainChancePercent: 20,
        weatherCode: 1,
        isDay: true,
        forecast: [],
      }),
    }),
  );

  await page.route("**/api/places/v1/map**", (route) => {
    canonicalRequests.map += 1;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: canonicalPlaces,
        nextCursor: null,
      }),
    });
  });

  await page.route(/\/api\/places\/v1\/place-toca\?locale=/u, (route) => {
    canonicalRequests.detail.push("place-toca");
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(canonicalDetail),
    });
  });

  await page.route(/\/api\/places\/v1\/place-fail\?locale=/u, (route) => {
    canonicalRequests.detail.push("place-fail");
    return route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "PUBLIC_PLACE_TEMPORARILY_UNAVAILABLE" }),
    });
  });

  await page.route(
    "**/apps/morro-digital-platform/dist/browser-entry.js",
    (route) => route.abort(),
  );

  await page.goto("http://127.0.0.1:4173/", {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });

  await page.evaluate(async () => {
    localStorage.setItem("morro-digital-onboarded", "1");
    localStorage.setItem("morro-digital-language", "pt-BR");
    localStorage.setItem("voice-enabled", "false");
    document.documentElement.lang = "pt-BR";
    globalThis.__MORRO_RUNTIME_ENV__ = Object.freeze({
      ...(globalThis.__MORRO_RUNTIME_ENV__ ?? {}),
      VITE_PLACE_PLATFORM_AVAILABLE: "true",
    });

    const [
      { bootstrapMorroDigitalApplication },
      { installAssistantShellUi },
      { installBrowserAssistantRuntime },
    ] = await Promise.all([
      import("/apps/morro-digital-platform/dist/main.js"),
      import("/apps/morro-digital-platform/dist/assistant/assistant-shell-ui.js"),
      import("/apps/morro-digital-platform/dist/assistant/browser-assistant-runtime.js"),
    ]);

    const application = bootstrapMorroDigitalApplication(document);
    document.getElementById("loading-overlay")?.remove();

    globalThis.__canonicalProof = {
      markers: [],
      centers: [],
      actions: [],
      states: [],
    };

    application.exploreLocations.setGeospatialEngine({
      initialized: true,
      async replaceMarkers(markers) {
        globalThis.__canonicalProof.markers = markers.map((marker) => ({
          id: marker.id,
          label: marker.label,
        }));
      },
      async setCenter(center) {
        globalThis.__canonicalProof.centers.push(center);
      },
    });

    document.addEventListener("morro:assistant-action-executed", (event) => {
      if (event instanceof CustomEvent) {
        globalThis.__canonicalProof.actions.push(event.detail);
      }
    });
    document.addEventListener("morro:explore-state-changed", (event) => {
      if (event instanceof CustomEvent) {
        globalThis.__canonicalProof.states.push(event.detail);
      }
    });

    globalThis.__canonicalProof.application = application;
    globalThis.__canonicalProof.shell = installAssistantShellUi({
      document,
      focusDelayMs: 0,
    });
    globalThis.__canonicalProof.runtime = installBrowserAssistantRuntime({
      document,
      explore: application.exploreLocations,
      fetch: globalThis.fetch.bind(globalThis),
      navigation: {
        async start() {
          return { type: "FeatureCollection", features: [] };
        },
        stop() {},
      },
    });
  });

  await waitFor(
    page,
    () =>
      page.evaluate(() =>
        globalThis.__canonicalProof.markers.some(
          (marker) => marker.id === "place-toca",
        ),
      ),
    "canonical global marker projection",
  );

  await page.locator("#assistantInput").waitFor({
    state: "visible",
    timeout: 10_000,
  });
  await page.locator("#assistantInput").focus();
  await page
    .locator("#assistant-messages:not(.hidden)")
    .waitFor({ state: "visible", timeout: 5_000 });

  const searchResponse = await page.evaluate(async () => {
    const response =
      await globalThis.__canonicalProof.runtime.process("Toca do Morcego");
    return JSON.parse(JSON.stringify(response));
  });

  const canonicalResult = page.locator(
    '#assistant-category-rail[data-rail-stage="places"] [data-location-name="Toca do Morcego"]',
  );
  try {
    await canonicalResult.waitFor({ state: "visible", timeout: 10_000 });
  } catch (error) {
    const diagnostics = await page.evaluate(() => {
      const rail = document.getElementById("assistant-category-rail");
      const assistant = document.getElementById("assistant-messages");
      return {
        response: globalThis.__canonicalProof?.searchResponse ?? null,
        actions: globalThis.__canonicalProof?.actions ?? [],
        states: globalThis.__canonicalProof?.states ?? [],
        markers: globalThis.__canonicalProof?.markers ?? [],
        rail: {
          exists: Boolean(rail),
          stage: rail?.getAttribute("data-rail-stage") ?? null,
          hidden: rail?.classList.contains("hidden") ?? null,
          ariaHidden: rail?.getAttribute("aria-hidden") ?? null,
          html: rail?.outerHTML ?? null,
        },
        assistant: {
          exists: Boolean(assistant),
          hidden: assistant?.classList.contains("hidden") ?? null,
          ariaHidden: assistant?.getAttribute("aria-hidden") ?? null,
        },
        messages: Array.from(
          document.querySelectorAll("#assistant-messages .message"),
        ).map((node) => node.textContent?.trim() ?? ""),
      };
    });
    diagnostics.response = searchResponse;
    writeFileSync(
      "/tmp/search-canonical-place-browser-evidence.json",
      JSON.stringify(
        {
          result: "failure",
          phase: "canonical-search-to-explore",
          diagnostics,
          canonicalRequests,
          pageErrors,
        },
        null,
        2,
      ),
    );
    throw new Error(
      `Canonical search result did not render in Explore: ${JSON.stringify(
        diagnostics,
      )}`,
      { cause: error },
    );
  }

  const commandEvidence = await page.evaluate(
    () => globalThis.__canonicalProof.actions.at(-1) ?? null,
  );
  const commandResult = commandEvidence?.commands?.[0]?.results?.[0];
  if (
    commandEvidence?.source !== "deterministic" ||
    commandResult?.source !== "canonical" ||
    commandResult?.placeId !== "place-toca"
  ) {
    throw new Error(
      `Search did not preserve canonical placeId into Explore: ${JSON.stringify(
        commandEvidence,
      )}`,
    );
  }

  await clickPlace(page, "Toca do Morcego");

  await waitFor(
    page,
    () =>
      page.evaluate(
        () =>
          document.querySelector(
            '#assistant-category-rail[data-rail-stage="detail"] [data-value="commerce:offer:offer-1"][data-explore-action="primary"]',
          ) !== null,
      ),
    "canonical primary action",
  );

  const canonicalRail = await railSnapshot(page);
  const canonicalState = await page.evaluate(
    () =>
      globalThis.__canonicalProof.states
        .filter((state) => state?.stage === "detail")
        .at(-1) ?? null,
  );
  if (canonicalState?.source !== "canonical") {
    throw new Error(
      `Canonical Explore state lost discovery source: ${JSON.stringify(
        canonicalState,
      )}`,
    );
  }
  if (
    canonicalRail.place !== "Toca do Morcego" ||
    !canonicalRail.options.some(
      (option) =>
        option.value === "commerce:offer:offer-1" &&
        option.action === "primary",
    ) ||
    !canonicalRail.options.some(
      (option) =>
        option.value === "place-action:directions:place-toca" &&
        option.action === "command",
    )
  ) {
    throw new Error(
      `Canonical detail actions were not rendered authoritatively: ${JSON.stringify(
        canonicalRail,
      )}`,
    );
  }

  await page.evaluate(() => {
    globalThis.__canonicalProof.application.exploreLocations.close();
  });

  await page.evaluate(() =>
    globalThis.__canonicalProof.application.exploreLocations.execute({
      type: "show_search_results",
      query: "Canonical Sem Detalhe",
      status: "ready",
      results: [
        {
          name: "Canonical Sem Detalhe",
          category: "nightlife",
          latitude: -13.378,
          longitude: -38.916,
          source: "canonical",
          placeId: "place-fail",
        },
      ],
    }),
  );
  await clickPlace(page, "Canonical Sem Detalhe");

  await waitFor(
    page,
    () =>
      page.evaluate(
        () =>
          globalThis.__canonicalProof?.centers?.length >= 2 &&
          document
            .getElementById("assistant-category-rail")
            ?.getAttribute("data-context-place") === "Canonical Sem Detalhe",
      ),
    "canonical fail-closed detail state",
  );

  const failClosedRail = await railSnapshot(page);
  assertNoCommercialFallback(failClosedRail, "canonical detail failure");

  await page.evaluate(() => {
    globalThis.__canonicalProof.application.exploreLocations.close();
  });

  await page.evaluate(() =>
    globalThis.__canonicalProof.application.exploreLocations.execute({
      type: "show_search_results",
      query: "External Cafe",
      status: "ready",
      results: [
        {
          name: "External Cafe",
          category: "restaurants",
          latitude: -13.379,
          longitude: -38.917,
          area: "Morro de São Paulo",
          source: "mapbox",
        },
      ],
    }),
  );

  await page
    .locator(
      '#assistant-category-rail[data-rail-stage="places"] [data-location-name="External Cafe"]',
    )
    .waitFor({ state: "visible", timeout: 10_000 });
  await clickPlace(page, "External Cafe");

  const externalRail = await railSnapshot(page);
  const externalState = await page.evaluate(
    () =>
      globalThis.__canonicalProof.states
        .filter((state) => state?.stage === "detail")
        .at(-1) ?? null,
  );
  if (externalState?.source !== "mapbox") {
    throw new Error(
      `External Explore state lost discovery source: ${JSON.stringify(
        externalState,
      )}`,
    );
  }
  assertNoCommercialFallback(externalRail, "external Mapbox Place");
  if (
    !externalRail.options.some(
      (option) =>
        option.value === "como chegar" || option.value === "ver fotos",
    )
  ) {
    throw new Error(
      `External Place lost safe non-commercial actions: ${JSON.stringify(
        externalRail,
      )}`,
    );
  }

  if (
    canonicalRequests.map < 1 ||
    canonicalRequests.detail.filter((id) => id === "place-toca").length !== 1 ||
    canonicalRequests.detail.filter((id) => id === "place-fail").length !== 1
  ) {
    throw new Error(
      `Canonical HTTP identity proof diverged: ${JSON.stringify(
        canonicalRequests,
      )}`,
    );
  }

  if (pageErrors.length > 0) {
    throw new Error(`Browser errors: ${JSON.stringify(pageErrors)}`);
  }

  const evidence = {
    result: "pass",
    canonicalRequests,
    commandEvidence,
    canonicalState,
    canonicalRail,
    failClosedRail,
    externalState,
    externalRail,
    pageErrors,
  };
  writeFileSync(
    "/tmp/search-canonical-place-browser-evidence.json",
    JSON.stringify(evidence, null, 2),
  );

  await page.evaluate(() => {
    globalThis.__canonicalProof.runtime.destroy();
    globalThis.__canonicalProof.shell.destroy();
    globalThis.__canonicalProof.application.exploreLocations.destroy();
  });
  await context.close();
} finally {
  await browser.close();
}
