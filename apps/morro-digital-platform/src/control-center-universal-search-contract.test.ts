import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const root = new URL("../../../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

describe("Control Center Universal Search production contract", () => {
  it("keeps the search combobox destination-aware and accessible", async () => {
    const html = await read("apps/control-center/public/index.html");

    expect(html).toContain('id="global-search"');
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-controls="search-results"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-autocomplete="list"');
    expect(html).toContain('id="search-destination"');
    expect(html).toContain("Todos os destinos");
    expect(html).toContain('role="listbox"');
  });

  it("supports keyboard navigation, Escape and Ctrl/Cmd+K", async () => {
    const source = await read(
      "apps/control-center/public/control-center-search.js",
    );

    expect(source).toContain('event.key === "ArrowDown"');
    expect(source).toContain('event.key === "ArrowUp"');
    expect(source).toContain('event.key === "Enter"');
    expect(source).toContain('event.key === "Escape"');
    expect(source).toContain("event.metaKey || event.ctrlKey");
    expect(source).toContain('event.key.toLowerCase() === "k"');
    expect(source).toContain("aria-activedescendant");
    expect(source).toContain('aria-selected", "true"');
  });

  it("debounces, aborts stale requests and treats short queries as empty", async () => {
    const source = await read(
      "apps/control-center/public/control-center-search.js",
    );

    expect(source).toContain("debounceMs = 240");
    expect(source).toContain("activeRequest?.abort()");
    expect(source).toContain("requestSequence");
    expect(source).toContain("Array.from(query).length < 2");
    expect(source).toContain("SEARCH_RATE_LIMITED");
  });

  it("renders result data without innerHTML and validates navigation targets", async () => {
    const source = await read(
      "apps/control-center/public/control-center-search.js",
    );

    expect(source).not.toContain(".innerHTML");
    expect(source).toContain("document.createTextNode");
    expect(source).toContain("mark.textContent");
    expect(source).toContain("safeSearchHref");
    expect(source).toContain('href.startsWith("#")');
    expect(source).toContain('href.startsWith("/apps/")');
  });

  it("renders grouped, partial, error and paginated states", async () => {
    const source = await read(
      "apps/control-center/public/control-center-search.js",
    );

    expect(source).toContain("search-group-title");
    expect(source).toContain("Resultados parciais");
    expect(source).toContain("Não foi possível concluir a busca.");
    expect(source).toContain("Nenhum resultado encontrado.");
    expect(source).toContain("pagination.nextOffset");
    expect(source).toContain("Anterior");
    expect(source).toContain("Próxima");
  });

  it("keeps the result surface usable on a mobile viewport", async () => {
    const css = await read("apps/control-center/public/control-center.css");

    expect(css).toContain("@media (max-width: 820px)");
    expect(css).toContain(".search-results");
    expect(css).toContain("position: fixed");
    expect(css).toContain("max-height: min(65dvh, 520px)");
    expect(css).toContain(".search-destination");
  });

  it("does not introduce Quick Actions or a floating Assistant control", async () => {
    const html = await read("apps/control-center/public/index.html");
    const search = await read(
      "apps/control-center/public/control-center-search.js",
    );

    expect(html).not.toContain("Quick Actions");
    expect(search).not.toContain("floating-assistant");
    expect(search).not.toContain("quick-action");
  });
});
