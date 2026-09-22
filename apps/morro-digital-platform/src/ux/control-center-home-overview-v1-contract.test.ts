import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const home = readFileSync(
  new URL("../../../control-center/public/control-center-home-overview-v1.js", import.meta.url),
  "utf8",
);
const css = readFileSync(
  new URL("../../../control-center/public/control-center-home-overview-v1.css", import.meta.url),
  "utf8",
);
const shell = readFileSync(
  new URL("../../../control-center/public/control-center-shell-v1.js", import.meta.url),
  "utf8",
);
const index = readFileSync(
  new URL("../../../control-center/public/index.html", import.meta.url),
  "utf8",
);

describe("Control Center Home / Overview UX V1 contract", () => {
  it("renders the approved information hierarchy and keeps Quick Actions retired", () => {
    for (const label of [
      "Empresas",
      "Afiliados",
      "Reservas Hoje",
      "Receita Hoje",
      "Alertas",
      "Precisa da sua atenção",
      "Resumo por destino",
      "Atividade recente",
      "Afiliados são da Morro Digital",
    ]) {
      expect(home).toContain(label);
    }
    expect(home).not.toContain("Quick Actions");
  });

  it("keeps technical system vocabulary out of primary Home rendering", () => {
    expect(home).not.toContain("http-listener");
    expect(home).not.toContain("shutdown-readiness");
    expect(home).not.toContain("release-identity");
    expect(home).toContain("Tudo funcionando bem");
    expect(home).toContain("Operação requer atenção");
    expect(home).toContain("Operação parcialmente disponível");
  });

  it("preserves owner authority and never promotes a paginated slice to a total", () => {
    expect(home).toContain('api("/affiliates?limit=250")');
    expect(home).toContain('api("/destinations")');
    expect(home).toContain('api("/audit?limit=20")');
    expect(home).toContain("recorte não vira total");
    expect(home).toContain("Sem agregado autoritativo por destino");
    expect(home).toContain("nenhum total é inferido");
    expect(home).not.toContain("affiliates.length.toLocaleString");
  });

  it("uses exact destination ids and filters data outside readable destination authority", () => {
    expect(home).toContain("allowedDestinations.has(item.destinationId)");
    expect(home).toContain("summaryById.get(destination.id)");
    expect(home).toContain("option.value === destinationId");
    expect(home).not.toContain("destinationName ===");
    expect(shell).toContain('new CustomEvent("md:destination-context-changed"');
  });

  it("caps attention to four visible tiles and recent activity to eight", () => {
    expect(home).toContain("const MAX_ATTENTION_TILES = 4");
    expect(home).toContain("const MAX_RECENT_ACTIVITY = 8");
    expect(home).toContain("slice(0, MAX_ATTENTION_TILES)");
    expect(home).toContain("slice(0, MAX_RECENT_ACTIVITY)");
  });

  it("loads Home after Wave 1 shell and protects non-vertical text behavior", () => {
    expect(index).toContain("control-center-shell-v1.css");
    expect(index).toContain("control-center-home-overview-v1.css");
    expect(index.indexOf("control-center-home-overview-v1.css")).toBeGreaterThan(
      index.indexOf("control-center-shell-v1.css"),
    );
    expect(css).toContain("grid-template-columns: repeat(5");
    expect(css).toContain("grid-template-columns: repeat(4");
    expect(css).toContain("word-break: normal");
  });
});
