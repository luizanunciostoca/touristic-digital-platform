import { describe, expect, it } from "vitest";

import {
  createSearchPresentationRows,
  formatSearchResultText,
  getSearchCategoryIcon,
  getSearchPresentationCopy,
  resolveSearchPresentationLocale,
} from "./search-presentation.js";

describe("Search presentation V1 contract", () => {
  it("preserves the frozen category icon map and fallback", () => {
    expect(getSearchCategoryIcon("restaurants")).toBe("🍽️");
    expect(getSearchCategoryIcon("hotels")).toBe("🏨");
    expect(getSearchCategoryIcon("shops")).toBe("🛍️");
    expect(getSearchCategoryIcon("nightlife")).toBe("🌙");
    expect(getSearchCategoryIcon("emergencies")).toBe("🚨");
    expect(getSearchCategoryIcon("attractions")).toBe("📍");
    expect(getSearchCategoryIcon("places")).toBe("🏙️");
    expect(getSearchCategoryIcon("addresses")).toBe("📬");
    expect(getSearchCategoryIcon("beaches")).toBe("🏖️");
    expect(getSearchCategoryIcon("tours")).toBe("🗺️");
    expect(getSearchCategoryIcon("unknown")).toBe("📍");
  });

  it("preserves single-result text formatting", () => {
    expect(
      formatSearchResultText({
        name: "Farol do Morro",
        category: "attractions",
        placeFormatted: "Morro de São Paulo, Bahia",
      }),
    ).toBe("Farol do Morro — Morro de São Paulo, Bahia");

    expect(
      formatSearchResultText({
        name: "Farol do Morro",
        category: "attractions",
      }),
    ).toBe("Farol do Morro");
  });

  it("creates numbered structured rows without generating provider HTML", () => {
    const rows = createSearchPresentationRows([
      {
        name: "<img src=x onerror=alert(1)>",
        category: "restaurants",
        placeFormatted: "<strong>Bahia</strong>",
      },
    ]);

    expect(rows).toEqual([
      {
        index: 1,
        icon: "🍽️",
        name: "<img src=x onerror=alert(1)>",
        description: " — <strong>Bahia</strong>",
      },
    ]);
  });

  it("freezes PT, EN, ES and HE result copy with Portuguese fallback", () => {
    expect(getSearchPresentationCopy("pt").resultsHeading("Farol")).toBe(
      'Encontrei estes resultados para "Farol":',
    );
    expect(getSearchPresentationCopy("en-US").selectPrompt).toBe(
      "Select a place to view on the map:",
    );
    expect(getSearchPresentationCopy("es").resultsHeading("Farol")).toBe(
      'Encontré estos resultados para "Farol":',
    );
    expect(getSearchPresentationCopy("he").selectPrompt).toBe(
      "בחר מקום לצפייה במפה:",
    );
    expect(resolveSearchPresentationLocale("fr-FR")).toBe("pt");
  });

  it("preserves loading, empty and error state copy", () => {
    const pt = getSearchPresentationCopy("pt");
    const en = getSearchPresentationCopy("en");
    const es = getSearchPresentationCopy("es");
    const he = getSearchPresentationCopy("he");

    expect(pt.loading).toBe("Pensando...");
    expect(en.loading).toBe("Thinking...");
    expect(es.empty).toBe(
      "No encontré información sobre eso. ¿Puedes intentarlo de otra forma?",
    );
    expect(he.error).toBe("מצטער, אירעה שגיאה בעיבוד בקשתך. אנא נסה שוב.");
  });
});
