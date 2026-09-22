import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { universalSearchTesting } from "../../control-center/public/control-center-search.js";

const publicRoot = new URL("../../control-center/public/", import.meta.url);

async function publicSource(name) {
  return readFile(new URL(name, publicRoot), "utf8");
}

describe("Control Center universal search UI contract", () => {
  it("normalizes accents and case without interpreting special characters", () => {
    expect(universalSearchTesting.foldSearchText("São Bento")).toBe(
      "sao bento",
    );
    expect(universalSearchTesting.foldSearchText("MORRO")).toBe("morro");
    expect(universalSearchTesting.foldSearchText("%_'\"><script>")).toBe(
      "%_'\"><script>",
    );
    expect(
      universalSearchTesting.highlightedRange("Destino São Bento", "sao"),
    ).toEqual({ start: 8, end: 11 });
  });

  it("normalizes explicit destination scope and global scope safely", () => {
    expect(
      universalSearchTesting.normalizeDestinationId("morro-de-sao-paulo"),
    ).toBe("morro-de-sao-paulo");
    expect(universalSearchTesting.normalizeDestinationId(" global ")).toBe("");
    expect(universalSearchTesting.normalizeDestinationId("")).toBe("");
  });

  it("only accepts internal deep links", () => {
    expect(universalSearchTesting.safeSearchHref("#users:user-1")).toBe(
      "#users:user-1",
    );
    expect(
      universalSearchTesting.safeSearchHref(
        "/apps/admin-crm/public/lead-detail.html?id=42",
      ),
    ).toContain("lead-detail.html");
    expect(universalSearchTesting.safeSearchHref("javascript:alert(1)")).toBe(
      "",
    );
    expect(universalSearchTesting.safeSearchHref("https://example.com")).toBe(
      "",
    );
  });

  it("declares combobox/listbox semantics and explicit destination scope", async () => {
    const html = await publicSource("index.html");
    expect(html).toContain('id="destination-selector"');
    expect(html).toContain("Todos os destinos");
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-controls="search-results"');
    expect(html).toContain('aria-autocomplete="list"');
    expect(html).toContain('role="listbox"');
  });

  it("uses DOM-safe result rendering with full keyboard and abort/debounce behavior", async () => {
    const source = await publicSource("control-center-search.js");
    expect(source).toContain('document.createElement("mark")');
    expect(source).toContain("document.createTextNode");
    expect(source).not.toContain("results.innerHTML");
    expect(source).toContain('event.key === "ArrowDown"');
    expect(source).toContain('event.key === "ArrowUp"');
    expect(source).toContain('event.key === "Enter"');
    expect(source).toContain('event.key === "Escape"');
    expect(source).toContain("event.metaKey || event.ctrlKey");
    expect(source).toContain("new AbortController()");
    expect(source).toContain("cancelPendingSearch");
    expect(source).toContain("debounceMs = 240");
    expect(source).toContain('setAttribute("aria-activedescendant"');
    expect(source).toContain('setAttribute("aria-selected"');
  });

  it("keeps the result surface usable on mobile without introducing assistant shortcuts", async () => {
    const [css, html, source] = await Promise.all([
      publicSource("control-center.css"),
      publicSource("index.html"),
      publicSource("control-center-search.js"),
    ]);
    expect(css).toContain("@media (max-width: 767px)");
    expect(css).toContain(".search-results {");
    expect(css).toContain("max-height: min(480px, 70vh)");
    expect(html).not.toContain("Quick Actions");
    expect(source).not.toContain("quickActions");
    expect(source).not.toContain("assistant");
  });
});
