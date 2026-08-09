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

  it("covers audited V1 restaurants", () => {
    expect(resolveMorroAssistantDestination("restaurante basilico")).toEqual({
      name: "Basílico",
      latitude: -13.3784237,
      longitude: -38.9168768,
      category: "restaurants",
    });
    expect(resolveMorroAssistantDestination("restaurante papoula")).toEqual({
      name: "Papoula",
      latitude: -13.3800138,
      longitude: -38.9176327,
      category: "restaurants",
    });
  });

  it("covers audited V1 nightlife and hotels", () => {
    expect(resolveMorroAssistantDestination("pulsar morro")).toEqual({
      name: "Pulsar",
      latitude: -13.3766136,
      longitude: -38.9179001,
      category: "nightlife",
    });
    expect(resolveMorroAssistantDestination("hotel portalo")).toEqual({
      name: "Portaló",
      latitude: -13.3775523,
      longitude: -38.9175756,
      category: "hotels",
    });
  });

  it("covers audited V1 emergency destinations", () => {
    expect(resolveMorroAssistantDestination("posto de saúde")).toEqual({
      name: "Posto Medico 24hs",
      latitude: -13.37733,
      longitude: -38.9171671,
      category: "emergency",
    });
    expect(resolveMorroAssistantDestination("pmba")).toEqual({
      name: "Polícia Militar",
      latitude: -13.3775926,
      longitude: -38.9150414,
      category: "emergency",
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

  it("keeps the M16 navigation catalog finite and auditable", () => {
    expect(morroAssistantDestinationCatalog).toHaveLength(34);
  });
});
