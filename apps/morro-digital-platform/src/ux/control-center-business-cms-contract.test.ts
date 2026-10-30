import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL(
    "../../../control-center/public/control-center-business-cms.js",
    import.meta.url,
  ),
  "utf8",
);

describe("Control Center Business CMS contract", () => {
  it("pairs every tab with its named panel and starts with one Tab stop", () => {
    const markup: unknown = runInNewContext(
      source.replace(/^export /gm, "") +
        '\n detailTabs({businessId:"keyboard",profile:{name:"Keyboard"}}, String, false)',
    );
    if (typeof markup !== "string") throw new Error("CMS_MARKUP_REQUIRED");
    const tabs = [...markup.matchAll(/<button[^>]*role="tab"[^>]*>/g)].map(
      ([tag]) => tag,
    );
    const panels = [...markup.matchAll(/<div[^>]*role="tabpanel"[^>]*>/g)].map(
      ([tag]) => tag,
    );
    expect(tabs).toHaveLength(10);
    expect(panels).toHaveLength(tabs.length);
    tabs.forEach((tab, index) => {
      const id = tab.match(/\bid="([^"]+)"/)?.[1];
      const panelId = tab.match(/aria-controls="([^"]+)"/)?.[1];
      expect(id).toBeTruthy();
      expect(panelId).toBeTruthy();
      expect(tab).toContain(`tabindex="${index === 0 ? 0 : -1}"`);
      expect(tab).toContain(`aria-selected="${index === 0}"`);
      expect(panels[index]).toContain(`id="${panelId}"`);
      expect(panels[index]).toContain(`aria-labelledby="${id}"`);
      expect(panels[index]).toContain('tabindex="0"');
      expect(panels[index].includes(" hidden")).toBe(index !== 0);
    });
  });

  it("moves focus and selection with arrows, Home and End before and after a click", () => {
    type Key = { key: string; preventDefault: () => void };
    let focused = "overview";
    const panels = new Map(
      ["overview", "profile", "location"].map((id, index) => [
        id,
        { hidden: index !== 0 },
      ]),
    );
    const buttons = [...panels.keys()].map((id, index) => ({
      dataset: { businessCmsTab: id },
      tabIndex: index === 0 ? 0 : -1,
      selected: index === 0 ? "true" : "false",
      listeners: new Map<string, (event: Key) => void>(),
      setAttribute(name: string, value: string) {
        if (name === "aria-selected") this.selected = value;
      },
      addEventListener(name: string, listener: (event: Key) => void) {
        this.listeners.set(name, listener);
      },
      focus() {
        focused = id;
      },
    }));
    const root = {
      querySelectorAll: () => buttons,
      querySelector: (selector: string) =>
        panels.get(selector.match(/="([^"]+)"/)?.[1] ?? ""),
    };
    runInNewContext(source.replace(/^export /gm, "") + "\n bindTabs(root)", {
      root,
    });
    const key = (value: string, expected: string) => {
      let prevented = false;
      const current = buttons.find(
        (button) => button.dataset.businessCmsTab === focused,
      );
      current?.listeners.get("keydown")?.({
        key: value,
        preventDefault: () => {
          prevented = true;
        },
      });
      expect(prevented).toBe(true);
      expect(focused).toBe(expected);
      for (const button of buttons) {
        const selected = button.dataset.businessCmsTab === expected;
        expect(button.tabIndex).toBe(selected ? 0 : -1);
        expect(button.selected).toBe(String(selected));
        expect(panels.get(button.dataset.businessCmsTab)?.hidden).toBe(
          !selected,
        );
      }
    };
    key("ArrowRight", "profile");
    key("ArrowLeft", "overview");
    key("ArrowLeft", "location");
    key("ArrowRight", "overview");
    key("End", "location");
    key("Home", "overview");
    buttons[1].focus();
    buttons[1].listeners.get("click")?.({ key: "", preventDefault: () => {} });
    key("ArrowRight", "location");
    key("Home", "overview");
    let prevented = false;
    buttons[0].listeners.get("keydown")?.({
      key: "Tab",
      preventDefault: () => {
        prevented = true;
      },
    });
    expect(prevented).toBe(false);
  });

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
