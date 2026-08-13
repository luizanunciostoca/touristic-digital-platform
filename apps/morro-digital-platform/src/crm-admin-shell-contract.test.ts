import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const root = new URL("../../../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

describe("CRM M104 browser shell", () => {
  it("exposes the frozen V1 primary modules without claiming UI parity", async () => {
    const html = await read("apps/admin-crm/public/index.html");
    for (const module of ["Dashboard", "Leads", "Reuniões", "Propostas", "Contratos", "Follow-ups", "Trials", "Indicações", "Configurações"]) {
      expect(html).toContain(module);
    }
    expect(html).toContain("UI pendente");
  });

  it("keeps the shell behind the shared platform session surface", async () => {
    const shell = await read("apps/admin-crm/public/shell.js");
    const loginEntry = await read("apps/morro-digital-platform/src/business-login-entry.ts");
    expect(shell).toContain("@touristic/auth-browser");
    expect(shell).toContain("getSession");
    expect(shell).toContain("/dashboard/login.html");
    expect(loginEntry).toContain("/apps/admin-crm/");
  });
});
