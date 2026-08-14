import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

async function source(path: string): Promise<string> {
  return readFile(new URL(path, import.meta.url), "utf8");
}

describe("CRM M125 follow-ups browser lifecycle", () => {
  it("exposes scheduling and settings forms aligned with server limits", async () => {
    const page = await source("../../admin-crm/public/follow-ups.html");

    expect(page).toContain('id="follow-up-create-form"');
    expect(page).toContain(
      'name="attemptNumber" type="number" min="1" max="100"',
    );
    expect(page).toContain('id="follow-up-setting-form"');
    expect(page).toContain('name="name" maxlength="160"');
    expect(page).toContain(
      'name="intervalDays" type="number" min="1" max="365"',
    );
    expect(page).toContain(
      'name="maxAttempts" type="number" min="1" max="100"',
    );
    expect(page).toContain('name="messageTemplate" maxlength="4000"');
  });

  it("uses authenticated lifecycle endpoints and server-owned transitions", async () => {
    const [baseClient, lifecycle] = await Promise.all([
      source("../../admin-crm/public/follow-ups.js"),
      source("../../admin-crm/public/follow-ups-lifecycle.js"),
    ]);

    expect(baseClient).toContain('import("./follow-ups-lifecycle.js")');
    expect(lifecycle).toContain('request("/api/crm/follow-ups", "POST"');
    expect(lifecycle).toContain(
      'request("/api/crm/follow-ups/settings", "PUT"',
    );
    expect(lifecycle).toContain(
      'item.status === "pending" ? "sent" : "responded"',
    );
    expect(lifecycle).toContain("/api/crm/follow-ups/${item.id}/${suffix}");
    expect(lifecycle).toContain("auth.secureFetch(path");
  });
});
