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
      "Prévia da revisão editável",
      "Equipe",
      "Auditoria",
      "Publicação",
    ]) {
      expect(source).toContain(label);
    }
  });

  it("manages Media only through the governed Business CMS contract", () => {
    expect(source).toContain("mediaEntry");
    expect(source).toContain("mediaOrder");
    expect(source).toContain('id="business-cms-media-form"');
    expect(source).toContain("Mídia governada:");
    expect(source).toContain("Incluir no próximo publish");
    expect(source).toContain("data-media-delete");
    expect(source).not.toContain(
      "Gerenciamento de arquivos requer o serviço de armazenamento Media.",
    );
  });

  it("authors and edits Catalog only through the governed Business CMS route", () => {
    expect(source).toContain("catalogDraft");
    expect(source).toContain('data-business-catalog-kind="product"');
    expect(source).toContain('data-business-catalog-kind="offer"');
    expect(source).toContain('data-business-catalog-kind="menu"');
    expect(source).toContain('data-business-catalog-kind="menu-category"');
    expect(source).toContain('data-business-catalog-kind="menu-item"');
    expect(source).toContain("Catálogo governado:");
    const catalogAuthoring = source.slice(
      source.indexOf('<div class="business-cms-catalog-forms">'),
      source.indexOf('<p id="business-cms-catalog-result"'),
    );
    expect(catalogAuthoring).not.toContain('name="businessId"');
    expect(catalogAuthoring).not.toContain('name="placeId"');
    expect(catalogAuthoring).not.toContain('name="destinationId"');
  });

  it("keeps CTA resolution and money authority outside the browser", () => {
    expect(source).toContain(
      "As ações são projetadas pelo registry do servidor.",
    );
    expect(source).toContain("Inventory / Ticketing");
  });

  it("preserves legacy Business 360 as explicit integration fallback", () => {
    expect(source).toContain("legacyRender");
    expect(source).toContain("Modo compatibilidade");
    expect(source).toContain("BUSINESS_ADMIN_ROUTE_NOT_ALLOWED");
  });
});
