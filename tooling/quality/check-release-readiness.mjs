import { readFile } from "node:fs/promises";

const root = process.cwd();

async function text(relativePath) {
  return readFile(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

function fail(message) {
  throw new Error(`Release readiness gate: ${message}`);
}

function requireText(source, label, value) {
  if (!source.includes(value)) fail(`${label} is missing: ${value}`);
}

function forbidText(source, label, value) {
  if (source.includes(value))
    fail(`${label} contains forbidden text: ${value}`);
}

function envBlock(source, key, label) {
  const lines = source.split(/\r?\n/u);
  const start = lines.findIndex((line) => line.trim() === `- key: ${key}`);
  if (start < 0) fail(`${label} is missing environment key ${key}`);
  const block = [];
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index];
    if (index > start && /^\s*- key: /u.test(line)) break;
    block.push(line);
  }
  return block.join("\n");
}

function requireDirective(source, key, directive, label) {
  const block = envBlock(source, key, label);
  requireText(block, `${label} ${key}`, directive);
}

const [production, staging, documentation, server, migration] =
  await Promise.all([
    text("render.yaml"),
    text("render.staging.yaml"),
    text("docs/operations/PRODUCTION-RELEASE-READINESS.md"),
    text("apps/morro-digital-platform/tooling/dev-server.mjs"),
    text("apps/morro-digital-platform/tooling/payments-migrate.mjs"),
  ]);

requireText(production, "production blueprint", "name: morro-digital-v2");
requireText(production, "production blueprint", "runtime: node");
requireText(production, "production blueprint", "healthCheckPath: /readyz");
requireText(production, "production blueprint", "value: production");
requireText(production, "production blueprint", "value: mercado_pago");
requireText(
  server,
  "production runtime",
  'const mercadoPagoWebhookPath = "/api/payments/v1/webhooks/sandbox"',
);
requireText(
  migration,
  "production predeploy",
  'webhookUrl.pathname !== "/api/payments/v1/webhooks/sandbox"',
);
requireDirective(
  production,
  "MERCADO_PAGO_CHECKOUT_MODE",
  "value: test",
  "production blueprint",
);
requireDirective(
  production,
  "PAYMENTS_RUNTIME_REPLICA_COUNT",
  'value: "1"',
  "production blueprint",
);
requireDirective(
  production,
  "PAYMENTS_RATE_LIMIT_DISTRIBUTED_STORE_CONFIGURED",
  'value: "false"',
  "production blueprint",
);

for (const [key, directive] of [
  ["DASHBOARD_AUTH_SECRET", "generateValue: true"],
  ["DASHBOARD_USERS_JSON", "sync: false"],
  ["DASHBOARD_AUTH_ORIGIN", "sync: false"],
  ["AUTH_DATABASE_URL", "sync: false"],
  ["ORDERING_DATABASE_URL", "sync: false"],
  ["FINANCIAL_DATABASE_URL", "sync: false"],
  ["ORDERING_PRICING_CATALOG_JSON", "sync: false"],
  ["PAYMENTS_RETURN_URL_ORIGINS", "sync: false"],
  ["PAYMENTS_STATUS_TOKEN_SECRET", "generateValue: true"],
  ["PAYMENTS_HANDOFF_SECRET", "generateValue: true"],
  ["PAYMENTS_WEBHOOK_URL", "sync: false"],
  ["MERCADO_PAGO_CHECKOUT_ORIGINS", "value: https://sandbox.mercadopago.com"],
  ["VITE_MAPBOX_ACCESS_TOKEN", "sync: false"],
  ["VITE_MAPBOX_STYLE", "sync: false"],
  ["OPENAI_API_KEY", "sync: false"],
]) {
  requireDirective(production, key, directive, "production blueprint");
}
requireDirective(
  production,
  "MERCADO_PAGO_ACCESS_TOKEN",
  "fromService:",
  "production blueprint",
);
requireDirective(
  production,
  "MERCADO_PAGO_WEBHOOK_SECRET",
  "fromService:",
  "production blueprint",
);
forbidText(
  production,
  "production blueprint",
  "MERCADO_PAGO_TEST_CREDENTIALS_CONFIRMED",
);
forbidText(production, "production blueprint", "STAGING_");

requireText(
  staging,
  "staging blueprint",
  "name: morro-digital-v2-staging-mysql",
);
requireText(staging, "staging blueprint", "name: morro-digital-v2-staging");
requireText(staging, "staging blueprint", "runtime: docker");
requireText(staging, "staging blueprint", "runtime: node");
requireText(staging, "staging blueprint", "branch: main");
requireDirective(
  staging,
  "MERCADO_PAGO_CHECKOUT_MODE",
  "value: test",
  "staging blueprint",
);
requireDirective(
  staging,
  "MERCADO_PAGO_TEST_CREDENTIALS_CONFIRMED",
  "sync: false",
  "staging blueprint",
);
requireDirective(
  staging,
  "PAYMENTS_RUNTIME_REPLICA_COUNT",
  'value: "1"',
  "staging blueprint",
);
requireDirective(
  staging,
  "PAYMENTS_RATE_LIMIT_DISTRIBUTED_STORE_CONFIGURED",
  'value: "false"',
  "staging blueprint",
);
requireDirective(
  staging,
  "OPENAI_PROVIDER_HARD_LIMIT_CONFIRMED",
  'value: "false"',
  "staging blueprint",
);
forbidText(staging, "staging blueprint", "name: morro-digital-v2\n");

for (const marker of [
  "PRODUCTION_CANDIDATE_SHA",
  "NO-GO",
  "MERCADO_PAGO_CHECKOUT_MODE=test",
  "A aceitação financeira de produção é um gate separado",
  "backup/restore",
  "rollback target",
]) {
  requireText(documentation, "production readiness documentation", marker);
}

console.log(
  `Release readiness guardrails valid: ${root}; production remains explicitly locked to TEST checkout until an operator-approved cutover, staging is isolated, and secret boundaries are represented out-of-band.`,
);
