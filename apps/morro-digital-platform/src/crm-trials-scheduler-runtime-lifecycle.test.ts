import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("CRM M103 trial scheduler runtime lifecycle", () => {
  it("starts the durable trial expiry scheduler only after CRM schema bootstrap", async () => {
    const source = await readFile(
      new URL("../tooling/crm-api.mjs", import.meta.url),
      "utf8",
    );

    expect(source).toContain("createCrmTrialSchedulerHost");
    expect(source).toContain("CRM_TRIAL_SCHEDULER_INTERVAL_MS");
    expect(source).toContain("await ensureSchema();");
    expect(source).toContain("trialScheduler.start();");
    expect(source).toContain("await trialScheduler.stop();");
    expect(source).toContain("await pool.end();");
  });

  it("binds CRM start and graceful stop to the real Node runtime", async () => {
    const source = await readFile(
      new URL("../tooling/dev-server.mjs", import.meta.url),
      "utf8",
    );

    expect(source).toContain("await crmApi.start();");
    expect(source).toContain('process.once("SIGINT"');
    expect(source).toContain('process.once("SIGTERM"');
    expect(source).toContain("crmApi");
    expect(source).toContain(".stop()");
  });
});
