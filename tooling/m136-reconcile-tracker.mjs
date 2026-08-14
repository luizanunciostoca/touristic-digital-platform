#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";

const path = "docs/migration/MASTER-MIGRATION-TRACKER.md";
let content = readFileSync(path, "utf8");

const lines = content.split("\n");
const rowIndex = lines.findIndex((line) => line.startsWith("| MIG-0010 |"));
if (rowIndex < 0) throw new Error("MIG-0010 row not found");
lines[rowIndex] =
  "| MIG-0010 | pagamentos/assinaturas | Ordering / Financial | FEATURE-0009 | `@touristic/ordering` + `@touristic/financial` | 8 | migrating | domínio/ports executáveis em M136; checkout/browser/provider ainda não implementados | 34 contratos: 3 PASS / 15 PARTIAL / 15 GAP / 1 N/A; Order, Money, Payment, idempotência, provider ports, ledger balanceado e eventos versionados agora têm evidência executável | `PAYMENTS-V1-BASELINE.md`; `PAYMENTS-MIGRATION-MATRIX.md`; `PAYMENTS-M135-EVIDENCE.md`; `PAYMENTS-M136-EVIDENCE.md` | crítico |";
content = lines.join("\n");

const startMarker = "## Payments baseline congelada — MIG-0010";
const endMarker = "## Evidência consolidada — checkpoint Home + Runtime + Geospatial";
const start = content.indexOf(startMarker);
const end = content.indexOf(endMarker);
if (start < 0 || end < 0 || end <= start) {
  throw new Error("Payments tracker section markers not found");
}

const section = `## Payments em migração — MIG-0010

M135 congelou a Wave 8 a partir da V1 \`luizidebook/morro-de-sao-paulo-digital@60746fd7fed97b805758b37adfdbe3bad2582bfe\` e separou Business, Ordering e Financial sem habilitar money movement.

M136 materializa os packages framework-independent:

\`\`\`text
@touristic/ordering
@touristic/financial
\`\`\`

O núcleo agora possui evidência executável para:

- \`Money\` em minor units inteiras e moeda normalizada, sem autoridade financeira baseada em decimal floating-point;
- identidades tipadas de Order, Payment, Ledger e Financial events;
- request key lógica \`business:<sessionId>:<planId>\` separada da idempotência financeira \`payment:v1:<orderReference>\`;
- pricing quote/snapshot server-authoritative e versionado;
- lifecycle fail-closed de Order e Payment;
- repository/pricing/idempotency/provider/webhook ports;
- ledger double-entry que rejeita postings desbalanceados, zero, cross-currency e overflow;
- eventos \`OrderPlaced v1\`, \`PaymentApproved v1\` e \`PaymentRefunded v1\` provider-agnostic.

A matriz canônica M136 é:

\`\`\`text
PASS      3
PARTIAL  15
GAP      15
N/A       1
TOTAL    34
\`\`\`

\`MIG-0010\` e \`FEATURE-0009\` avançam para \`migrating\`, mas equivalence behavior/visual/API permanece \`false\`. M136 **não** adiciona provider, SDK financeiro, HTTP route, database adapter, webhook endpoint, public token, browser checkout ou transação monetária real.

A direção de dependências permanece:

\`\`\`text
Business → Ordering → Financial public contracts
                    ↘ provider ports (future adapters)
Financial ↛ Business/UI/provider SDK
\`\`\`

O próximo milestone M137 deve implementar persistência durable server-side para Order, Payment, atomic idempotency claims e append-only Ledger transactions, com constraints, transações, parameterized access, schema evolution e rollback. Nenhuma chamada real a provider deve existir antes dessa base.

Affiliates continua bloqueado até Payment/Ledger autoritativos e reversíveis estarem persistidos, pois comissão/payout deve consumir eventos financeiros confiáveis em vez de inferir conversão pelo browser.

`;

content = content.slice(0, start) + section + content.slice(end);
writeFileSync(path, content);
console.log("M136 master tracker reconciled.");
