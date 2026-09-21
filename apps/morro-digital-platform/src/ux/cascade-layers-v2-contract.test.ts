import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));

async function readRepository(path: string): Promise<string> {
  return readFile(`${repositoryRoot}${path}`, "utf8");
}

describe("UX Design V2 cascade layer runtime", () => {
  it("declares one deterministic runtime layer order before legacy content", async () => {
    const tooling = await readRepository(
      "apps/morro-digital-platform/tooling/build-legacy-css.mjs",
    );

    const order =
      "@layer reset, vendor, legacy, tokens, base, components, features, utilities, overrides;";
    expect(tooling).toContain(order);
    expect(tooling).toContain('"@layer legacy {"');
    expect(tooling.indexOf(order)).toBeLessThan(
      tooling.indexOf('"@layer legacy {"'),
    );
  });

  it("keeps Premium UX migrated selectors inside named layers", async () => {
    const css = await readRepository(
      "apps/morro-digital-platform/public/premium-ux-v2.css",
    );

    expect(css).toContain("@layer base");
    expect(css).toContain("@layer components");
    expect(css).toContain("@layer features");
    expect(css).toContain("@layer utilities");
    expect(css).toContain("@layer overrides");
    expect(css).toContain(
      "Compatibility bridge — now part of the explicit overrides layer.",
    );
    expect(css).not.toContain("intentionally unlayered");
  });

  it("loads layered legacy before Premium UX and Design System foundations", async () => {
    const html = await readRepository(
      "apps/morro-digital-platform/public/index.html",
    );

    const legacy =
      "/apps/morro-digital-platform/public/legacy/legacy.bundle.css";
    const premium =
      "/apps/morro-digital-platform/public/premium-ux-v2.css";
    const designSystem =
      "/apps/morro-digital-platform/public/design-system-v2.css";

    expect(html).toContain(legacy);
    expect(html).toContain(premium);
    expect(html).toContain(designSystem);
    expect(html.indexOf(legacy)).toBeLessThan(html.indexOf(premium));
    expect(html.indexOf(premium)).toBeLessThan(html.indexOf(designSystem));
  });
});
