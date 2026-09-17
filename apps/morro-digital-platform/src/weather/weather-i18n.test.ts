import { describe, expect, it } from "vitest";

import {
  getWeatherPresentationCopy,
  weatherConditionLabel,
  weatherIntlLocale,
  weatherPresentationLocale,
} from "./weather-i18n.js";

describe("V1 weather presentation i18n", () => {
  it("normalizes V1 browser language aliases through the canonical locale contract", () => {
    expect(weatherPresentationLocale("pt")).toBe("pt-BR");
    expect(weatherPresentationLocale("pt-PT")).toBe("pt-BR");
    expect(weatherPresentationLocale("en-US")).toBe("en");
    expect(weatherPresentationLocale("es-AR")).toBe("es");
    expect(weatherPresentationLocale("he-IL")).toBe("he");
    expect(weatherPresentationLocale("iw-IL")).toBe("he");
  });

  it("preserves the V1 weather labels in all four languages", () => {
    expect(getWeatherPresentationCopy("pt").clickHere).toBe("Clique aqui");
    expect(getWeatherPresentationCopy("en").high).toBe("High");
    expect(getWeatherPresentationCopy("es").rain).toBe("Lluvia");
    expect(getWeatherPresentationCopy("he").windUnit).toBe('קמ"ש');
  });

  it("maps WMO conditions to localized V1-equivalent presentation", () => {
    expect(weatherConditionLabel(0, "en")).toBe("Clear sky");
    expect(weatherConditionLabel(2, "es")).toBe("Parcialmente nublado");
    expect(weatherConditionLabel(53, "he")).toBe("גשם קל");
    expect(weatherConditionLabel(95, "pt")).toBe("Tempestades com trovoadas");
  });

  it("uses locale-specific Intl tags for deterministic date presentation", () => {
    expect(weatherIntlLocale("pt")).toBe("pt-BR");
    expect(weatherIntlLocale("en")).toBe("en-US");
    expect(weatherIntlLocale("es")).toBe("es-ES");
    expect(weatherIntlLocale("he")).toBe("he-IL");
  });
});
