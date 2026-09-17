import { describe, expect, it } from "vitest";

import {
  getShellPresentationCopy,
  shellPresentationLocale,
} from "./shell-v1-i18n.js";

describe("V1 shell presentation i18n", () => {
  it("normalizes the V1 language aliases through the canonical locale contract", () => {
    expect(shellPresentationLocale("pt")).toBe("pt-BR");
    expect(shellPresentationLocale("pt-PT")).toBe("pt-BR");
    expect(shellPresentationLocale("en-US")).toBe("en");
    expect(shellPresentationLocale("es-AR")).toBe("es");
    expect(shellPresentationLocale("he-IL")).toBe("he");
    expect(shellPresentationLocale("iw-IL")).toBe("he");
  });

  it("preserves the frozen V1 shell translations for all four languages", () => {
    expect(
      getShellPresentationCopy("pt").legacy.site_interactive_map_label,
    ).toBe("Mapa interativo");
    expect(
      getShellPresentationCopy("en").legacy.site_interactive_map_label,
    ).toBe("Interactive map");
    expect(
      getShellPresentationCopy("es").legacy.site_interactive_map_label,
    ).toBe("Mapa interactivo");
    expect(
      getShellPresentationCopy("he").legacy.site_interactive_map_label,
    ).toBe("מפה אינטראקטיבית");

    expect(
      getShellPresentationCopy("en").legacy.assistant_input_placeholder,
    ).toBe("Type your question...");
    expect(getShellPresentationCopy("es").legacy.navigation_stop).toBe(
      "Detener navegación",
    );
    expect(
      getShellPresentationCopy("he").legacy.map_loading_morro_digital,
    ).toBe("טוען את Morro Digital...");
  });

  it("localizes the V2-only shell accessibility additions without changing language values", () => {
    expect(getShellPresentationCopy("en").mapRegionLabel).toBe(
      "Interactive map of Morro de São Paulo",
    );
    expect(getShellPresentationCopy("es").voiceAutomatic).toBe("Automática");
    expect(getShellPresentationCopy("he").voiceDefaultSuffix).toBe(
      "ברירת מחדל",
    );
  });
});
