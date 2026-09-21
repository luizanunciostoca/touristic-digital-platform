import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));

async function readRepository(path: string): Promise<string> {
  return readFile(`${repositoryRoot}${path}`, "utf8");
}

describe("UX Design V2 skeleton adoption", () => {
  it(
    "uses the shared Design System skeleton in the Assistant loading lifecycle",
    async () => {
      const [shell, css] = await Promise.all([
        readRepository(
          "apps/morro-digital-platform/src/assistant/assistant-shell-ui.ts",
        ),
        readRepository(
          "apps/morro-digital-platform/public/assistant-v2.css",
        ),
      ]);

      expect(shell).toContain("syncAssistantLoadingSkeleton");
      expect(shell).toContain('"md-skeleton assistant-loading-skeleton-line"');
      expect(shell).toContain('state === "loading"');
      expect(shell).toContain('skeleton.setAttribute("aria-hidden", "true")');
      expect(css).toContain(".assistant-loading-skeleton");
      expect(css).toContain("var(--md-space-3)");
    },
  );

  it("retains existing Ticketing and Commerce skeleton adoption", async () => {
    const [ticketing, commerce] = await Promise.all([
      readRepository(
        "apps/morro-digital-platform/public/ticketing.js",
      ),
      readRepository(
        "apps/morro-digital-platform/public/experience.html",
      ),
    ]);

    expect(ticketing).toContain("md-skeleton ticketing-skeleton-line");
    expect(commerce).toContain("md-skeleton");
    expect(commerce).toContain("commerce-detail-skeleton");
  });

  it("keeps loading announcements separate from decorative skeletons", async () => {
    const workflow = await readRepository(
      ".github/workflows/assistant-modal-reading-order.yml",
    );

    expect(workflow).toContain("Assistant loading announcement missing");
    expect(workflow).toContain("assistant-loading-skeleton[aria-hidden");
    expect(workflow).toContain("loadingLines !== 3");
  });
});
