import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

async function source(path: string): Promise<string> {
  return readFile(new URL(path, import.meta.url), "utf8");
}

describe("CRM M127 referral lead association browser", () => {
  it("uses the existing authenticated lead-link boundary", async () => {
    const client = await source("../../admin-crm/public/referrals.js");

    expect(client).toContain("data-referral-link-form");
    expect(client).toContain('input.name = "referredLeadId"');
    expect(client).toContain("/link-lead");
    expect(client).toContain("body: JSON.stringify({ referredLeadId })");
    expect(client).toContain('method: "POST"');
    expect(client).not.toContain("grant-benefit");
  });
});
