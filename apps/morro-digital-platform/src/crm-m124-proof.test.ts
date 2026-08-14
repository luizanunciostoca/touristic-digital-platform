import { readFile } from "node:fs/promises";
import { Script } from "node:vm";

import { describe, expect, it } from "vitest";

async function source(path: string): Promise<string> {
  return readFile(new URL(path, import.meta.url), "utf8");
}

describe("CRM M124 browser lifecycle", () => {
  it("exposes the minimal referral creation form", async () => {
    const page = await source("../../admin-crm/public/referrals.html");

    expect(page).toContain('id="referral-create-form"');
    expect(page).toContain('name="referrerLeadId" type="number" min="1"');
    expect(page).toContain('name="referredName" required maxlength="255"');
  });

  it("keeps the core lifecycle authenticated and syntactically valid", async () => {
    const client = await source("../../admin-crm/public/referrals.js");
    const executable = client.replace(/^import[^\n]+\n\n/u, "");

    expect(() => new Script(executable)).not.toThrow();
    expect(client).toContain('auth.secureFetch("/api/crm/referrals"');
    expect(client).toContain('method: "POST"');
    expect(client).toContain("data-referral-action");
    expect(client).toContain('["contact", "convert", "lose"]');
    expect(client).not.toContain("link-lead");
    expect(client).not.toContain("grant-benefit");
  });
});
