import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (p) =>
  readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const root = "apps/morro-digital-platform/";
/* prettier-ignore */
const [bh,bc,bs,cc,css,ad,pa] = [root+"public/business-dashboard.html",root+"public/business-dashboard.css",root+"src/business-dashboard-surface.ts","apps/control-center/public/control-center.js","apps/control-center/public/control-center.css",root+"tooling/admin-domain-adapters.mjs",root+"tooling/payments-api.mjs"].map(read);
const has = (s, ...xs) => xs.forEach((x) => assert.match(s, x));

test("UX585 business/control remediation contract", () => {
  const primary = bh.replace(
    /<span\s+class="contract-diagnostic"\s+hidden\s*>Endpoint ainda não migrado<\/span\s*>/gu,
    "",
  );
  /* prettier-ignore */
  assert.doesNotMatch(primary,/boundary protegido|endpoints V2|Endpoint ainda não migrado|M50|M51|milestone|migra(?:ção|do)/iu);
  has(bs, /morroProModulePolicies/u, /data-module-help/u);
  assert.doesNotMatch(bs, /\?\?\s*moduleId/u);
  has(
    bh,
    /data-empty-state="empty"/u,
    /data-empty-state="unavailable"/u,
    /data-empty-state="not-enabled"/u,
    /data-state="unavailable"/u,
  );
  assert.match(
    bc,
    /\.live-indicator\[data-state="unavailable"\] \.live-dot,[\s\S]*?background:\s*#64748b/u,
  );
  has(
    css,
    /\.form-grid input,\s*\.form-grid select,\s*\.form-grid textarea/u,
    /min-height:\s*44px/u,
    /html\[data-theme="dark"\] \.form-grid \[aria-invalid="true"\]/u,
    /:focus-within > :not\(summary\)/u,
  );
  has(
    cc,
    /Nenhum usuário encontrado/u,
    /Nenhum afiliado encontrado/u,
    /Nenhuma reserva encontrada/u,
    /id="affiliate-search-empty"/u,
  );
  assert.doesNotMatch(cc, /<details class="technical-details" open>/u);
  assert.ok(
    cc.indexOf("Resumo financeiro</h2>") <
      cc.indexOf("<summary>Consultas avançadas</summary>"),
  );
  has(
    ad,
    /\$\{adminPrefix\}\/financial\/summary/u,
    /paymentsApi\.adminFinancialSummary/u,
    /FINANCIAL_SUMMARY_SUPPORT_SCOPE_UNAVAILABLE/u,
  );
  const projection = pa.slice(
    pa.indexOf("function createFinancialAdminSummaryReader"),
    pa.indexOf("export function createPaymentsApi"),
  );
  has(
    projection,
    /FROM financial_payments/u,
    /FROM financial_reconciliation_findings/u,
  );
  assert.doesNotMatch(projection, /audit|localStorage|client/iu);
  /* prettier-ignore */
  assert.match(cc,/id="content-create-destination"[\s\S]*id="content-create-kind"[\s\S]*id="content-create-locale"[\s\S]*id="content-create-title"[\s\S]*id="content-create-summary"[\s\S]*<summary>Detalhes avançados<\/summary>[\s\S]*id="content-create-id"[\s\S]*id="content-create-source"/u);
  has(
    cc,
    /api\("\/destinations"\)/u,
    /api\("\/system"\)/u,
    /createContentDraftToken/u,
    /cryptoApi\.randomUUID/u,
    /idInput\.value = generatedId/u,
    /sourceInput\.value = generatedSourceReference/u,
    /logicalReferences\.includes\(sourceOverride\)/u,
    /id="content-create-media-reference"/u,
    /id="content-revise-media-reference"/u,
    /id="content-create-preview"/u,
    /pendingContentCreatePreset/u,
    /targetHash/u,
    /state\.adminSession = await api\("\/session"\)/u,
    /const supportActive = Boolean\(state\.adminSession\?\.support\)/u,
  );
  const logical = cc.slice(
    cc.indexOf("function generatedContentSourceReference"),
    cc.indexOf("let pendingContentCreatePreset"),
  );
  assert.doesNotMatch(logical, /\btitle\b|\blocale\b/u);
  /* prettier-ignore */
  assert.doesNotMatch(cc,/CRM owner orchestration|Financial owner|append-only owner events|step-up obrigatório|QR payload|External key|Payment ID|<span class="badge">crm\.manage<\/span>/u);
  assert.match(
    cc,
    /class="contract-diagnostic" aria-hidden="true">\$\{escapeHtml\(user\.canonicalRole\)\}<\/span>/u,
  );
});
