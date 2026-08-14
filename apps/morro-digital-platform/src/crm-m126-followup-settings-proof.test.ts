import { readFile } from "node:fs/promises";
import { Script } from "node:vm";

import { describe, expect, it } from "vitest";

async function source(path: string): Promise<string> {
  return readFile(new URL(path, import.meta.url), "utf8");
}

describe("CRM M126 follow-up settings browser", () => {
  it("exposes bounded settings controls", async () => {
    const page = await source("../../admin-crm/public/follow-ups.html");

    expect(page).toContain('id="follow-up-setting-form"');
    expect(page).toContain('name="name" maxlength="160"');
    expect(page).toContain(
      'name="intervalDays" type="number" min="1" max="365"',
    );
    expect(page).toContain(
      'name="maxAttempts" type="number" min="1" max="100"',
    );
    expect(page).toContain('name="messageTemplate" maxlength="4000"');
    expect(page).toContain('name="isActive" type="checkbox"');
  });

  it("persists settings through authenticated PUT without delivery mutations", async () => {
    const client = await source("../../admin-crm/public/follow-ups.js");
    const executable = client.replace(/^import[^\n]+\n\n/u, "");

    expect(() => new Script(executable)).not.toThrow();
    expect(client).toContain('auth.secureFetch("/api/crm/follow-ups/settings"');
    expect(client).toContain('method: "PUT"');
    expect(client).toContain("fillSettingForm(item)");
    expect(client).not.toContain("/sent");
    expect(client).not.toContain("/responded");
  });
});
