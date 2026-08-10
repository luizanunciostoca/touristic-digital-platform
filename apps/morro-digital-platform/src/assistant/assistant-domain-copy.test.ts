import { describe, expect, it } from "vitest";

import {
  favoritesCopy,
  formatPlaceDetailsCopy,
  helpResponse,
  hoursCopy,
  locationCopy,
  moreInfoUnavailable,
  photosCopy,
  placeDetailsOptions,
  priceCopy,
  type AssistantDomainLanguage,
} from "./assistant-domain-copy.js";

const languages: AssistantDomainLanguage[] = ["pt", "en", "es", "he"];

describe("assistant domain i18n copy", () => {
  it.each(languages)(
    "provides localized help and place options in %s",
    (language) => {
      expect(helpResponse(language).text.length).toBeGreaterThan(20);
      expect(helpResponse(language).options).toHaveLength(4);
      expect(placeDetailsOptions(language)).toHaveLength(4);
    },
  );

  it.each(languages)("provides all location states in %s", (language) => {
    const copy = locationCopy(language);
    expect(copy.unavailable).toBeTruthy();
    expect(copy.resolved).toBeTruthy();
    expect(copy.failed).toBeTruthy();
  });

  it.each(languages)(
    "localizes favorites/photos/hours/more-info/price in %s",
    (language) => {
      expect(favoritesCopy(language, [])).toBeTruthy();
      expect(favoritesCopy(language, ["Segunda Praia"])).toContain(
        "Segunda Praia",
      );
      expect(photosCopy(language, "resolved", "Segunda Praia", 3)).toContain(
        "3",
      );
      expect(hoursCopy(language, "Segunda Praia", true)).toContain(
        "Segunda Praia",
      );
      expect(moreInfoUnavailable(language, "Segunda Praia")).toContain(
        "Segunda Praia",
      );
      expect(priceCopy(language, "Segunda Praia")).toContain("Segunda Praia");
    },
  );

  it.each(languages)("formats observable place details in %s", (language) => {
    const result = formatPlaceDetailsCopy(language, {
      name: "Segunda Praia",
      category: "beach",
      address: "Morro de São Paulo",
      openNow: true,
      phone: "+55 75 99999-0000",
      website: "https://example.com",
    });
    expect(result).toContain("Segunda Praia");
    expect(result).toContain("+55 75 99999-0000");
    expect(result).toContain("https://example.com");
  });

  it("keeps representative copy language-specific", () => {
    expect(helpResponse("en").text).toContain("beaches");
    expect(helpResponse("es").text).toContain("playas");
    expect(helpResponse("he").text).toContain("חופים");
    expect(locationCopy("pt").resolved).toBe(
      "Localização atualizada com sucesso.",
    );
  });
});
