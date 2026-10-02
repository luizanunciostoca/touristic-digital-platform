import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const businessHtml = read(
  "apps/morro-digital-platform/public/business-dashboard.html",
);
const businessCss = read(
  "apps/morro-digital-platform/public/business-dashboard.css",
);
const businessSurface = read(
  "apps/morro-digital-platform/src/business-dashboard-surface.ts",
);
const controlJs = read("apps/control-center/public/control-center.js");
const controlCss = read("apps/control-center/public/control-center.css");
const adminAdapters = read(
  "apps/morro-digital-platform/tooling/admin-domain-adapters.mjs",
);
const paymentsApi = read(
  "apps/morro-digital-platform/tooling/payments-api.mjs",
);
const businessPrimaryHtml = businessHtml.replace(
  /<span\s+class="contract-diagnostic"\s+hidden\s*>Endpoint ainda não migrado<\/span\s*>/gu,
  "",
);
test("Business primary UX hides migration vocabulary and internal module ids", () => {
  assert.doesNotMatch(
    businessPrimaryHtml,
    /boundary protegido|endpoints V2|Endpoint ainda não migrado|M50|M51|milestone|migra(?:ção|do)/iu,
  );
  assert.match(businessSurface, /morroProModulePolicies/u);
  assert.doesNotMatch(
    businessSurface,
    /(?:heading|access)\.textContent\s*=\s*moduleId/u,
  );
  assert.doesNotMatch(businessSurface, /\?\?\s*moduleId/u);
  assert.match(businessHtml, /data-empty-state="unavailable"/u);
  assert.match(businessHtml, /data-empty-state="empty"/u);
  assert.match(businessHtml, /data-empty-state="not-enabled"/u);
});

test("Business availability semantics never paint unavailable as success", () => {
  assert.match(businessHtml, /data-state="unavailable"/u);
  assert.match(
    businessCss,
    /\.live-indicator\[data-state="unavailable"\] \.live-dot,[\s\S]*?background:\s*#64748b/u,
  );
});
test("Control Center forms have one styled state contract", () => {
  assert.match(
    controlCss,
    /\.form-grid input,\s*\.form-grid select,\s*\.form-grid textarea/u,
  );
  assert.match(controlCss, /min-height:\s*44px/u);
  assert.match(controlCss, /\.form-grid input:focus-visible/u);
  assert.match(controlCss, /\.form-grid input:disabled/u);
  assert.match(controlCss, /\.form-grid input\[readonly\]/u);
  assert.match(controlCss, /\.form-grid \[aria-invalid="true"\]/u);
  assert.match(controlCss, /html\[data-theme="dark"\] \.form-grid input/u);
});

test("Control Center collection zero states are explicit surfaces", () => {
  for (const copy of [
    "Nenhum usuário encontrado",
    "Nenhum afiliado encontrado",
    "Nenhuma reserva encontrada",
  ]) {
    assert.match(controlJs, new RegExp(copy, "u"));
  }
  assert.match(
    controlJs,
    /class="card empty-surface" data-empty-state="empty"/u,
  );
});
test("Financial summary is primary and owner-backed read-only projection", () => {
  const summary = controlJs.indexOf(
    'aria-label="Financeiro">Resumo financeiro</h2>',
  );
  const advanced = controlJs.indexOf("<summary>Consultas avançadas</summary>");
  assert.ok(summary >= 0 && advanced > summary);
  assert.match(controlJs, /\/financial\/summary\?from=/u);
  assert.match(adminAdapters, /const adminPrefix = "\/api\/admin\/v1"/u);
  assert.match(adminAdapters, /\$\{adminPrefix\}\/financial\/summary/u);
  assert.match(adminAdapters, /paymentsApi\.adminFinancialSummary/u);
  assert.match(paymentsApi, /function createFinancialAdminSummaryReader/u);
  const start = paymentsApi.indexOf(
    "function createFinancialAdminSummaryReader",
  );
  const end = paymentsApi.indexOf("export function createPaymentsApi", start);
  const projection = paymentsApi.slice(start, end);
  assert.match(projection, /FROM financial_payments/u);
  assert.match(projection, /FROM financial_reconciliation_findings/u);
  assert.doesNotMatch(projection, /audit|localStorage|client/iu);
});
test("Content primary creation flow is editorial-first", () => {
  const destination = controlJs.indexOf('id="content-create-destination"');
  const kind = controlJs.indexOf('id="content-create-kind"');
  const locale = controlJs.indexOf('id="content-create-locale"');
  const title = controlJs.indexOf('id="content-create-title"');
  const summary = controlJs.indexOf('id="content-create-summary"');
  const advanced = controlJs.indexOf("<summary>Detalhes avançados</summary>");
  const id = controlJs.indexOf('id="content-create-id"');
  const source = controlJs.indexOf('id="content-create-source"');
  assert.ok(
    destination < kind &&
      kind < locale &&
      locale < title &&
      title < summary &&
      summary < advanced &&
      advanced < id &&
      id < source,
  );
  assert.match(controlJs, /const generatedId =/u);
  assert.match(
    controlJs,
    /sourceReference: sourceOverride \|\| generatedSourceReference/u,
  );
});
test("Primary Control Center copy excludes known architecture-first labels", () => {
  for (const forbidden of [
    "CRM owner orchestration",
    "Financial owner",
    "append-only owner events",
    "step-up obrigatório",
    "QR payload",
    "External key",
    "Payment ID",
    '<span class="badge">crm.manage</span>',
  ]) {
    assert.equal(controlJs.includes(forbidden), false, forbidden);
  }
  assert.match(controlJs, /technical-details/u);
});
