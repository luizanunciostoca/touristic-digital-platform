import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const htmlPath = new URL("../public/proposals.html", import.meta.url);
const clientPath = new URL("../public/proposals.js", import.meta.url);

describe("CRM proposals browser lifecycle", () => {
  it("exposes proposal creation and draft sending through the authenticated browser client", async () => {
    const [html, client] = await Promise.all([
      readFile(htmlPath, "utf8"),
      readFile(clientPath, "utf8"),
    ]);

    expect(html).toContain('id="proposal-create-form"');
    expect(html).toContain('id="proposal-create-submit"');
    expect(html).toContain("Ações");
    expect(client).toContain('auth.secureFetch("/api/crm/proposals"');
    expect(client).toContain("/api/crm/proposals/${proposal.id}/send");
    expect(client).toContain('proposal.status !== "draft"');
    expect(client).toContain('method: "POST"');
  });
});
