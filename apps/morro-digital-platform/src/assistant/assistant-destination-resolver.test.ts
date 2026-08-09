import { describe, expect, it } from "vitest";

import {
  morroAssistantDestinationCatalog,
  resolveMorroAssistantDestination,
} from "./assistant-destination-resolver.js";

describe("Morro assistant destination resolver", () => {
  it("resolves canonical V1 beach aliases", () => {
    expect(resolveMorroAssistantDestination("praia 2")).toEqual({
      name: "Segunda Praia",
      latitude: -13.3800508,
      longitude: -38.9118443,
      category: "beaches",
    });
  });

  it("normalizes accents and resolves V1 attraction aliases", () => {
    expect(
      resolveMorroAssistantDestination("Farol de Morro de São Paulo"),
    ).toEqual({
      name: "Farol do Morro",
      latitude: -13.375917,
      longitude: -38.9153479,
      category: "attractions",
    });
  });

  it("resolves Toca do Morcego with the frozen V1 coordinate", () => {
    expect(resolveMorroAssistantDestination("toca")).toEqual({
      name: "Toca do Morcego",
      latitude: -13.3766787,
      longitude: -38.9172057,
      category: "nightlife",
    });
  });

  it("does not guess an unknown destination", () => {
    expect(resolveMorroAssistantDestination("destino inventado")).toBeNull();
  });

  it("keeps the M14 navigation catalog intentionally finite and auditable", () => {
    expect(morroAssistantDestinationCatalog).toHaveLength(10);
  });
});
