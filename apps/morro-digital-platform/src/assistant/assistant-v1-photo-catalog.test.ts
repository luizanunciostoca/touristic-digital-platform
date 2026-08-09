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
    expect(resolveAssistantV1Photos("praia do porto")?.place).toBe(
      "Praia do Pôrto",
    );
  });

  it("preserves V1 aliases", () => {
    expect(resolveAssistantV1Photos("toca")?.place).toBe("Toca do Morcego");
    expect(resolveAssistantV1Photos("mirante")?.place).toBe(
      "Mirante da Tirolesa",
    );
    expect(resolveAssistantV1Photos("quarta")?.place).toBe("Quarta Praia");
  });

  it("preserves partial matching before aliases and word similarity", () => {
    expect(resolveAssistantV1Photos("farol do morro bahia")?.place).toBe(
      "Farol do Morro",
    );
  });

  it("ports representative restaurant, hotel, shop and emergency entries", () => {
    expect(resolveAssistantV1Photos("Café das Artes")?.images[0]).toBe(
      "/images/fotos/cafe_das_artes1.jpg",
    );
    expect(resolveAssistantV1Photos("Hotel Anima")?.images[2]).toBe(
      "/images/fotos/hotel_anima3.jpg",
    );
    expect(resolveAssistantV1Photos("Havaianas")?.images[1]).toBe(
      "/images/fotos/havaianas2.jpg",
    );
    expect(resolveAssistantV1Photos("Polícia Militar")?.images[0]).toBe(
      "/images/fotos/policia_militar1.jpg",
    );
  });

  it("returns null instead of inventing photos", () => {
    expect(resolveAssistantV1Photos("Lugar inexistente xyz")).toBeNull();
  });
});
