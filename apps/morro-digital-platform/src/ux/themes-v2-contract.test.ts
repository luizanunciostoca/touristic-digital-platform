import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));

async function readRepository(path: string): Promise<string> {
  return readFile(`${repositoryRoot}${path}`, "utf8");
}

describe("UX Design V2 theme authority", () => {
  it("defines explicit light dark high-contrast and destination scopes", async () => {
    const css = await readRepository(
      "apps/morro-digital-platform/public/design-system-v2.css",
    );

    expect(css).toContain('[data-theme="light"]');
    expect(css).toContain('[data-theme="dark"]');
    expect(css).toContain('[data-theme="high-contrast"]');
    expect(css).toContain('[data-destination-theme="morro"]');
    expect(css).toContain("--md-color-surface: Canvas;");
    expect(css).toContain("--md-focus-ring-color: Highlight;");
  });

  it("declares the canonical tourist theme on public journey entrypoints", async () => {
    const [home, experience, tickets] = await Promise.all([
      readRepository("apps/morro-digital-platform/public/index.html"),
      readRepository("apps/morro-digital-platform/public/experience.html"),
      readRepository("apps/morro-digital-platform/public/tickets.html"),
    ]);

    for (const html of [home, experience, tickets]) {
      expect(html).toContain('data-theme="light"');
      expect(html).toContain('data-destination-theme="morro"');
    }
  });

  it("keeps forced-colors as a separate system-level accessibility authority", async () => {
    const css = await readRepository(
      "apps/morro-digital-platform/public/design-system-v2.css",
    );

    expect(css).toContain("@media (forced-colors: active)");
    expect(css).toContain("forced-color-adjust");
  });
});
