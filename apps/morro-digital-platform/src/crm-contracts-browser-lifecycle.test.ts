import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

async function source(path: string): Promise<string> {
  return readFile(new URL(path, import.meta.url), "utf8");
}

describe("CRM M122 contracts browser lifecycle", () => {
  it("exposes a contract creation form aligned with server limits", async () => {
    const page = await source("../../admin-crm/public/contracts.html");

    expect(page).toContain('id="contract-create-form"');
    expect(page).toContain(
      'name="leadId" type="number" min="1" step="1" required',
    );
    expect(page).toContain(
      'name="proposalId" type="number" min="1" step="1"',
    );
    expect(page).toContain('name="title" required maxlength="180"');
    expect(page).toContain('name="content" required maxlength="100000"');
  });

  it(
    "uses authenticated create, send and cancel endpoints while keeping server transitions authoritative",
    async () => {
      const clientUrl = new URL(
        "../../admin-crm/public/contracts.js",
        import.meta.url,
      );
      const client = await readFile(clientUrl, "utf8");

      expect(() =>
        execFileSync(process.execPath, ["--check", fileURLToPath(clientUrl)], {
          stdio: "pipe",
        }),
      ).not.toThrow();
      expect(client).toContain('auth.secureFetch("/api/crm/contracts"');
      expect(client).toContain('method: "POST"');
      expect(client).toContain(
        "/api/crm/contracts/${contract.id}/${action.suffix}",
      );
      expect(client).toContain('contract.status === "draft"');
      expect(client).toContain('contract.status !== "signed"');
      expect(client).toContain('contract.status !== "cancelled"');
      expect(client).toContain("await loadContracts()");
    },
  );
});
