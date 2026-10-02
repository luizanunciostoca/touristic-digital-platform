import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const read = (p) =>
  readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const [bh, bc, bs, cc, css, ad, pa] = [
  "apps/morro-digital-platform/public/business-dashboard.html",
  "apps/morro-digital-platform/public/business-dashboard.css",
  "apps/morro-digital-platform/src/business-dashboard-surface.ts",
  "apps/control-center/public/control-center.js",
  "apps/control-center/public/control-center.css",
  "apps/morro-digital-platform/tooling/admin-domain-adapters.mjs",
  "apps/morro-digital-platform/tooling/payments-api.mjs",
].map(read);
const must = (s, ps) => ps.forEach((p) => assert.match(s, p));
test("UX585 business/control remediation contract", () => {
  const primary = bh.replace(
    /<span\s+class="contract-diagnostic"\s+hidden\s*>Endpoint ainda não migrado<\/span\s*>/gu,
    "",
  );
  assert.doesNotMatch(
    primary,
    /boundary protegido|endpoints V2|Endpoint ainda não migrado|M50|M51|milestone|migra(?:ção|do)/iu,
  );
  must(bs, [/morroProModulePolicies/u, /data-module-help/u]);
  assert.doesNotMatch(bs, /\?\?\s*moduleId/u);
  must(bh, [
    /data-empty-state="empty"/u,
    /data-empty-state="unavailable"/u,
    /data-empty-state="not-enabled"/u,
    /data-state="unavailable"/u,
  ]);
  assert.match(
    bc,
    /\.live-indicator\[data-state="unavailable"\] \.live-dot,[\s\S]*?background:\s*#64748b/u,
  );
  must(css, [
    /\.form-grid input,\s*\.form-grid select,\s*\.form-grid textarea/u,
    /min-height:\s*44px/u,
    /html\[data-theme="dark"\] \.form-grid \[aria-invalid="true"\]/u,
  ]);
  must(cc, [
    /Nenhum usuário encontrado/u,
    /Nenhum afiliado encontrado/u,
    /Nenhuma reserva encontrada/u,
    /id="affiliate-search-empty"/u,
  ]);
  assert.doesNotMatch(cc, /<details class="technical-details" open>/u);
  const summary = cc.indexOf("Resumo financeiro</h2>"),
    advanced = cc.indexOf("<summary>Consultas avançadas</summary>");
  assert.ok(summary >= 0 && advanced > summary);
  must(ad, [
    /\$\{adminPrefix\}\/financial\/summary/u,
    /paymentsApi\.adminFinancialSummary/u,
    /FINANCIAL_SUMMARY_SUPPORT_SCOPE_UNAVAILABLE/u,
  ]);
  const a = pa.indexOf("function createFinancialAdminSummaryReader"),
    projection = pa.slice(
      a,
      pa.indexOf("export function createPaymentsApi", a),
    );
  must(projection, [
    /FROM financial_payments/u,
    /FROM financial_reconciliation_findings/u,
  ]);
  assert.doesNotMatch(projection, /audit|localStorage|client/iu);
  let last = -1;
  for (const m of [
    'id="content-create-destination"',
    'id="content-create-kind"',
    'id="content-create-locale"',
    'id="content-create-title"',
    'id="content-create-summary"',
    "<summary>Detalhes avançados</summary>",
    'id="content-create-id"',
    'id="content-create-source"',
  ]) {
    const n = cc.indexOf(m);
    assert.ok(n > last, m);
    last = n;
  }
  must(cc, [
    /api\("\/destinations"\)/u,
    /api\("\/system"\)/u,
    /createContentDraftToken/u,
    /cryptoApi\.randomUUID/u,
    /id="content-create-media-reference"/u,
    /id="content-revise-media-reference"/u,
    /id="content-create-preview"/u,
    /pendingContentCreatePreset/u,
    /targetHash/u,
    /state\.adminSession = await api\("\/session"\)/u,
  ]);
  const sr = cc.slice(
    cc.indexOf("function generatedContentSourceReference"),
    cc.indexOf("let pendingContentCreatePreset"),
  );
  assert.doesNotMatch(sr, /\btitle\b|\blocale\b/u);
  for (const x of [
    "CRM owner orchestration",
    "Financial owner",
    "append-only owner events",
    "step-up obrigatório",
    "QR payload",
    "External key",
    "Payment ID",
  ])
    assert.equal(cc.includes(x), false, x);
});
