import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));

async function readRepository(path: string): Promise<string> {
  return readFile(`${repositoryRoot}${path}`, "utf8");
}

const governedCss = [
  "apps/morro-digital-platform/public/design-system-v2.css",
  "apps/morro-digital-platform/public/premium-ux-v2.css",
  "apps/morro-digital-platform/public/assistant-v2.css",
  "apps/morro-digital-platform/public/assistant-photo-carousel.css",
  "apps/morro-digital-platform/public/commerce.css",
  "apps/morro-digital-platform/public/ticketing.css",
  "apps/morro-digital-platform/public/explore-locations.css",
  "apps/morro-digital-platform/public/navigation-map.css",
] as const;

function nonHairlinePixels(css: string): readonly string[] {
  return Array.from(
    css.matchAll(/-?(?:\d*\.)?\d+px\b/gu),
    (match) => match[0],
  ).filter((value) => value !== "1px" && value !== "-1px");
}

describe("UX Design V2 pixel-unit debt contract", () => {
  it("keeps active V2-owned CSS free of arbitrary pixel geometry", async () => {
    for (const path of governedCss) {
      const css = await readRepository(path);
      expect(nonHairlinePixels(css), path).toEqual([]);
    }
  });

  it("preserves one-pixel optical hairlines as the only governed exception", async () => {
    const css = await Promise.all(governedCss.map(readRepository));
    const joined = css.join("\n");

    expect(joined).toContain("1px solid");
    expect(joined).not.toContain("56px");
    expect(joined).not.toContain("480px");
    expect(joined).not.toContain("blur(10px)");
    expect(joined).not.toContain("100px)");
    expect(joined).not.toContain("120px)");
  });
});
