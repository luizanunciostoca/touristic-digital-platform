import { readFile } from "node:fs/promises";
import { Script } from "node:vm";

import { describe, expect, it } from "vitest";

async function source(path: string): Promise<string> {
  return readFile(new URL(path, import.meta.url), "utf8");
}

describe("CRM M127 Lead search and filters", () => {
  it("exposes bounded search, stage and status controls", async () => {
    const page = await source("../../admin-crm/public/index.html");

    expect(page).toContain('id="lead-filter-form"');
    expect(page).toContain('name="search" type="search" maxlength="120"');
    expect(page).toContain('name="stage"');
    expect(page).toContain('name="status"');
    expect(page).toContain('id="lead-filter-reset"');
    expect(page).toContain("/apps/admin-crm/public/lead-filters.js");
  });

  it("filters existing rows without introducing CRM mutations", async () => {
    const client = await source("../../admin-crm/public/lead-filters.js");

    expect(() => new Script(client)).not.toThrow();
    expect(client).toContain("row.hidden = !matches");
    expect(client).toContain("new MutationObserver");
    expect(client).not.toContain("secureFetch");
    expect(client).not.toContain("/api/crm/");
  });
});
