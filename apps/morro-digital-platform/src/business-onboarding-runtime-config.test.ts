import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("Business onboarding runtime configuration bootstrap", () => {
  it("loads runtime-config.js before the onboarding module entrypoint", async () => {
    const html = await readFile(
      new URL("../public/business-onboarding.html", import.meta.url),
      "utf8",
    );

    const runtimeConfigIndex = html.indexOf(
      '<script src="/runtime-config.js"></script>',
    );
    const onboardingEntryIndex = html.indexOf(
      'src="/apps/morro-digital-platform/dist/business-onboarding-entry.js"',
    );

    expect(runtimeConfigIndex).toBeGreaterThanOrEqual(0);
    expect(onboardingEntryIndex).toBeGreaterThan(runtimeConfigIndex);
  });
});
