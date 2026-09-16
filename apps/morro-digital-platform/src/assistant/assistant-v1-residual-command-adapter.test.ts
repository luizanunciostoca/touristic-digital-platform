import { describe, expect, it, vi } from "vitest";

import {
  executeAssistantV1ResidualCommand,
  formatAssistantV1History,
  resolveAssistantV1ResidualCommand,
  type AssistantV1MapCommandMap,
} from "./assistant-v1-residual-command-adapter.js";

type FlyToOptions = Parameters<
  NonNullable<AssistantV1MapCommandMap["flyTo"]>
>[0];

function fakeMap() {
  let zoom = 13;
  let center = { lng: -38.9145, lat: -13.382 };
  const map: AssistantV1MapCommandMap = {
    getZoom: () => zoom,
    getCenter: () => center,
    getPitch: () => 35,
    getBearing: () => 0,
    setZoom: vi.fn((value: number) => {
      zoom = value;
    }),
    setCenter: vi.fn((value: [number, number]) => {
      center = { lng: value[0], lat: value[1] };
    }),
    flyTo: vi.fn((options: FlyToOptions) => {
      if (typeof options.zoom === "number") zoom = options.zoom;
      if (options.center)
        center = { lng: options.center[0], lat: options.center[1] };
    }),
    setStyle: vi.fn(),
    once: vi.fn((_event: string, listener: () => void) => listener()),
  };
  return map;
}

describe("V1 residual assistant commands", () => {
  it.each(["histórico", "historico", "meu histórico"])(
    "resolves the legacy history command %s deterministically",
    (input) => {
      expect(resolveAssistantV1ResidualCommand(input)).toEqual({
        type: "history",
      });
    },
  );

  it("formats empty and recent history with V1 localized copy", () => {
    expect(formatAssistantV1History([], "pt")).toBe(
      "Seu histórico está vazio. Gostaria de começar uma nova busca?",
    );
    expect(
      formatAssistantV1History(
        Array.from({ length: 6 }, (_, index) => ({
          input: `pergunta ${index + 1}`,
          response: `resposta ${index + 1}`,
          timestamp: index,
        })),
        "en",
      ),
    ).toBe(
      [
        "Your recent history:",
        "You: pergunta 2\nAssistant: resposta 2",
        "",
        "You: pergunta 3\nAssistant: resposta 3",
        "",
        "You: pergunta 4\nAssistant: resposta 4",
        "",
        "You: pergunta 5\nAssistant: resposta 5",
        "",
        "You: pergunta 6\nAssistant: resposta 6",
        "Would you like to know more about any of these places?",
      ].join("\n"),
    );
  });

  it.each([
    ["modo satélite", { type: "map_style", style: "satellite" }],
    ["mapa escuro", { type: "map_style", style: "dark" }],
    ["modo normal", { type: "map_style", style: "default" }],
    ["mapa outdoor", { type: "map_style", style: "outdoor" }],
    ["mostrar só praias", { type: "map_filter_category", category: "beaches" }],
    ["mostrar todos os locais", { type: "map_show_all" }],
    ["aproximar", { type: "map_zoom", direction: "in" }],
    ["afastar", { type: "map_zoom", direction: "out" }],
    ["visão geral", { type: "map_overview" }],
  ])("resolves %s", (input, expected) => {
    expect(resolveAssistantV1ResidualCommand(input)).toEqual(expected);
  });

  it("resolves a canonical catalog place for map focus", () => {
    const command = resolveAssistantV1ResidualCommand(
      "mostrar no mapa Primeira Praia",
    );
    expect(command?.type).toBe("map_focus_place");
    if (command?.type !== "map_focus_place") return;
    expect(command.place.name).toBe("Primeira Praia");
  });

  it("does not steal transport/access questions from the assistant", () => {
    expect(
      resolveAssistantV1ResidualCommand("como chegar à Segunda Praia"),
    ).toBeNull();
    expect(
      resolveAssistantV1ResidualCommand("como ir de barco para Valença"),
    ).toBeNull();
  });

  it("executes style changes while preserving camera state", async () => {
    const map = fakeMap();
    const response = await executeAssistantV1ResidualCommand({
      command: { type: "map_style", style: "satellite" },
      language: "pt",
      history: [],
      map,
      defaultMapStyle: "mapbox://styles/example/custom",
    });

    expect(map.setStyle).toHaveBeenCalledWith(
      "mapbox://styles/mapbox/satellite-streets-v12",
    );
    expect(map.flyTo).toHaveBeenCalledWith(
      expect.objectContaining({
        center: [-38.9145, -13.382],
        zoom: 13,
        pitch: 35,
        bearing: 0,
      }),
    );
    expect(response.metadata).toMatchObject({
      domain: "v1_map_command",
      action: "map_style",
      state: "resolved",
    });
  });

  it("blocks camera/style changes while navigation is active", async () => {
    const map = fakeMap();
    const response = await executeAssistantV1ResidualCommand({
      command: { type: "map_zoom", direction: "in" },
      language: "pt",
      history: [],
      map,
      navigationActive: true,
    });
    expect(map.flyTo).not.toHaveBeenCalled();
    expect(map.setZoom).not.toHaveBeenCalled();
    expect(response.metadata?.state).toBe("blocked");
  });

  it("routes category filters and restore-all through Explore map-only commands", async () => {
    const execute = vi.fn(async () => true);
    await executeAssistantV1ResidualCommand({
      command: { type: "map_filter_category", category: "beaches" },
      language: "pt",
      history: [],
      explore: { execute },
    });
    await executeAssistantV1ResidualCommand({
      command: { type: "map_show_all" },
      language: "pt",
      history: [],
      explore: { execute },
    });
    expect(execute).toHaveBeenNthCalledWith(1, {
      type: "map_filter_category",
      category: "beaches",
    });
    expect(execute).toHaveBeenNthCalledWith(2, {
      type: "show_all_locations",
    });
  });

  it("zooms, frames Morro, and focuses a place through the native map", async () => {
    const map = fakeMap();
    await executeAssistantV1ResidualCommand({
      command: { type: "map_zoom", direction: "in" },
      language: "pt",
      history: [],
      map,
    });
    expect(map.getZoom?.()).toBe(15);

    await executeAssistantV1ResidualCommand({
      command: { type: "map_overview" },
      language: "pt",
      history: [],
      map,
    });
    expect(map.flyTo).toHaveBeenCalledWith(
      expect.objectContaining({ center: [-38.9145, -13.382], zoom: 14 }),
    );

    const focus = resolveAssistantV1ResidualCommand(
      "mostrar no mapa Primeira Praia",
    );
    expect(focus?.type).toBe("map_focus_place");
    if (focus?.type !== "map_focus_place") return;
    await executeAssistantV1ResidualCommand({
      command: focus,
      language: "pt",
      history: [],
      map,
    });
    expect(map.flyTo).toHaveBeenLastCalledWith(
      expect.objectContaining({
        center: [focus.place.longitude, focus.place.latitude],
        zoom: 17,
      }),
    );
  });
});
