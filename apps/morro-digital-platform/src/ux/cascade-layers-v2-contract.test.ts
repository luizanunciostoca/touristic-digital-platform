import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const publicRoot = fileURLToPath(new URL("../../public/", import.meta.url));
const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));

async function readPublic(path: string): Promise<string> {
  return readFile(`${publicRoot}${path}`, "utf8");
}

async function readRepository(path: string): Promise<string> {
  return readFile(`${repositoryRoot}${path}`, "utf8");
}

describe("UX Design V2 cascade architecture", () => {
  it("publishes one canonical layer order for all layered V2 rules", async () => {
    const css = await readPublic("premium-ux-v2.css");

    expect(css).toContain(
      "@layer reset, vendor, legacy, tokens, base, components, features, utilities, overrides;",
    );
    for (const layer of ["base", "components", "features", "utilities", "overrides"]) {
      expect(css).toContain(`@layer ${layer}`);
    }
  });

  it("keeps exactly one explicit unlayered compatibility boundary", async () => {
    const css = await readPublic("premium-ux-v2.css");
    const markers = css.match(/Compatibility bridge/gu) ?? [];

    expect(markers).toHaveLength(1);
    expect(css).toContain(
      "intentionally unlayered until the matching legacy selectors are migrated",
    );
  });

  it("keeps runtime stylesheet order deterministic on every tourist entrypoint", async () => {
    for (const surface of ["index.html", "experience.html", "tickets.html"]) {
      const html = await readPublic(surface);
      const hrefs = [
        ...html.matchAll(
          /<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["'][^>]*>/giu,
        ),
      ].map((match) => match[1]);

      const premium = "/apps/morro-digital-platform/public/premium-ux-v2.css";
      const foundations =
        "/apps/morro-digital-platform/public/design-system-v2.css";

      expect(hrefs).toContain(premium);
      expect(hrefs).toContain(foundations);
      expect(hrefs.indexOf(premium)).toBe(hrefs.indexOf(foundations) - 1);
      expect(hrefs.at(-1)).toBe(foundations);
    }
  });

  it("records the unlayered legacy bridge as an intentional migration exception", async () => {
    const doc = await readRepository("docs/ux/cascade-layers-v2.md");

    expect(doc).toContain("intentional compatibility boundary");
    expect(doc).toContain("public/legacy/**");
    expect(doc).toContain("formal exception");
  });
});
