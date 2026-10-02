import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const platform = "apps/morro-digital-platform/";
const businessHtml = read(platform + "public/business-dashboard.html");
const businessCss = read(platform + "public/business-dashboard.css");
const businessSurface = read(platform + "src/business-dashboard-surface.ts");
const controlJs = read("apps/control-center/public/control-center.js");
const controlCss = read("apps/control-center/public/control-center.css");
const adminAdapters = read(platform + "tooling/admin-domain-adapters.mjs");
const paymentsApi = read(platform + "tooling/payments-api.mjs");

test("UX585 business/control remediation contract", () => {
  const primary = businessHtml.replace(
    /<span\s+class="contract-diagnostic"\s+hidden\s*>Endpoint ainda não migrado<\/span\s*>/gu,
    "",
  );
  // prettier-ignore
  assert.doesNotMatch(primary, /boundary protegido|endpoints V2|Endpoint ainda não migrado|M50|M51|milestone|migra(?:ção|do)/iu);
  // prettier-ignore
  assert.match(businessSurface, /(?=[\s\S]*morroProModulePolicies)(?=[\s\S]*data-module-help)/u);
  assert.doesNotMatch(businessSurface, /\?\?\s*moduleId/u);
  // prettier-ignore
  assert.match(businessHtml, /(?=[\s\S]*data-empty-state="empty")(?=[\s\S]*data-empty-state="unavailable")(?=[\s\S]*data-empty-state="not-enabled")(?=[\s\S]*data-state="unavailable")/u);
  // prettier-ignore
  assert.match(businessCss, /\.live-indicator\[data-state="unavailable"\] \.live-dot,[\s\S]*?background:\s*#64748b/u);

  // prettier-ignore
  assert.match(controlCss, /(?=[\s\S]*\.form-grid input,)(?=[\s\S]*min-height:\s*44px)(?=[\s\S]*\.form-grid input:focus-visible)(?=[\s\S]*\.form-grid input:disabled)(?=[\s\S]*\.form-grid input\[readonly\])(?=[\s\S]*\.form-grid \[aria-invalid="true"\])(?=[\s\S]*html\[data-theme="dark"\] \.form-grid \[aria-invalid="true"\])/u);
  // prettier-ignore
  assert.match(controlJs, /(?=[\s\S]*Nenhum usuário encontrado)(?=[\s\S]*Nenhum afiliado encontrado)(?=[\s\S]*Nenhuma reserva encontrada)(?=[\s\S]*id="affiliate-search-empty")(?=[\s\S]*tableWrap\.hidden = true)/u);
  assert.ok(!controlJs.includes('<details class="technical-details" open>'));
  // prettier-ignore
  assert.ok(controlJs.indexOf("Resumo financeiro</h2>") < controlJs.indexOf("<summary>Consultas avançadas</summary>"));
  // prettier-ignore
  assert.match(adminAdapters, /(?=[\s\S]*\$\{adminPrefix\}\/financial\/summary)(?=[\s\S]*paymentsApi\.adminFinancialSummary)(?=[\s\S]*FINANCIAL_SUMMARY_SUPPORT_SCOPE_UNAVAILABLE)/u);
  // prettier-ignore
  const financial = paymentsApi.slice(paymentsApi.indexOf("function createFinancialAdminSummaryReader"), paymentsApi.indexOf("export function createPaymentsApi"));
  // prettier-ignore
  assert.match(financial, /(?=[\s\S]*FROM financial_payments)(?=[\s\S]*FROM financial_reconciliation_findings)/u);
  assert.doesNotMatch(financial, /audit|localStorage|client/iu);

  // prettier-ignore
  assert.match(controlJs, /id="content-create-destination"[\s\S]*id="content-create-kind"[\s\S]*id="content-create-locale"[\s\S]*id="content-create-title"[\s\S]*id="content-create-summary"[\s\S]*<summary>Detalhes avançados<\/summary>[\s\S]*id="content-create-id"[\s\S]*id="content-create-source"/u);
  // prettier-ignore
  assert.match(controlJs, /(?=[\s\S]*api\("\/destinations"\))(?=[\s\S]*createContentDraftToken)(?=[\s\S]*cryptoApi\.randomUUID)(?=[\s\S]*maxLength - token\.length - 1)(?=[\s\S]*idInput\.value = generatedId)(?=[\s\S]*sourceInput\.value = generatedSourceReference)(?=[\s\S]*logicalReferences\.includes\(sourceOverride\))(?=[\s\S]*id="content-create-media-reference")(?=[\s\S]*id="content-revise-media-reference")(?=[\s\S]*id="content-create-preview")(?=[\s\S]*data-content-related="media")(?=[\s\S]*data-content-related="language")(?=[\s\S]*pendingContentCreatePreset)/u);
  // prettier-ignore
  const source = controlJs.slice(controlJs.indexOf("function generatedContentSourceReference"), controlJs.indexOf("let pendingContentCreatePreset"));
  assert.doesNotMatch(source, /\btitle\b|\blocale\b/u);

  // prettier-ignore
  assert.doesNotMatch(controlJs, /CRM owner orchestration|Financial owner|append-only owner events|step-up obrigatório|QR payload|External key|Payment ID|<span class="badge">crm\.manage<\/span>/u);
  // prettier-ignore
  assert.match(controlJs, /class="contract-diagnostic" aria-hidden="true">\$\{escapeHtml\(user\.canonicalRole\)\}<\/span>/u);
});
