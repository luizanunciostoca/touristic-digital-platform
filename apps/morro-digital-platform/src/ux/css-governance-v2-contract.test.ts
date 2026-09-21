import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));

async function readRepository(path: string): Promise<string> {
  return readFile(`${repositoryRoot}${path}`, "utf8");
}

const governedCss = [
  "apps/morro-digital-platform/public/styles.css",
  "apps/morro-digital-platform/public/design-system-v2.css",
  "apps/morro-digital-platform/public/premium-ux-v2.css",
  "apps/morro-digital-platform/public/assistant-v2.css",
  "apps/morro-digital-platform/public/assistant-photo-carousel.css",
  "apps/morro-digital-platform/public/commerce.css",
  "apps/morro-digital-platform/public/ticketing.css",
  "apps/morro-digital-platform/public/explore-locations.css",
  "apps/morro-digital-platform/public/navigation-map.css",
] as const;

function importantDeclarations(css: string): readonly string[] {
  return css
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /:\s*[^;]*!important\s*;/u.test(line));
}

describe("UX Design V2 active CSS governance", () => {
  it("rejects transition-all and arbitrary numeric z-index in every governed file", async () => {
    for (const path of governedCss) {
      const css = await readRepository(path);
      expect(css, path).not.toMatch(/transition\s*:\s*all\b/iu);
      expect(css, path).not.toMatch(/z-index\s*:\s*-?\d{3,}\b/iu);
    }
  });

  it("limits important declarations to explicit legacy-compatibility surfaces", async () => {
    const compatibilityFiles = new Set([
      "apps/morro-digital-platform/public/styles.css",
      "apps/morro-digital-platform/public/premium-ux-v2.css",
      "apps/morro-digital-platform/public/assistant-v2.css",
      "apps/morro-digital-platform/public/explore-locations.css",
      "apps/morro-digital-platform/public/navigation-map.css",
    ]);

    for (const path of governedCss) {
      const css = await readRepository(path);
      const important = importantDeclarations(css);
      if (!compatibilityFiles.has(path)) {
        expect(important, path).toEqual([]);
      }
    }

    const base = await readRepository(
      "apps/morro-digital-platform/public/styles.css",
    );
    expect(importantDeclarations(base)).toHaveLength(11);
    expect(base).toContain(".hidden");
    expect(base).toContain(".sr-only");
  });

  it("keeps migrated base Explore and Navigation CSS inside the Stylelint gate", async () => {
    const config = await readRepository("stylelint.config.mjs");

    expect(config).not.toContain("**/public/styles.css");
    expect(config).not.toContain("**/public/explore-locations.css");
    expect(config).not.toContain("**/public/navigation-map.css");
    expect(config).toContain('transition: ["/\\ball\\b/"]');
    expect(config).toContain('"z-index": ["/^-?\\d{3,}$/"]');
  });
});
