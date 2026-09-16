from pathlib import Path

adapter = Path("apps/morro-digital-platform/src/assistant/assistant-v1-residual-command-adapter.ts")
test = Path("apps/morro-digital-platform/src/assistant/assistant-v1-residual-command-adapter.test.ts")


def one(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


a = adapter.read_text(encoding="utf-8")
a = one(
    a,
    '    "transporte",\n    "barco para",\n    "acesso a",',
    '    "transporte",\n    "lancha",\n    "catamarao",\n    "catamara",\n    "ferry",\n    "barco para",\n    "aviao",\n    "onibus",\n    "uber",\n    "taxi",\n    "transfer",\n    "acesso a",',
    "transport exclusions",
)
a = one(
    a,
    '      "modo satelite",\n      "visao satelite",\n      "satellite",',
    '      "modo satelite",\n      "visao satelite",\n      "satelite",\n      "satellite",',
    "satellite alias",
)
a = one(
    a,
    '      "mapa outdoor",\n      "topografico",',
    '      "mapa outdoor",\n      "trilhas",\n      "topografico",',
    "outdoor trails alias",
)
a = one(
    a,
    '      "mostrar todos os locais",\n      "todos os locais",\n      "remover filtro",',
    '      "mostrar todos os locais",\n      "mostrar todos",\n      "ver todos",\n      "todos os locais",\n      "remover filtro",',
    "show all pt aliases",
)
a = one(
    a,
    '      "limpar filtro",\n      "show all locations",',
    '      "limpar filtro",\n      "restaurar",\n      "show all",\n      "show all locations",',
    "show all restore aliases",
)
a = one(
    a,
    '    return mapResponse(`🔍 Zoom ${target.toFixed(0)}.`, language, "map_zoom");',
    '    return mapResponse(\n      `🔍 Zoom ajustado para ${target.toFixed(0)}.`,\n      language,\n      "map_zoom",\n    );',
    "zoom V1 copy",
)
adapter.write_text(a, encoding="utf-8")

t = test.read_text(encoding="utf-8")
t = one(
    t,
    '    ["modo satélite", { type: "map_style", style: "satellite" }],\n    ["mapa escuro",',
    '    ["modo satélite", { type: "map_style", style: "satellite" }],\n    ["satélite", { type: "map_style", style: "satellite" }],\n    ["mapa escuro",',
    "satellite test",
)
t = one(
    t,
    '    ["mapa outdoor", { type: "map_style", style: "outdoor" }],\n    ["mostrar só praias",',
    '    ["mapa outdoor", { type: "map_style", style: "outdoor" }],\n    ["trilhas", { type: "map_style", style: "outdoor" }],\n    ["mostrar só praias",',
    "trails test",
)
t = one(
    t,
    '    ["mostrar todos os locais", { type: "map_show_all" }],\n    ["aproximar",',
    '    ["mostrar todos os locais", { type: "map_show_all" }],\n    ["mostrar todos", { type: "map_show_all" }],\n    ["ver todos", { type: "map_show_all" }],\n    ["show all", { type: "map_show_all" }],\n    ["restaurar", { type: "map_show_all" }],\n    ["aproximar",',
    "show all tests",
)
t = one(
    t,
    '    expect(map.getZoom?.()).toBe(15);\n\n    await executeAssistantV1ResidualCommand({',
    '    expect(map.getZoom?.()).toBe(15);\n    const zoomResponse = await executeAssistantV1ResidualCommand({\n      command: { type: "map_zoom", direction: "out" },\n      language: "pt",\n      history: [],\n      map,\n    });\n    expect(zoomResponse.text).toBe("🔍 Zoom ajustado para 13.");\n\n    await executeAssistantV1ResidualCommand({',
    "zoom copy test",
)
t = one(
    t,
    '    expect(\n      resolveAssistantV1ResidualCommand("como ir de barco para Valença"),\n    ).toBeNull();',
    '    expect(\n      resolveAssistantV1ResidualCommand("como ir de barco para Valença"),\n    ).toBeNull();\n    expect(resolveAssistantV1ResidualCommand("lancha para Valença")).toBeNull();\n    expect(resolveAssistantV1ResidualCommand("transfer para Salvador")).toBeNull();',
    "transport exclusions tests",
)
test.write_text(t, encoding="utf-8")
