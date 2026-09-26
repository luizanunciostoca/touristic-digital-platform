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

const [
  production,
  staging,
  documentation,
  server,
  migration,
  dockerfile,
  stagingMysqlDockerfile,
  stagingDrill,
  stagingDrillRunbook,
  stagingMysqlWait,
  stagingMysqlWrapper,
  stagingPredeploy,
] = await Promise.all([
  text("render.yaml"),
  text("render.staging.yaml"),
  text("docs/operations/PRODUCTION-RELEASE-READINESS.md"),
  text("apps/morro-digital-platform/tooling/dev-server.mjs"),
  text("apps/morro-digital-platform/tooling/payments-migrate.mjs"),
  text("Dockerfile"),
  text("tooling/render/mysql-staging/Dockerfile"),
  text("tooling/render/mysql-staging/backup-restore-drill.sh"),
  text("docs/operations/MYSQL-BACKUP-RESTORE-DRILL.md"),
  text("tooling/render/wait-for-staging-mysql.mjs"),
  text("tooling/render/with-staging-mysql-env.mjs"),
  text("apps/morro-digital-platform/tooling/staging-predeploy.mjs"),
]);

requireText(production, "production blueprint", "name: morro-digital-v2");
requireText(production, "production blueprint", "runtime: node");
requireText(production, "production blueprint", "healthCheckPath: /readyz");
requireText(
  dockerfile,
  "production Dockerfile",
  'CMD ["node", "apps/morro-digital-platform/tooling/dev-server.mjs"]',
);
forbidText(
  dockerfile,
  "production Dockerfile",
  'CMD ["node", "apps/morro-digital-platform/dist/browser-entry.js"]',
);
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
requireText(
  migration,
  "production predeploy",
  "validateMercadoPagoProductionCutover(process.env)",
);
requireDirective(
  production,
  "MERCADO_PAGO_CHECKOUT_MODE",
  "value: test",
  "production blueprint",
);
requireDirective(
  production,
  "MERCADO_PAGO_TEST_CREDENTIALS_CONFIRMED",
  "sync: false",
  "production blueprint",
);
requireDirective(
  production,
  "MERCADO_PAGO_PRODUCTION_CREDENTIALS_CONFIRMED",
  'value: "false"',
  "production blueprint",
);
requireDirective(
  production,
  "PAYMENTS_SUBSCRIPTIONS_ENABLED",
  'value: "false"',
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
  ["MERCADO_PAGO_PRODUCTION_AUTHORIZATION_ID", "sync: false"],
  ["VITE_MERCADO_PAGO_PUBLIC_KEY", "sync: false"],
  ["PAYMENTS_SUBSCRIPTION_BACK_URL", "sync: false"],
  ["MERCADO_PAGO_SUBSCRIPTIONS_ACCESS_TOKEN", "sync: false"],
  ["MERCADO_PAGO_SUBSCRIPTIONS_PUBLIC_KEY", "sync: false"],
  ["VITE_MAPBOX_ACCESS_TOKEN", "sync: false"],
  ["VITE_MAPBOX_STYLE", "sync: false"],
  ["OPENAI_API_KEY", "sync: false"],
]) {
  requireDirective(production, key, directive, "production blueprint");
}
requireDirective(
  production,
  "V1_PAYMENT_PROVIDER_API_URL",
  "value: https://api.mercadopago.com",
  "production blueprint",
);
requireDirective(
  production,
  "MERCADO_PAGO_ACCESS_TOKEN",
  "sync: false",
  "production blueprint",
);
requireDirective(
  production,
  "MERCADO_PAGO_WEBHOOK_SECRET",
  "sync: false",
  "production blueprint",
);
forbidText(production, "production blueprint", "fromService:");
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
requireText(
  staging,
  "staging blueprint",
  "preDeployCommand: node tooling/render/with-staging-mysql-env.mjs node apps/morro-digital-platform/tooling/staging-predeploy.mjs",
);
requireText(
  staging,
  "staging blueprint",
  "startCommand: node tooling/render/with-staging-mysql-env.mjs node apps/morro-digital-platform/tooling/dev-server.mjs",
);
for (const marker of [
  '"MORRO-STAGING-PREDEPLOY"',
  '"payments-migrate"',
  '"legacy-commercial-draft-backfill"',
  '"legacy-commercial-place-backfill.mjs"',
  '"--apply"',
  '"STAGING_PREDEPLOY_SERVICE_DENIED"',
]) {
  requireText(stagingPredeploy, "staging predeploy orchestrator", marker);
}

for (const marker of [
  "MORRO-STAGING-MYSQL-WAIT",
  "STAGING_MYSQL_WAIT_SERVICE_DENIED",
  "STAGING_MYSQL_WAIT_TIMEOUT",
]) {
  requireText(stagingMysqlWait, "staging MySQL wait guard", marker);
}
for (const marker of [
  'from "./wait-for-staging-mysql.mjs"',
  "await waitForStagingMysql(process.env)",
  '"MORRO-STAGING-MYSQL-WAIT"',
]) {
  requireText(stagingMysqlWrapper, "staging MySQL runtime wrapper", marker);
}
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
  "MERCADO_PAGO_SUBSCRIPTIONS_CREDENTIAL_ORIGIN",
  "value: test_seller_account",
  "staging blueprint",
);
for (const key of [
  "MERCADO_PAGO_SUBSCRIPTIONS_TEST_SELLER_USER_ID",
  "MERCADO_PAGO_SUBSCRIPTIONS_TEST_SELLER_APPLICATION_ID",
]) {
  requireDirective(staging, key, "sync: false", "staging blueprint");
}
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
requireText(
  stagingMysqlDockerfile,
  "staging MySQL Dockerfile",
  "/usr/local/bin/morro-mysql-backup-restore-drill",
);
for (const marker of [
  'CONTRACT="MYSQL-BACKUP-RESTORE-DRILL"',
  "BACKUP_RESTORE_STAGING_ONLY",
  "DRILL_SOURCE_DATABASE_DENIED",
  "DRILL_BACKUP_TARGET_MUST_NOT_BE_MYSQL_DATA_VOLUME",
  "DRILL_SOURCE_QUIESCED_CONFIRMATION_REQUIRED",
  "DRILL_KEEP_BACKUP",
]) {
  requireText(stagingDrill, "staging MySQL DR executor", marker);
}
for (const marker of [
  "real staging backup/restore drill: **OPEN until executed",
  "production DR drill: **OPEN**",
]) {
  requireText(stagingDrillRunbook, "staging MySQL DR runbook", marker);
}

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
  `Release readiness guardrails valid: ${root}; production remains explicitly locked to TEST checkout, production credentials remain unconfirmed and recurring billing remains disabled until an operator-approved financial cutover.`,
);
