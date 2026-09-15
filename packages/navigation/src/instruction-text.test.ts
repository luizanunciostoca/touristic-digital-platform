import { describe, expect, it } from "vitest";

import { processNavigationInstructionText } from "./instruction-text.js";

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
