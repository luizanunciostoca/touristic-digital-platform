import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

async function source(path: string): Promise<string> {
  return readFile(new URL(path, import.meta.url), "utf8");
}

describe("CRM M123 browser lifecycle", () => {
  it("exposes bounded creation controls", async () => {
    const page = await source("../../admin-crm/public/trials.html");

    expect(page).toContain('id="trial-create-form"');
    expect(page).toContain('name="leadId" type="number" min="1"');
    expect(page).toContain('max="365"');
  });

  it("uses the shared authenticated browser transport", async () => {
    const client = await source("../../admin-crm/public/trials.js");

    expect(client).toContain('auth.secureFetch("/api/crm/trials"');
    expect(client).toContain('method: "POST"');
    expect(client).toContain("data-trial-action");
  });
});
