import { describe, expect, it } from "vitest";

import {
  commerceIntlLocale,
  getExperiencePresentationCopy,
  getTicketingPresentationCopy,
} from "./commerce-i18n.js";

describe("commerce canonical i18n", () => {
  it.each([
    ["pt-BR", "pt-BR"],
    ["pt-PT", "pt-BR"],
    ["en-GB", "en-US"],
    ["es-AR", "es-ES"],
    ["he-IL", "he-IL"],
    ["iw-IL", "he-IL"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(commerceIntlLocale(input)).toBe(expected);
  });

  it("exposes localized Ticketing copy for all supported locales", () => {
    expect(getTicketingPresentationCopy("pt-BR").reserve).toBe("Reservar");
    expect(getTicketingPresentationCopy("en-US").reserve).toBe("Reserve");
    expect(getTicketingPresentationCopy("es-ES").reserve).toBe("Reservar");
    expect(getTicketingPresentationCopy("he-IL").reserve).toBe("הזמנה");
  });

  it("localizes dynamic commerce messages instead of hard-coding pt-BR", () => {
    const english = getTicketingPresentationCopy("en-US");
    expect(english.availableCount(3)).toBe("3 available");
    expect(english.validUntil("Sep 20, 2026")).toContain("Sep 20, 2026");
    expect(english.validThrough("Sep 20, 2026")).toBe(
      "valid until Sep 20, 2026",
    );

    const spanish = getExperiencePresentationCopy("es-ES");
    expect(spanish.availableCount(2)).toBe("2 disponibles");
    expect(spanish.salesWindow("10:00", "18:00")).toBe("10:00 hasta 18:00");
  });

  it("provides Hebrew presentation copy for RTL commerce surfaces", () => {
    const ticketing = getTicketingPresentationCopy("he-IL");
    const experience = getExperiencePresentationCopy("he-IL");

    expect(ticketing.static.mainTitle).toBe("כרטיסים והזמנות");
    expect(ticketing.yourTicket).toBe("הכרטיס שלך");
    expect(experience.static.loading).toBe("טוען חוויה…");
  });
});
