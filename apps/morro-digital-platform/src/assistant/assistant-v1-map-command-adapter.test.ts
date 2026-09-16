import { describe, expect, it, vi } from "vitest";

import {
  executeAssistantV1MapCommand,
  resolveAssistantV1MapCommand,
} from "./assistant-v1-map-command-adapter.js";

describe("V1 map command parity", () => {
  it("preserves V1 transport-question non interception", () => {
    expect(
      resolveAssistantV1MapCommand("como chegar na Segunda Praia"),
    ).toBeNull();
    expect(resolveAssistantV1MapCommand("filtrar transporte")).toBeNull();
  });

  it.each([
    ["modo satélite", { type: "style", style: "satellite" }],
    ["mapa escuro", { type: "style", style: "dark" }],
    ["modo normal", { type: "style", style: "default" }],
    ["mapa outdoor", { type: "style", style: "outdoor" }],
    ["filtrar praias", { type: "filter", category: "beaches" }],
    ["filtrar buggy", { type: "filter", category: "transport" }],
    ["mostrar todos", { type: "show_all" }],
    ["zoom in", { type: "zoom", direction: "in" }],
    ["zoom out", { type: "zoom", direction: "out" }],
    ["visão geral", { type: "overview" }],
  ])("resolves %s", (input, expected) => {
    expect(resolveAssistantV1MapCommand(input)).toMatchObject(expected);
  });

  it("resolves catalog-backed place focus instead of stale hard-coded coordinates", () => {
    const command = resolveAssistantV1MapCommand(
      "mostrar no mapa Toca do Morcego",
    );
    expect(command?.type).toBe("focus");
    if (command?.type !== "focus") throw new Error("focus command expected");
    expect(command.place.name).toBe("Toca do Morcego");
    expect(command.place.latitude).toBeCloseTo(-13.3766787, 6);
    expect(command.zoom).toBe(17);
  });

  it("executes category filtering through the map-only Explore port", async () => {
    const showCategoryOnMap = vi.fn(async () => 8);
    const result = await executeAssistantV1MapCommand({
      input: "filtrar praias",
      language: "pt",
      explore: { showCategoryOnMap, showAllOnMap: vi.fn() },
    });
    expect(showCategoryOnMap).toHaveBeenCalledWith("beaches");
    expect(result?.text).toContain("Mostrando 8 praias");
    expect(result?.metadata?.domain).toBe("map_command");
  });

  it("preserves camera while changing style", async () => {
    let styleListener: (() => void) | undefined;
    const setStyle = vi.fn();
    const flyTo = vi.fn();
    const result = await executeAssistantV1MapCommand({
      input: "modo satélite",
      language: "en",
      map: {
        setCenter: vi.fn(),
        remove: vi.fn(),
        setStyle,
        getCenter: () => ({ lng: -38.9145, lat: -13.382 }),
        getZoom: () => 14,
        getPitch: () => 35,
        getBearing: () => 20,
        flyTo,
        once: (_event, listener) => {
          styleListener = listener;
        },
      },
    });
    expect(setStyle).toHaveBeenCalledWith(
      "mapbox://styles/mapbox/satellite-streets-v12",
    );
    styleListener?.();
    expect(flyTo).toHaveBeenCalledWith(
      expect.objectContaining({
        center: [-38.9145, -13.382],
        zoom: 14,
        pitch: 35,
        bearing: 20,
      }),
    );
    expect(result?.text).toContain("satellite mode");
  });

  it("executes overview and zoom with V1 limits", async () => {
    const flyTo = vi.fn();
    const map = {
      setCenter: vi.fn(),
      remove: vi.fn(),
      getZoom: () => 19,
      flyTo,
    };
    await executeAssistantV1MapCommand({ input: "zoom in", map });
    expect(flyTo).toHaveBeenCalledWith(expect.objectContaining({ zoom: 20 }));
    flyTo.mockClear();
    await executeAssistantV1MapCommand({ input: "visão geral", map });
    expect(flyTo).toHaveBeenCalledWith(
      expect.objectContaining({ center: [-38.9145, -13.382], zoom: 14 }),
    );
  });
});
