import { describe, expect, it } from "vitest";

import {
  analyzeAssistantIntent,
  extractAssistantEntities,
} from "./intent-engine.js";

describe("assistant category phrase boundaries", () => {
  it("does not classify barco as nightlife because it contains bar", () => {
    expect(extractAssistantEntities("barco").category).toBe("tours");
    expect(extractAssistantEntities("bar").category).toBe("nightlife");
  });

  it("keeps tour context for the V1 Volta à Ilha detail command", () => {
    const input = "Fale sobre Passeio de Barco Volta à Ilha";
    expect(extractAssistantEntities(input).category).toBe("tours");

    const result = analyzeAssistantIntent(input);
    expect(result.intent).toBe("more_info");
    expect(result.entities.category).toBe("tours");
  });

  it("prefers the exact selected place over a nested generic place name", () => {
    const result = analyzeAssistantIntent(
      "Fale sobre Píer de Morro de São Paulo",
      {
        lastPlace: "Píer de Morro de São Paulo",
        lastCategory: "transport",
      },
    );

    expect(result.intent).toBe("more_info");
    expect(result.entities.place).toBe("Píer de Morro de São Paulo");
  });
});
