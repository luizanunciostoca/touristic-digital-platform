import { describe, expect, it } from "vitest";

import {
  ASSISTANT_MAIN_MENU,
  CANONICAL_CATEGORY_LABELS,
  CANONICAL_CATEGORY_ORDER,
  getAssistantMainMenu,
} from "./menu.js";

describe("canonical assistant categories", () => {
  it("keeps category order and PT-BR labels in one authority", () => {
    expect(CANONICAL_CATEGORY_ORDER).toEqual([
      "beaches",
      "tours",
      "attractions",
      "restaurants",
      "hotels",
      "nightlife",
      "shops",
      "transport",
      "emergencies",
      "help",
    ]);

    expect(getAssistantMainMenu("pt")).toEqual([
      { value: "beaches", label: "Praias" },
      { value: "tours", label: "Passeios" },
      { value: "attractions", label: "Atrações" },
      { value: "restaurants", label: "Restaurantes" },
      { value: "hotels", label: "Pousadas" },
      { value: "nightlife", label: "Vida Noturna" },
      { value: "shops", label: "Lojas" },
      { value: "transport", label: "Transporte" },
      { value: "emergencies", label: "Emergências" },
      { value: "help", label: "Ajuda" },
    ]);

    expect(ASSISTANT_MAIN_MENU).toHaveLength(CANONICAL_CATEGORY_ORDER.length);
    expect(Object.keys(CANONICAL_CATEGORY_LABELS)).toEqual([
      ...CANONICAL_CATEGORY_ORDER,
    ]);
  });

  it("keeps translations attached to the same canonical values", () => {
    expect(getAssistantMainMenu("en")[1]).toEqual({
      value: "tours",
      label: "Tours",
    });
    expect(getAssistantMainMenu("es")[4]).toEqual({
      value: "hotels",
      label: "Hoteles",
    });
    expect(getAssistantMainMenu("he")[0]?.label).toBe("חופים");
  });
});
