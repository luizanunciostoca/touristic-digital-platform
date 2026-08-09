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

  it("resolves the Tapirandu fortress with the frozen V1 coordinate", () => {
    expect(resolveMorroAssistantDestination("forte de tapirandu")).toEqual({
      name: "Fortaleza de Morro de São Paulo",
      latitude: -13.3742327,
      longitude: -38.9159466,
      category: "attractions",
    });
  });

  it("covers V1 tour destinations outside Morro proper", () => {
    expect(resolveMorroAssistantDestination("piscinas de moreré")).toEqual({
      name: "Piscinas Naturais de Moreré",
      latitude: -13.5815787,
      longitude: -38.9859057,
      category: "attractions",
    });
    expect(resolveMorroAssistantDestination("cairu sede")).toEqual({
      name: "Cairu",
      latitude: -13.471562,
      longitude: -39.043215,
      category: "attractions",
    });
  });

  it("covers the V1 Gamboa trail destinations", () => {
    expect(resolveMorroAssistantDestination("banho de argila")).toEqual({
      name: "Paredão de Argila",
      latitude: -13.388765,
      longitude: -38.934567,
      category: "attractions",
    });
    expect(resolveMorroAssistantDestination("porto de cima")).toEqual({
      name: "Praia do Porto de Cima",
      latitude: -13.378912,
      longitude: -38.924567,
      category: "beaches",
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

  it("keeps the M15 navigation catalog finite and auditable", () => {
    expect(morroAssistantDestinationCatalog).toHaveLength(22);
  });
});
