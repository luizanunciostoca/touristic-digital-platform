import { describe, expect, it } from "vitest";
import { resolveAssistantV1Photos } from "./assistant-v1-photo-catalog.js";

describe("resolveAssistantV1Photos", () => {
  it("preserves exact V1 photo lookup", () => {
    expect(resolveAssistantV1Photos("Segunda Praia")).toEqual({
      place: "Segunda Praia",
      images: [
        "/images/fotos/segunda_praia1.jpg",
        "/images/fotos/segunda_praia2.jpg",
        "/images/fotos/segunda_praia3.jpg",
      ],
    });
  });

  it("normalizes accents and punctuation", () => {
    expect(resolveAssistantV1Photos("praia do porto")?.place).toBe("Praia do Pôrto");
  });

  it("preserves V1 aliases", () => {
    expect(resolveAssistantV1Photos("toca")?.place).toBe("Toca do Morcego Festas");
    expect(resolveAssistantV1Photos("quarta")?.place).toBe("Quarta Praia");
  });

  it("preserves partial matching before aliases and word similarity", () => {
    expect(resolveAssistantV1Photos("farol do morro bahia")?.place).toBe("Farol do Morro");
  });

  it("returns null instead of inventing photos", () => {
    expect(resolveAssistantV1Photos("Lugar inexistente xyz")).toBeNull();
  });
});
