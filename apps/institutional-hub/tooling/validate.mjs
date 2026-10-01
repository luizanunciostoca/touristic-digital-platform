import { pages } from "../src/content.mjs";
import { renderPage } from "../src/render.mjs";

const errors = [];
const fail = (path, message) => errors.push(path + ": " + message);

const prohibitedPositiveClaims = [
  /100% ready/i,
  /fully operational/i,
  /market leader/i,
  /largest platform/i,
  /first in brazil/i,
  /72 active partners/i,
  /131 live places/i,
  /guaranteed inventory/i,
];

const leakagePatterns = [
  /drive\.google\.com/i,
  /docs\.google\.com/i,
  /localhost/i,
  /https?:\/\/[^"'\s]*staging/i,
  /\/Users\//,
  /\/home\/[^<\s]+/,
  /[A-Za-z]:\\\\/,
  /fixture/i,
];

for (const page of pages) {
  const html = renderPage(page);

  const h1Count = (html.match(/<h1(?:\s|>)/g) ?? []).length;
  if (h1Count !== 1) {
    fail(page.path, "expected one h1, found " + h1Count);
  }

  for (const required of [
    '<html lang="pt-BR"',
    "<header",
    "<main",
    "<footer",
    '<nav class="primary-nav"',
    'name="robots" content="noindex,nofollow,noarchive"',
    'class="skip-link"',
    'aria-label="Nota de autoridade"',
  ]) {
    if (!html.includes(required)) {
      fail(page.path, "missing required semantic marker: " + required);
    }
  }

  for (const pattern of prohibitedPositiveClaims) {
    if (pattern.test(html)) {
      fail(page.path, "prohibited positive claim matched " + pattern);
    }
  }

  for (const pattern of leakagePatterns) {
    if (pattern.test(html)) {
      fail(page.path, "publication leakage matched " + pattern);
    }
  }

  if (/href="https?:\/\//i.test(html)) {
    fail(page.path, "external links are not allowed in the preview renderer");
  }
}

const uniquePaths = new Set(pages.map((page) => page.path));
if (uniquePaths.size !== pages.length) {
  errors.push("route registry contains duplicate paths");
}

if (pages.length !== 16) {
  errors.push("expected 16 institutional routes, found " + pages.length);
}

const itacare = pages.find(
  (page) => page.path === "/destinations/itacare-digital/",
);
if (!itacare) {
  errors.push("Itacaré route missing");
} else {
  const text = JSON.stringify(itacare);
  if (!/não verificada/i.test(text) || !/tagline.*omitida/i.test(text)) {
    errors.push("Itacaré evidence guardrails are incomplete");
  }
}

const sponsorship = pages.find((page) => page.path === "/sponsorship/");
if (
  !sponsorship ||
  !/CONCEPT \/ NOT LIVE PRODUCT/.test(JSON.stringify(sponsorship))
) {
  errors.push("sponsorship concept label is missing");
}

const resources = pages.find((page) => page.path === "/resources/");
if (!resources || /https?:\/\//i.test(JSON.stringify(resources))) {
  errors.push("resources route must not expose external/private URLs");
}

const contact = pages.find((page) => page.path === "/contact/");
if (!contact || !/não publica um endpoint de contato/i.test(contact.lede)) {
  errors.push("contact route must remain configuration-gated");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(
  "Institutional Hub validation PASS: " +
    pages.length +
    " routes, noindex and claims guards active",
);
