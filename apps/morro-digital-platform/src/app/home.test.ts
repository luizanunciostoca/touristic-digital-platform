import { describe, expect, it } from "vitest";

import { renderHome } from "./home.js";

describe("renderHome", () => {
  it("renders the destination shell and primary journeys", () => {
    const html = renderHome();

    expect(html).toContain('lang="pt-BR"');
    expect(html).toContain('data-destination-id="morro-de-sao-paulo"');
    expect(html).toContain("Morro Digital");
    expect(html).toContain("Mapa interativo em migração");
    expect(html).toContain("Onde ficar");
    expect(html).toContain("Onde comer");
    expect(html).toContain("O que fazer");
  });

  it("renders semantic navigation and a single main landmark", () => {
    const html = renderHome();

    expect(html.match(/<main/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Navegação principal"');
    expect(html).toContain('aria-current="page"');
  });
});
