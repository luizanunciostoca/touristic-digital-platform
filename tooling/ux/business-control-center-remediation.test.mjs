import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const read = (path) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const p = "apps/morro-digital-platform/";
// prettier-ignore
const [businessHtml,businessCss,businessSurface,controlJs,controlCss,adminAdapters] = [p+"public/business-dashboard.html",p+"public/business-dashboard.css",p+"src/business-dashboard-surface.ts","apps/control-center/public/control-center.js","apps/control-center/public/control-center.css",p+"tooling/admin-domain-adapters.mjs"].map(read);
const mustMatch = (source, ...patterns) =>
  patterns.forEach((pattern) => assert.match(source, pattern));

test("UX585 business/control remediation contract", () => {
  const primary = businessHtml.replace(
    /<span\s+class="contract-diagnostic"\s+hidden\s*>Endpoint ainda não migrado<\/span\s*>/gu,
    "",
  );
  assert.doesNotMatch(
    primary,
    /boundary protegido|endpoints V2|Endpoint ainda não migrado|M50|M51|milestone|migra(?:ção|do)/iu,
  );
  assert.doesNotMatch(businessSurface, /\?\?\s*moduleId/u);
  // prettier-ignore
  mustMatch(businessHtml,/data-empty-state="empty"/u,/data-empty-state="unavailable"/u,/data-empty-state="not-enabled"/u);
  assert.match(
    businessCss,
    /\.live-indicator\[data-state="unavailable"\] \.live-dot,[\s\S]*?background:\s*#64748b/u,
  );
  // prettier-ignore
  mustMatch(controlCss,/\.form-grid input,/u,/min-height:\s*44px/u,/focus-visible/u,/aria-invalid/u,/html\[data-theme="dark"\]/u);
  // prettier-ignore
  mustMatch(controlJs,/Nenhum usuário encontrado/u,/Nenhum afiliado encontrado/u,/Nenhuma reserva encontrada/u,/id="affiliate-search-empty"/u);
  assert.doesNotMatch(controlJs, /<details class="technical-details" open>/u);
  assert.ok(
    controlJs.indexOf("Resumo financeiro</h2>") <
      controlJs.indexOf("<summary>Consultas avançadas</summary>"),
  );
  // prettier-ignore
  mustMatch(adminAdapters,/\/financial\/summary/u,/paymentsApi\.adminFinancialSummary/u,/FINANCIAL_SUMMARY_SUPPORT_SCOPE_UNAVAILABLE/u);
  // prettier-ignore
  mustMatch(controlJs,/state\.adminSession = await api\("\/session"\)/u,/const supportActive = Boolean\(state\.adminSession\?\.support\)/u,/id="content-create-destination"[\s\S]*id="content-create-kind"[\s\S]*id="content-create-locale"[\s\S]*id="content-create-title"[\s\S]*id="content-create-summary"[\s\S]*<summary>Detalhes avançados<\/summary>/u);
  // prettier-ignore
  mustMatch(controlJs,/api\("\/destinations"\)/u,/createContentDraftToken/u,/idInput\.value = generatedId/u,/sourceInput\.value = generatedSourceReference/u,/logicalReferences\.includes\(sourceOverride\)/u,/id="content-create-media-reference"/u,/id="content-revise-media-reference"/u,/id="content-create-preview"/u,/pendingContentCreatePreset/u);
  const logical = controlJs.slice(
    controlJs.indexOf("function generatedContentSourceReference"),
    controlJs.indexOf("let pendingContentCreatePreset"),
  );
  assert.doesNotMatch(logical, /\btitle\b|\blocale\b/u);
  assert.doesNotMatch(
    controlJs,
    /CRM owner orchestration|Financial owner|append-only owner events|step-up obrigatório|QR payload|External key|Payment ID|<span class="badge">crm\.manage<\/span>/u,
  );
});
