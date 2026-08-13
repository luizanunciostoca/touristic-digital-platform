import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("CRM M102 trials runtime composition", () => {
  it("composes trials into the real CRM API host", async () => {
    const source = await readFile(
      new URL("../tooling/crm-api.mjs", import.meta.url),
      "utf8",
    );

    expect(source).toContain('"/api/crm/trials"');
    expect(source).toContain("CrmTrialServerBoundary");
    expect(source).toContain("MySqlCrmTrialRepository");
    expect(source).toContain("MySqlCrmTrialAuditPort");
    expect(source).toContain("CrmTrialHttpTransport");
    expect(source).toContain("applyCrmM99Schema(pool)");
  });
});
