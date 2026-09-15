import { describe, expect, it } from "vitest";

import {
  processNavigationInstructionText,
  simplifyNavigationInstructionText,
} from "./instruction-text.js";

describe("navigation instruction text processing", () => {
  it("removes provider markup and normalizes Portuguese whitespace", () => {
    expect(
      processNavigationInstructionText(
        "  <b>Vire à direita</b>&nbsp; na Rua da Fonte  ,  depois continue  ",
      ),
    ).toBe("Vire à direita na Rua da Fonte, depois continue");
  });

  it("preserves meaningful English instruction content", () => {
    expect(
      processNavigationInstructionText(
        "<span>Turn left</span> onto Church Street &amp; continue",
      ),
    ).toBe("Turn left onto Church Street & continue");
  });

  it("preserves meaningful Spanish instruction content", () => {
    expect(
      processNavigationInstructionText(
        "  Gira a la izquierda&nbsp; y continúa hacia la playa  ",
      ),
    ).toBe("Gira a la izquierda y continúa hacia la playa");
  });

  it("removes bidi control noise without changing Hebrew text", () => {
    expect(
      processNavigationInstructionText("\u200fפנה ימינה\u200e  והמשך ישר"),
    ).toBe("פנה ימינה והמשך ישר");
  });

  it("falls back safely for empty or non-string provider values", () => {
    expect(processNavigationInstructionText("   ")).toBe("Continue pela rota");
    expect(processNavigationInstructionText(null, "Continue")).toBe("Continue");
  });
});

describe("V1 source-exact semantic navigation presentation", () => {
  it("maps canonical ORS numeric maneuver types in Portuguese", () => {
    expect(simplifyNavigationInstructionText("raw", 0, "pt")).toBe(
      "Siga em frente",
    );
    expect(simplifyNavigationInstructionText("raw", 3, "pt")).toBe(
      "Vire à direita",
    );
    expect(simplifyNavigationInstructionText("raw", 7, "pt")).toBe(
      "Vire à esquerda",
    );
    expect(simplifyNavigationInstructionText("raw", 9, "pt")).toBe(
      "Mantenha-se à esquerda",
    );
    expect(simplifyNavigationInstructionText("raw", 10, "pt")).toBe(
      "Você chegou ao destino!",
    );
  });

  it("supports the V1 compatible string maneuver names", () => {
    expect(
      simplifyNavigationInstructionText(
        "provider text",
        "turn-sharp-left",
        "en",
      ),
    ).toBe("Turn sharp left");
    expect(
      simplifyNavigationInstructionText("provider text", "keep-right", "es"),
    ).toBe("Mantente a la derecha");
    expect(
      simplifyNavigationInstructionText("provider text", "uturn", "he"),
    ).toBe("עשה פנייה בניידה");
  });

  it("uses the same English text fallback order as V1 when type is unknown", () => {
    expect(
      simplifyNavigationInstructionText(
        "Turn slight left onto Main Street",
        null,
        "pt",
      ),
    ).toBe("Faça uma leve curva à esquerda");
    expect(
      simplifyNavigationInstructionText(
        "Arrive at your destination",
        null,
        "es",
      ),
    ).toBe("¡Has llegado a tu destino!");
  });

  it("preserves the canonical V1 missing slight-right translation fallback", () => {
    expect(simplifyNavigationInstructionText("raw", 2, "pt")).toBe(
      "Slight right",
    );
    expect(simplifyNavigationInstructionText("raw", 2, "he")).toBe(
      "Slight right",
    );
  });
});
