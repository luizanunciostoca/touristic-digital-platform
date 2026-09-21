import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));

async function readRepository(path: string): Promise<string> {
  return readFile(`${repositoryRoot}${path}`, "utf8");
}

const activeCss = [
  "apps/morro-digital-platform/public/design-system-v2.css",
  "apps/morro-digital-platform/public/premium-ux-v2.css",
  "apps/morro-digital-platform/public/assistant-v2.css",
  "apps/morro-digital-platform/public/assistant-photo-carousel.css",
  "apps/morro-digital-platform/public/commerce.css",
  "apps/morro-digital-platform/public/ticketing.css",
  "apps/morro-digital-platform/public/explore-locations.css",
  "apps/morro-digital-platform/public/navigation-map.css",
  "apps/morro-digital-platform/public/styles.css",
] as const;

const importantCeilings = new Map<string, number>([
  ["apps/morro-digital-platform/public/design-system-v2.css", 5],
  ["apps/morro-digital-platform/public/premium-ux-v2.css", 36],
  ["apps/morro-digital-platform/public/assistant-v2.css", 1],
  ["apps/morro-digital-platform/public/assistant-photo-carousel.css", 0],
  ["apps/morro-digital-platform/public/commerce.css", 0],
  ["apps/morro-digital-platform/public/ticketing.css", 0],
  ["apps/morro-digital-platform/public/explore-locations.css", 9],
  ["apps/morro-digital-platform/public/navigation-map.css", 16],
  ["apps/morro-digital-platform/public/styles.css", 19],
]);

function countImportant(css: string): number {
  return Array.from(css.matchAll(/!important\s*;/gu)).length;
}

describe("UX Design V2 CSS governance", () => {
  it("keeps transition-all out of every active product stylesheet", async () => {
    for (const path of activeCss) {
      const css = await readRepository(path);
      expect(css, path).not.toMatch(/transition\s*:\s*all\b/gu);
    }
  });

  it("prevents important usage from growing outside reviewed component ceilings", async () => {
    for (const path of activeCss) {
      const css = await readRepository(path);
      expect(countImportant(css), path).toBeLessThanOrEqual(
        importantCeilings.get(path) ?? 0,
      );
    }
  });

  it("keeps normal tourist commerce surfaces important-free", async () => {
    for (const path of [
      "apps/morro-digital-platform/public/assistant-photo-carousel.css",
      "apps/morro-digital-platform/public/commerce.css",
      "apps/morro-digital-platform/public/ticketing.css",
    ]) {
      expect(await readRepository(path), path).not.toContain("!important");
    }
  });

  it("keeps cascade layers deterministic and the compatibility bridge explicit", async () => {
    const premium = await readRepository(
      "apps/morro-digital-platform/public/premium-ux-v2.css",
    );
    expect(premium).toContain(
      "@layer reset, vendor, legacy, tokens, base, components, features, utilities, overrides;",
    );
    for (const layer of [
      "@layer base {",
      "@layer components {",
      "@layer features {",
      "@layer utilities {",
      "@layer overrides {",
    ]) {
      expect(premium).toContain(layer);
    }
    expect(premium).toContain(
      "Compatibility bridge — intentionally unlayered until the matching legacy",
    );
  });

  it("documents why the remaining important declarations are allowed", async () => {
    const docs = await readRepository("docs/ux/css-governance-v2.md");
    for (const reason of [
      "reduced-motion safety override",
      "frozen V1 compatibility bridge",
      "Mapbox/provider inline presentation",
      "screen-reader utility",
    ]) {
      expect(docs).toContain(reason);
    }
  });
});
