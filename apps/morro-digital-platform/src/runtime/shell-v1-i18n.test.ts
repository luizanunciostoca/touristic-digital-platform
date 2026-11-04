import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { applyMorroDocumentLocale } from "./browser-locale.js";
import {
  applyV1ShellPresentation,
  getShellPresentationCopy,
  shellPresentationLocale,
} from "./shell-v1-i18n.js";

describe("V1 shell presentation i18n", () => {
  it("normalizes the V1 language aliases through the canonical locale contract", () => {
    expect(shellPresentationLocale("pt")).toBe("pt-BR");
    expect(shellPresentationLocale("pt-PT")).toBe("pt-BR");
    expect(shellPresentationLocale("en-US")).toBe("en");
    expect(shellPresentationLocale("es-AR")).toBe("es");
    expect(shellPresentationLocale("he-IL")).toBe("he");
    expect(shellPresentationLocale("iw-IL")).toBe("he");
  });

  it("preserves the frozen V1 shell translations for all four languages", () => {
    expect(
      getShellPresentationCopy("pt").legacy.site_interactive_map_label,
    ).toBe("Mapa interativo");
    expect(
      getShellPresentationCopy("en").legacy.site_interactive_map_label,
    ).toBe("Interactive map");
    expect(
      getShellPresentationCopy("es").legacy.site_interactive_map_label,
    ).toBe("Mapa interactivo");
    expect(
      getShellPresentationCopy("he").legacy.site_interactive_map_label,
    ).toBe("מפה אינטראקטיבית");

    expect(
      getShellPresentationCopy("pt").legacy.assistant_welcome_message,
    ).toContain("Bem-vindo ao Morro Digital");
    expect(
      getShellPresentationCopy("en").legacy.assistant_welcome_message,
    ).toContain("Welcome to Morro Digital");
    expect(
      getShellPresentationCopy("es").legacy.assistant_welcome_message,
    ).toContain("Bienvenido a Morro Digital");
    expect(
      getShellPresentationCopy("he").legacy.assistant_welcome_message,
    ).toContain("ברוכים הבאים ל-Morro Digital");

    expect(
      getShellPresentationCopy("en").legacy.assistant_input_placeholder,
    ).toBe("Type your question...");
    expect(getShellPresentationCopy("es").legacy.navigation_stop).toBe(
      "Detener navegación",
    );
    expect(
      getShellPresentationCopy("he").legacy.map_loading_morro_digital,
    ).toBe("טוען את Morro Digital...");

    expect(getShellPresentationCopy("pt").assistantCategoryLabels.beaches).toBe(
      "Praias",
    );
    expect(
      getShellPresentationCopy("en").assistantCategoryLabels.restaurants,
    ).toBe("Restaurants");
    expect(getShellPresentationCopy("es").assistantCategoryLabels.hotels).toBe(
      "Hoteles",
    );
    expect(getShellPresentationCopy("he").assistantCategoryLabels.help).toBe(
      "עזרה",
    );
  });

  it("localizes the V2-only shell accessibility additions without changing language values", () => {
    expect(getShellPresentationCopy("en").mapRegionLabel).toBe(
      "Interactive map of Morro de São Paulo",
    );
    expect(getShellPresentationCopy("es").voiceAutomatic).toBe("Automática");
    expect(getShellPresentationCopy("he").voiceDefaultSuffix).toBe(
      "ברירת מחדל",
    );
  });

  it("updates both assistant region names when the document language changes", () => {
    const markup = readFileSync(
      new URL("../layouts/app-shell.ts", import.meta.url),
      "utf8",
    );
    const regions = [...markup.matchAll(/<div\b[^>]*>/gu)]
      .map(([tag]) => tag)
      .filter(
        (tag) =>
          tag.includes('id="assistant-messages"') ||
          tag.includes('class="messages-area md-assistant-messages"'),
      )
      .map((tag) => {
        const attributes = new Map(
          [...tag.matchAll(/([\w-]+)="([^"]*)"/gu)].map(([, name, value]) => [
            name,
            value,
          ]),
        );
        return {
          attributes,
          getAttribute: (name: string) => attributes.get(name) ?? null,
          setAttribute: (name: string, value: string) =>
            attributes.set(name, value),
        };
      });
    expect(regions).toHaveLength(2);
    const initialAttributes = regions.map(({ attributes }) =>
      [...attributes].filter(([name]) => name !== "aria-label"),
    );

    // The existing Node suite has no DOM dependency. This exercises the
    // presentation contract against the real shell tags; browser/AT behavior
    // remains a separate check.
    const focusedElement = {};
    const document = {
      documentElement: { lang: "pt-BR", dir: "ltr" },
      activeElement: focusedElement,
      querySelectorAll: (selector: string) =>
        selector === "[data-i18n-aria]"
          ? regions.filter((region) => region.getAttribute("data-i18n-aria"))
          : [],
      getElementById: () => null,
      querySelector: () => null,
    } as unknown as Document;

    for (const [locale, assistantName, conversationName] of [
      ["pt-BR", "Assistente do Morro Digital", "Conversa com o assistente"],
      ["en-US", "Morro Digital assistant", "Conversation with the assistant"],
      ["es-ES", "Asistente de Morro Digital", "Conversación con el asistente"],
      ["he-IL", "העוזר של Morro Digital", "שיחה עם העוזר"],
      ["pt-BR", "Assistente do Morro Digital", "Conversa com o assistente"],
    ] as const) {
      applyMorroDocumentLocale(document, locale);
      applyV1ShellPresentation(document);
      expect(
        regions.map((region) => region.getAttribute("aria-label")),
      ).toEqual([assistantName, conversationName]);
      expect(document.documentElement.lang).toBe(locale);
      expect(document.documentElement.dir).toBe(
        locale === "he-IL" ? "rtl" : "ltr",
      );
      expect(document.activeElement).toBe(focusedElement);
      expect(
        regions.map(({ attributes }) =>
          [...attributes].filter(([name]) => name !== "aria-label"),
        ),
      ).toEqual(initialAttributes);
    }
  });
});
