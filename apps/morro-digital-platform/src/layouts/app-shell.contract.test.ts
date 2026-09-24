import { describe, expect, it } from "vitest";

import { createAppShellMarkup } from "./app-shell.js";

const CANONICAL_CATEGORIES = [
  "beaches",
  "tours",
  "attractions",
  "restaurants",
  "hotels",
  "nightlife",
  "shops",
  "transport",
  "emergencies",
  "help",
] as const;

function values(markup: string, attribute: string): string[] {
  return Array.from(
    markup.matchAll(new RegExp(`${attribute}="([^"]+)"`, "g")),
  ).map((match) => match[1] ?? "");
}

describe("app shell canonical UX contracts", () => {
  it("keeps DOM and keyboard order of map controls canonical", () => {
    const markup = createAppShellMarkup();
    const ids = [
      "toggle-3d-mode",
      "toggle-map-layer",
      "toggle-globe-view",
      "recenter-map-control",
    ];
    const positions = ids.map((id) => markup.indexOf(`id="${id}"`));

    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(
      ids.every(
        (id) => markup.match(new RegExp(`id="${id}"`, "g"))?.length === 1,
      ),
    ).toBe(true);
  });

  it("derives all category surfaces from the same canonical contract", () => {
    const markup = createAppShellMarkup();

    expect(values(markup, "data-discover-category")).toEqual(
      CANONICAL_CATEGORIES,
    );
    expect(values(markup, "data-assistant-category")).toEqual(
      CANONICAL_CATEGORIES,
    );

    const legacySection =
      markup.match(
        /data-assistant-command-source="legacy-category-routing">([\s\S]*?)<\/div>/,
      )?.[1] ?? "";
    expect(values(legacySection, "data-value")).toEqual(CANONICAL_CATEGORIES);

    expect(markup).toContain(">Passeios</span>");
    expect(markup).toContain(">Pousadas</span>");
    expect(markup).not.toContain(">Hotéis</span>");
  });
});
