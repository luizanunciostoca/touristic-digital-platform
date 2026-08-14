import { readFile } from "node:fs/promises";
import { Script } from "node:vm";

import { describe, expect, it } from "vitest";

async function source(path: string): Promise<string> {
  return readFile(new URL(path, import.meta.url), "utf8");
}

describe("CRM M125 follow-up scheduling browser", () => {
  it("exposes bounded scheduling controls", async () => {
    const page = await source("../../admin-crm/public/follow-ups.html");

    expect(page).toContain('id="follow-up-create-form"');
    expect(page).toContain('name="leadId" type="number" min="1"');
    expect(page).toContain('name="settingId" type="number" min="1"');
    expect(page).toContain('name="scheduledAt" type="datetime-local" required');
    expect(page).toContain('name="attemptNumber" type="number" min="1" max="100"');
  });

  it("uses authenticated scheduling without delivery mutations", async () => {
    const client = await source("../../admin-crm/public/follow-ups.js");
    const executable = client.replace(/^import[^\n]+\n\n/u, "");

    expect(() => new Script(executable)).not.toThrow();
    expect(client).toContain('auth.secureFetch("/api/crm/follow-ups"');
    expect(client).toContain('method: "POST"');
    expect(client).toContain('readData("/api/crm/follow-ups/settings")');
    expect(client).not.toContain("/sent");
    expect(client).not.toContain("/responded");
    expect(client).not.toContain('method: "PUT"');
  });
});
