import { describe, expect, it } from "vitest";
import { ASSISTANT_MAIN_MENU, getAssistantMainMenu } from "./menu";

describe("assistant canonical menu", () => {
  it("keeps the ten canonical V1 semantic values in order", () => {
    expect(ASSISTANT_MAIN_MENU.map(({ value }) => value)).toEqual([
      "beaches",
      "restaurants",
      "hotels",
      "shops",
      "transport",
      "attractions",
      "tours",
      "nightlife",
      "emergencies",
      "help",
    ]);
  });

  it("returns the V1 labels for every supported locale", () => {
    expect(getAssistantMainMenu("pt").map(({ label }) => label)).toEqual([
      "Praias",
      "Restaurantes",
      "Pousadas",
      "Lojas",
      "Transporte",
      "Atrações",
      "Passeios",
      "Vida Noturna",
      "Emergências",
      "Ajuda",
    ]);
    expect(getAssistantMainMenu("en")[0]?.label).toBe("Beaches");
    expect(getAssistantMainMenu("es")[0]?.label).toBe("Playas");
    expect(getAssistantMainMenu("he")[0]?.label).toBe("חופים");
  });
});
