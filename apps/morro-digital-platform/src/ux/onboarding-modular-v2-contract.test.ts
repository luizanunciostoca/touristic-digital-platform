import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));

async function readRepository(path: string): Promise<string> {
  return readFile(`${repositoryRoot}${path}`, "utf8");
}

describe("Onboarding V2 modular architecture contract", () => {
  it("keeps persistence, dialog DOM and orchestration in separate modules", async () => {
    const [controller, storage, dialog] = await Promise.all([
      readRepository(
        "apps/morro-digital-platform/src/onboarding/public-onboarding.ts",
      ),
      readRepository(
        "apps/morro-digital-platform/src/onboarding/public-onboarding-storage.ts",
      ),
      readRepository(
        "apps/morro-digital-platform/src/onboarding/public-onboarding-dialog.ts",
      ),
    ]);

    expect(controller).toContain('from "./public-onboarding-storage.js"');
    expect(controller).toContain('from "./public-onboarding-dialog.js"');
    expect(controller).not.toContain("FOCUSABLE_SELECTOR");
    expect(controller).not.toContain("createElement("section")");
    expect(controller).not.toContain("localStorage");

    expect(storage).toContain("PUBLIC_ONBOARDING_STORAGE_KEY");
    expect(storage).toContain("resolvePublicOnboardingStorage");
    expect(storage).not.toContain("innerHTML");

    expect(dialog).toContain("createPublicOnboardingDialog");
    expect(dialog).toContain("activatePublicOnboardingDialogHost");
    expect(dialog).toContain("restorePublicOnboardingDialogHost");
    expect(dialog).toContain("trapPublicOnboardingDialogFocus");
    expect(dialog).toContain('overlay.setAttribute("role", "dialog")');
    expect(dialog).toContain('overlay.setAttribute("aria-modal", "true")');
    expect(dialog).toContain("overlay.tabIndex = -1");
  });

  it("preserves the public compatibility exports used by existing callers", async () => {
    const controller = await readRepository(
      "apps/morro-digital-platform/src/onboarding/public-onboarding.ts",
    );

    expect(controller).toContain("hasCompletedPublicOnboarding");
    expect(controller).toContain("persistPublicOnboardingCompletion");
    expect(controller).toContain("PUBLIC_ONBOARDING_STORAGE_KEY");
    expect(controller).toContain("PublicOnboardingStorage");
    expect(controller).toContain("installPublicOnboarding");
  });
});
