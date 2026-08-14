import { readFile } from "node:fs/promises";
import { Script } from "node:vm";

import { describe, expect, it } from "vitest";

async function source(path: string): Promise<string> {
  return readFile(new URL(path, import.meta.url), "utf8");
}

describe("CRM M129 proposal response browser lifecycle", () => {
  it("keeps proposal response bounded to sent proposals", async () => {
    const client = await source("../../admin-crm/public/proposals.js");
    const executable = client.replace(/^import[^\n]+\n\n/u, "");

    expect(() => new Script(executable)).not.toThrow();
    expect(client).toContain('proposal.status === "sent"');
    expect(client).toContain("/respond`");
    expect(client).toContain('JSON.stringify({ accepted: true })');
    expect(client).toContain('JSON.stringify({ accepted: false })');
    expect(client).toContain('proposal.status === "draft"');
    expect(client).toContain("/send`");
  });
});
