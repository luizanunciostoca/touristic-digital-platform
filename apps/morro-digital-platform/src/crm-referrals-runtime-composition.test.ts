import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("CRM M101 referrals runtime composition", () => {
  it("composes referrals into the real CRM API host", async () => {
    const source = await readFile(
      new URL("../tooling/crm-api.mjs", import.meta.url),
      "utf8",
    );

    expect(source).toContain('"/api/crm/referrals"');
    expect(source).toContain("CrmReferralServerBoundary");
    expect(source).toContain("MySqlCrmReferralRepository");
    expect(source).toContain("MySqlCrmReferralAuditPort");
    expect(source).toContain("CrmReferralHttpTransport");
    expect(source).toContain("applyCrmM99Schema(pool)");
    expect(source).not.toContain("applyCrmM71Schema(pool)");
  });
});
