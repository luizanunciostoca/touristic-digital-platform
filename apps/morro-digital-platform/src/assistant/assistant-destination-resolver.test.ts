import { describe, expect, it } from "vitest";

import {
  morroAssistantDestinationCatalog,
  resolveMorroAssistantDestination,
} from "./assistant-destination-resolver.js";

describe("Morro assistant destination catalog", () => {
  it("preserves the complete V1 locations.js projection", () => {
    expect(morroAssistantDestinationCatalog).toHaveLength(131);

    const counts = Object.fromEntries(
      [...new Set(morroAssistantDestinationCatalog.map((entry) => entry.category))].map(
        (category) => [
          category,
          morroAssistantDestinationCatalog.filter(
            (entry) => entry.category === category,
          ).length,
        ],
      ),
    );

    expect(counts).toEqual({
      beaches: 8,
      restaurants: 45,
      hotels: 35,
      shops: 12,
      transport: 8,
      attractions: 8,
      nightlife: 5,
      emergencies: 4,
      tours: 6,
    });
  });

  it("retains source order because V1 findPlace precedence depends on it", () => {
    expect(morroAssistantDestinationCatalog.slice(0, 3).map((entry) => entry.name)).toEqual([
      "Primeira Praia",
      "Praia de Garapuá",
      "Praia do Pôrto",
    ]);
    expect(morroAssistantDestinationCatalog.at(-1)?.name).toBe("Passeio de Caiaque");
  });

  it("resolves canonical beach aliases from the frozen source", () => {
    expect(resolveMorroAssistantDestination("praia 2")).toEqual({
      name: "Segunda Praia",
      latitude: -13.3800508,
      longitude: -38.9118443,
      category: "beaches",
    });
  });

  it("uses only aliases that exist in V1 locations.js", () => {
    expect(resolveMorroAssistantDestination("forte de tapirandu")).toEqual({
      name: "Fortaleza de Morro de São Paulo",
      latitude: -13.3742327,
      longitude: -38.9159466,
      category: "attractions",
    });
    expect(resolveMorroAssistantDestination("hotel portalo")).toEqual({
      name: "Portaló",
      latitude: -13.3775523,
      longitude: -38.9175756,
      category: "hotels",
    });
  });

  it("covers categories that were absent from the M16 subset", () => {
    expect(resolveMorroAssistantDestination("cassi")).toEqual({
      name: "Cassi Turismo",
      latitude: -13.3775,
      longitude: -38.9135,
      category: "transport",
    });
    expect(resolveMorroAssistantDestination("artesanato")).toEqual({
      name: "Loja Artesanato",
      latitude: -13.389,
      longitude: -38.923,
      category: "shops",
    });
    expect(resolveMorroAssistantDestination("caiaque")).toEqual({
      name: "Passeio de Caiaque",
      latitude: -13.3839443,
      longitude: -38.9084472,
      category: "tours",
    });
  });

  it("preserves duplicate canonical names across V1 categories and source precedence", () => {
    expect(resolveMorroAssistantDestination("toca")).toEqual({
      name: "Toca do Morcego",
      latitude: -13.3766787,
      longitude: -38.9172057,
      category: "attractions",
    });
    expect(resolveMorroAssistantDestination("farmacia")).toEqual({
      name: "Farmácia Morro de São Paulo",
      latitude: -13.3785,
      longitude: -38.917,
      category: "shops",
    });
  });

  it("uses the actual V1 emergency catalog rather than synthetic M16 entries", () => {
    expect(resolveMorroAssistantDestination("posto de saude")).toEqual({
      name: "Posto de Saúde de Morro de São Paulo",
      latitude: -13.3812,
      longitude: -38.9192,
      category: "emergencies",
    });
    expect(resolveMorroAssistantDestination("delegacia")).toEqual({
      name: "Delegacia de Polícia",
      latitude: -13.381,
      longitude: -38.919,
      category: "emergencies",
    });
  });

  it("does not guess an unknown destination", () => {
    expect(resolveMorroAssistantDestination("destino inventado xyz")).toBeNull();
  });
});
