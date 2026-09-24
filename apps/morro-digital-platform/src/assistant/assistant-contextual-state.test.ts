import { describe, expect, it } from "vitest";

import {
  ASSISTANT_CONTEXTUAL_STATE_MATRIX,
  resolveAssistantContextualCopy,
  resolveExploreContextualState,
  type AssistantContextualState,
} from "./assistant-contextual-state.js";

const REQUIRED_STATES: readonly AssistantContextualState[] = [
  "start",
  "welcome",
  "category_selected",
  "filter_selected",
  "results_found",
  "no_results",
  "place_selected",
  "action_available",
  "navigation_starting",
  "navigation_active",
  "arrival",
  "book_tour",
  "book_table",
  "buy_ticket",
  "payment_started",
  "payment_approved",
  "payment_declined",
  "timeout",
  "offline",
  "provider_error",
  "return",
  "back",
  "cancelled",
  "geolocation_allowed",
  "geolocation_denied",
];

describe("assistant contextual state messaging", () => {
  it("covers every required state with message, fallback and voice copy", () => {
    expect(Object.keys(ASSISTANT_CONTEXTUAL_STATE_MATRIX)).toEqual(
      REQUIRED_STATES,
    );

    for (const state of REQUIRED_STATES) {
      const copy = ASSISTANT_CONTEXTUAL_STATE_MATRIX[state];
      expect(copy.message.trim().length).toBeGreaterThan(0);
      expect(copy.errorFallback.trim().length).toBeGreaterThan(0);
      expect(copy.voiceCopy.trim().length).toBeGreaterThan(0);
    }
  });

  it("interpolates bounded contextual values", () => {
    expect(
      resolveAssistantContextualCopy("category_selected", {
        category: "Praias",
      }).message,
    ).toContain("Praias");

    expect(
      resolveAssistantContextualCopy("results_found", { count: 7 }).message,
    ).toContain("7");

    expect(
      resolveAssistantContextualCopy("place_selected", {
        place: "<script>alert(1)</script>",
      }).message,
    ).toContain("<script>");
  });

  it("maps Explore stages to coherent contextual states", () => {
    const base = {
      category: "beaches",
      place: null,
      markerCount: 0,
      tour: null,
    } as const;

    expect(resolveExploreContextualState({ ...base, stage: "filters" })).toBe(
      "category_selected",
    );
    expect(
      resolveExploreContextualState({
        ...base,
        stage: "places",
        markerCount: 4,
      }),
    ).toBe("results_found");
    expect(
      resolveExploreContextualState({
        ...base,
        stage: "places",
        markerCount: 0,
      }),
    ).toBe("no_results");
    expect(
      resolveExploreContextualState({
        ...base,
        stage: "detail",
        place: "Segunda Praia",
      }),
    ).toBe("place_selected");
    expect(
      resolveExploreContextualState({ ...base, stage: "menu" }),
    ).toBeNull();
  });
});
