import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const root = new URL("../../../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

describe("CRM M109 Lead stage browser flow", () => {
  it(
    "renders a stage selector from the canonical browser stage map",
    async () => {
      const shell = await read("apps/admin-crm/public/shell.js");

      expect(shell).toContain('className="lead-stage-select"');
      expect(shell).toContain('className="lead-stage-button"');
      expect(shell).toContain("Object.entries(stageLabels)");
      expect(shell).toContain('save.textContent="Salvar etapa"');
    },
  );

  it("persists the selected stage through the dedicated endpoint", async () => {
    const shell = await read("apps/admin-crm/public/shell.js");

    expect(shell).toContain('`/api/crm/leads/${id}/stage`');
    expect(shell).toContain("JSON.stringify({stage})");
    expect(shell).toContain('setStatus("Atualizando etapa…")');
  });

  it("refreshes the Leads list after a stage change", async () => {
    const shell = await read("apps/admin-crm/public/shell.js");

    expect(shell).toContain("leadsLoaded=false;await loadLeads()");
    expect(shell).toContain('setStatus("Etapa atualizada com sucesso.")');
  });
});
