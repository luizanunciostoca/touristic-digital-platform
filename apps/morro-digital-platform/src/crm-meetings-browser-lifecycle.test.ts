import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

async function source(path: string): Promise<string> {
  return readFile(new URL(path, import.meta.url), "utf8");
}

describe("CRM M120 meetings browser lifecycle", () => {
  it("links the CRM navigation to the dedicated Meetings surface", async () => {
    const shell = await source("../../admin-crm/public/index.html");
    const page = await source("../../admin-crm/public/meetings.html");

    expect(shell).toContain("/apps/admin-crm/public/meetings.html");
    expect(page).toContain('id="meeting-create-form"');
    expect(page).toContain('name="scheduledAt"');
    expect(page).toContain('name="modality"');
  });

  it("uses the authenticated Meetings POST and PATCH lifecycle without duplicating server policy", async () => {
    const client = await source("../../admin-crm/public/meetings.js");

    expect(client).toContain('auth.secureFetch("/api/crm/meetings"');
    expect(client).toContain('method: "POST"');
    expect(client).toContain('method: "PATCH"');
    expect(client).toContain('"done"');
    expect(client).toContain('"no_show"');
    expect(client).toContain('"cancelled"');
    expect(client).toContain('meeting.status !== "scheduled"');
  });
});
