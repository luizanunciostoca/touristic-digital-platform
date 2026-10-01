import test from "node:test";
import assert from "node:assert/strict";

import { pages, site } from "../src/content.mjs";
import { renderPage } from "../src/render.mjs";

test("keeps the Wave 3 Hub at sixteen evidence-supported routes", () => {
  assert.equal(pages.length, 16);
  assert.deepEqual(
    pages.map((page) => page.path),
    [
      "/",
      "/platform/",
      "/product/",
      "/destinations/",
      "/destinations/morro-digital/",
      "/destinations/itacare-digital/",
      "/business/",
      "/market/",
      "/investors/",
      "/sponsorship/",
      "/destination-partners/",
      "/technology/",
      "/governance/",
      "/about/",
      "/resources/",
      "/contact/",
    ],
  );
});

test("renders every route as pt-BR non-production content", () => {
  assert.equal(site.language, "pt-BR");
  for (const page of pages) {
    const html = renderPage(page);
    assert.match(html, /<html lang="pt-BR"/);
    assert.match(
      html,
      /<meta name="robots" content="noindex,nofollow,noarchive">/,
    );
    assert.equal((html.match(/<h1(?:\s|>)/g) ?? []).length, 1);
    assert.match(html, /<main id="main">/);
    assert.match(html, /<footer class="site-footer">/);
    assert.doesNotMatch(html, /drive\.google\.com|docs\.google\.com/i);
  }
});

test("preserves master-brand and destination-family hierarchy", () => {
  const home = pages.find((page) => page.path === "/");
  const homeText = JSON.stringify(home);
  assert.match(homeText, /REDE/);
  assert.match(homeText, /PERCURSO/);
  assert.match(homeText, /FLUXO/);
  assert.match(homeText, /master brand/i);
});

test("does not elevate Itacaré runtime status or publish its pending tagline", () => {
  const page = pages.find(
    (candidate) => candidate.path === "/destinations/itacare-digital/",
  );
  const text = JSON.stringify(page);
  assert.match(text, /não verificada/i);
  assert.match(text, /tagline.*omitida/i);
  assert.doesNotMatch(text, /runtime equivalent/i);
});

test("keeps sponsorship concepts visibly separated from current product", () => {
  const page = pages.find((candidate) => candidate.path === "/sponsorship/");
  assert.match(JSON.stringify(page), /CONCEPT \/ NOT LIVE PRODUCT/);
});

test("does not expose controlled files or invent contact endpoints", () => {
  const resources = renderPage(
    pages.find((page) => page.path === "/resources/"),
  );
  const contact = renderPage(pages.find((page) => page.path === "/contact/"));
  assert.doesNotMatch(resources, /href="https?:\/\//i);
  assert.match(resources, /Gate de publicação/);
  assert.doesNotMatch(contact, /<form/i);
  assert.match(contact, /Canal ainda não habilitado/i);
});

test("keeps market planning counts explicitly dated and qualified", () => {
  const market = JSON.stringify(pages.find((page) => page.path === "/market/"));
  assert.match(market, /Q1 2026/);
  assert.match(market, /snapshot/i);
  assert.match(market, /escopo de planejamento/i);
  assert.match(market, /não representa participação de mercado/i);
});