import { describe, expect, it } from "vitest";
import {
  formatRuntimeStatus,
  localizedTourStopLabel,
  runtimeAccessibilityLocale,
} from "./runtime-accessibility-i18n.js";

describe("runtime accessibility i18n", () => {
  it("normalizes the four supported presentation languages and aliases", () => {
    expect(runtimeAccessibilityLocale("pt-BR")).toBe("pt-BR");
    expect(runtimeAccessibilityLocale("pt-PT")).toBe("pt-BR");
    expect(runtimeAccessibilityLocale("en-US")).toBe("en");
    expect(runtimeAccessibilityLocale("es-AR")).toBe("es");
    expect(runtimeAccessibilityLocale("he-IL")).toBe("he");
    expect(runtimeAccessibilityLocale("iw-IL")).toBe("he");
  });

  it("localizes runtime-ready accessibility status without changing technical identifiers", () => {
    const state = {
      kind: "runtime-ready" as const,
      modules: ["map", "assistant"],
      providerId: "mapbox",
    };

    expect(formatRuntimeStatus(state, "pt-BR")).toBe(
      "Runtime ativo: map, assistant — provider mapbox — Home pronta para explorar.",
    );
    expect(formatRuntimeStatus(state, "en")).toBe(
      "Runtime active: map, assistant — provider mapbox — Home is ready to explore.",
    );
    expect(formatRuntimeStatus(state, "es")).toBe(
      "Runtime activo: map, assistant — proveedor mapbox — Inicio listo para explorar.",
    );
    expect(formatRuntimeStatus(state, "he")).toBe(
      "המערכת פעילה: map, assistant — ספק mapbox — דף הבית מוכן לחקירה.",
    );
  });

  it("localizes tour-ready status with the frozen V1 tour title", () => {
    const state = {
      kind: "tour-ready" as const,
      tourId: "volta-a-ilha",
      markerCount: 8,
    };

    expect(formatRuntimeStatus(state, "pt-BR")).toContain(
      "Passeio Volta à Ilha",
    );
    expect(formatRuntimeStatus(state, "en")).toContain("Island Round Trip");
    expect(formatRuntimeStatus(state, "es")).toContain("Vuelta a la Isla");
    expect(formatRuntimeStatus(state, "he")).toContain("סיבוב האי");
  });

  it("localizes V2-only loading and error wrappers", () => {
    expect(formatRuntimeStatus({ kind: "tour-switching" }, "en")).toBe(
      "Updating the tour displayed on the map…",
    );
    expect(
      formatRuntimeStatus(
        { kind: "map-fallback", mode: "using", detail: "network" },
        "es",
      ),
    ).toBe("Mapbox no disponible; usando el fallback de V1: network");
    expect(formatRuntimeStatus({ kind: "tour-error" }, "he")).toContain(
      "לא ניתן להחליף את המסלול",
    );
    expect(formatRuntimeStatus({ kind: "runtime-error" }, "en")).toContain(
      "Could not start Morro Digital",
    );
  });

  it("returns localized accessible tour-stop labels", () => {
    expect(localizedTourStopLabel("volta-a-ilha", "stop-1", "pt-BR")).toBe(
      "Partida: Terceira Praia",
    );
    expect(localizedTourStopLabel("volta-a-ilha", "stop-1", "en")).toBe(
      "Departure: Terceira Praia",
    );
    expect(localizedTourStopLabel("volta-a-ilha", "stop-1", "es")).toBe(
      "Salida: Terceira Praia",
    );
    expect(localizedTourStopLabel("volta-a-ilha", "stop-1", "he")).toBe(
      "יציאה: Terceira Praia",
    );
  });
});
