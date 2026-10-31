import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";
import type { AssistantMessageInput } from "@touristic/assistant";
import type { AssistantExploreStateSnapshot } from "./assistant-menu-command-router.js";

import {
  ASSISTANT_CONTEXTUAL_STATE_MATRIX,
  installAssistantContextualMessaging,
  normalizeAssistantContextualLanguage,
  resolveAssistantContextualCategoryLabel,
  resolveAssistantContextualCopy,
  resolveExploreContextualState,
  resolveExploreLocationCount,
  type AssistantContextualState,
} from "./assistant-contextual-state.js";

afterEach(() => vi.unstubAllGlobals());

function navigationMessagingFixture() {
  class MessageNode {
    dataset: Record<string, string> = {};
  }
  vi.stubGlobal("HTMLElement", MessageNode);
  const nodes = new Map<string, MessageNode>();
  const visible = new Map<string, AssistantMessageInput>();
  const view = new EventTarget();
  const document = Object.assign(new EventTarget(), {
    documentElement: { lang: "pt-BR" },
    defaultView: view,
    getElementById: (id: string) => nodes.get(id) ?? null,
  }) as unknown as Document;
  const messages = {
    append: vi.fn((input: AssistantMessageInput) => {
      if (input.id) {
        nodes.set(input.id, new MessageNode());
        visible.set(input.id, input);
      }
      return null;
    }),
    removeById: vi.fn((id: string) => {
      nodes.delete(id);
      return visible.delete(id);
    }),
    clear: vi.fn(() => 0),
  };
  const messaging = installAssistantContextualMessaging({
    document,
    messages,
    readExploreState: () => ({
      stage: "menu",
      category: null,
      place: null,
      tour: null,
      markerCount: 0,
    }),
  });
  return {
    messaging,
    messages,
    visible,
    status(detail: Record<string, unknown>) {
      const event = new Event("navigationStatusChanged");
      Object.defineProperty(event, "detail", { value: detail });
      view.dispatchEvent(event);
    },
  };
}

const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));

const REQUIRED_STATES: readonly AssistantContextualState[] = [
  "category_selected",
  "results_found",
  "no_results",
  "place_selected",
  "action_available",
  "navigation_starting",
  "navigation_active",
  "payment_started",
  "payment_approved",
  "payment_declined",
  "timeout",
  "offline",
  "online_restored",
  "provider_error",
  "geolocation_allowed",
  "geolocation_denied",
];

describe("assistant contextual state messaging", () => {
  it("covers every runtime-produced contextual state with message, fallback and voice copy", () => {
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
    ).toContain("Beaches");
    expect(
      resolveAssistantContextualCopy("results_found", { count: 3 }, "es")
        .message,
    ).toContain("3");
    expect(
      resolveAssistantContextualCopy("provider_error", {}, "he").errorFallback,
    ).toContain("נסה שוב");
    expect(
      resolveAssistantContextualCopy("online_restored", {}, "pt").message,
    ).toContain("Conexão de volta");
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

  it.each([false, undefined])(
    "keeps terminal failure in the replaceable conversation when active is %s",
    (isActive) => {
      const f = navigationMessagingFixture();
      f.status({
        phase: "active",
        isActive: true,
        destination: "Segunda Praia",
      });
      f.status({ phase: "failed", isActive });

      expect(f.visible.has("assistant-navigation-contextual-state")).toBe(
        false,
      );
      expect(f.messages.append).toHaveBeenLastCalledWith(
        expect.objectContaining({ area: "messages", navigationActive: false }),
      );
      for (const state of [
        "category_selected",
        "place_selected",
        "action_available",
      ] as const) {
        f.messaging.publish(state, {
          category: "Praias",
          place: "Segunda Praia",
        });
        expect(f.visible.has("assistant-navigation-contextual-state")).toBe(
          false,
        );
        expect(f.visible.size).toBe(1);
      }
      f.messaging.destroy();
      expect(f.visible.size).toBe(0);
    },
  );

  it("preserves failure feedback for navigation that is still active", () => {
    const f = navigationMessagingFixture();
    f.status({ phase: "active", isActive: true, destination: "Segunda Praia" });
    f.status({ phase: "failed", isActive: true });
    expect(f.visible.get("assistant-navigation-contextual-state")).toEqual(
      expect.objectContaining({ area: "navigation", navigationActive: true }),
    );
    expect(f.visible.has("assistant-contextual-state")).toBe(false);
    f.status({ phase: "ended", isActive: false });
    expect(f.visible.size).toBe(0);
    f.messaging.destroy();
    f.status({ phase: "active", isActive: true });
    expect(f.visible.size).toBe(0);
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

describe("Explore contextual semantic location count", () => {
  it.each(["places", "search"])(
    "uses location count for %s with old-snapshot fallback",
    (stage) => {
      const snapshot = {
        stage,
        category: null,
        place: null,
        markerCount: 0,
        tour: null,
      };
      expect(
        resolveExploreContextualState({ ...snapshot, locationCount: 8 }),
      ).toBe("results_found");
      expect(
        resolveExploreContextualState({
          ...snapshot,
          markerCount: 8,
          locationCount: 0,
        }),
      ).toBe("no_results");
      expect(
        resolveExploreContextualState({ ...snapshot, markerCount: 8 }),
      ).toBe("results_found");
    },
  );
});

describe("semantic count integrity", () => {
  it.each([null, undefined, Number.NaN, Number.POSITIVE_INFINITY, -1, 1.5])(
    "present invalid %s never falls back to five symbols",
    (locationCount) => {
      const state = {
        stage: "places",
        category: null,
        place: null,
        tour: null,
        markerCount: 5,
        locationCount,
      } as unknown as AssistantExploreStateSnapshot;
      expect(resolveExploreLocationCount(state)).toBeNull();
      expect(resolveExploreContextualState(state)).toBe("provider_error");
    },
  );
});
