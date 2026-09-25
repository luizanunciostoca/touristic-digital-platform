import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL(
    "../../../control-center/public/control-center-business-cms.js",
    import.meta.url,
  ),
  "utf8",
);

describe("Control Center Business CMS contract", () => {
  it("uses the governed businesses namespace and never direct tables", () => {
    expect(source).toContain('list: "/businesses/cms"');
    expect(source).toContain("actorHasCapability");
    expect(source).not.toMatch(/\/api\//i);
    expect(source).not.toMatch(/\bSELECT\b[\s\S]{0,120}\bFROM\b/i);
    expect(source).not.toMatch(/\bINSERT\s+INTO\b/i);
    expect(source).not.toMatch(/\bUPDATE\s+business\b/i);
  });

  it("covers the requested admin surfaces", () => {
    for (const label of [
      "Nova empresa",
      "Localização",
      "Fotos e mídia",
      "Produtos, ofertas e cardápio",
      "Ações no mapa",
      "Preview público",
      "Equipe",
      "Auditoria",
      "Publicação",
    ]) {
      expect(source).toContain(label);
    }
  });

  it("keeps CTA resolution and money authority outside the browser", () => {
    expect(source).toContain("não replica o resolver de CTA no browser");
    expect(source).toContain("Inventory / Ticketing");
  });

  it("preserves legacy Business 360 as explicit integration fallback", () => {
    expect(source).toContain("legacyRender");
    expect(source).toContain("Modo compatibilidade");
    expect(source).toContain("BUSINESS_ADMIN_ROUTE_NOT_ALLOWED");
  });
});
