import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  ASSISTANT_CONTEXTUAL_STATE_MATRIX,
  normalizeAssistantContextualLanguage,
  resolveAssistantContextualCategoryLabel,
  resolveAssistantContextualCopy,
  resolveExploreContextualState,
  type AssistantContextualState,
} from "./assistant-contextual-state.js";

const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));

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

  it("localizes contextual copy and canonical category labels", () => {
    expect(normalizeAssistantContextualLanguage("pt-BR")).toBe("pt");
    expect(normalizeAssistantContextualLanguage("en-US")).toBe("en");
    expect(normalizeAssistantContextualLanguage("es")).toBe("es");
    expect(normalizeAssistantContextualLanguage("he-IL")).toBe("he");

    expect(resolveAssistantContextualCategoryLabel("beaches", "pt")).toBe(
      "Praias",
    );
    expect(resolveAssistantContextualCategoryLabel("beaches", "en")).toBe(
      "Beaches",
    );
    expect(resolveAssistantContextualCategoryLabel("nightlife", "es")).toBe(
      "Vida nocturna",
    );

    expect(
      resolveAssistantContextualCopy(
        "category_selected",
        { category: "Beaches" },
        "en",
      ).message,
    ).toContain("Selected category: Beaches");
    expect(
      resolveAssistantContextualCopy(
        "results_found",
        { count: 3 },
        "es",
      ).message,
    ).toContain("3");
  });

  it("interpolates bounded contextual values without executable markup", () => {
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

  it("projects Explore context into the canonical presenter, including rich surfaces", async () => {
    const runtime = await readFile(
      `${repositoryRoot}apps/morro-digital-platform/src/assistant/browser-assistant-runtime.ts`,
      "utf8",
    );

    expect(runtime).toContain("resolveExploreContextualState");
    expect(runtime).toContain("resolveAssistantContextualCategoryLabel");
    expect(runtime).toContain("normalizeAssistantContextualLanguage");
    expect(runtime).toContain("syncExploreContextualMessage");
    expect(runtime).toContain("syncExplorePresentation");
    expect(runtime).toContain("md-assistant-contextual-copy");
    expect(runtime).toContain("canonicalMessage.appendChild(contextualCopy)");
    expect(runtime).toContain("canonicalMessage.dataset.contextualVoiceCopy");
    expect(runtime).toContain("canonicalMessage.dataset.contextualCta");
    expect(runtime).toContain(
      "const onExploreStateChanged = (): void => syncExplorePresentation();",
    );
    expect(runtime).toContain(
      "queueMicrotask(() => syncExplorePresentation(placeHint));",
    );
  });

  it("keeps navigation context on its dedicated surface and leaves completion feedback canonical", async () => {
    const contextual = await readFile(
      `${repositoryRoot}apps/morro-digital-platform/src/assistant/assistant-contextual-state.ts`,
      "utf8",
    );
    const feedback = await readFile(
      `${repositoryRoot}apps/morro-digital-platform/src/assistant/assistant-navigation-feedback.ts`,
      "utf8",
    );

    expect(contextual).toContain("assistant-navigation-contextual-state");
    expect(contextual).toContain('area === "navigation"');
    expect(contextual).toContain('publish("provider_error", {}, "navigation")');
    expect(contextual).toContain("options.messages.removeById");
    expect(contextual).toContain(
      "Completion feedback has a dedicated canonical presenter",
    );
    expect(contextual).not.toContain(
      'publish(detail?.reason === "arrived" ? "arrival" : "cancelled"',
    );
    expect(feedback).toContain("destinationFromCurrentSurface");
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
    expect(resolveExploreContextualState({ ...base, stage: "menu" })).toBeNull();
  });
});
