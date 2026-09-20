import fs from "node:fs";

const blueprint = fs.readFileSync(
  new URL("../../render.staging.yaml", import.meta.url),
  "utf8",
);
const mysqlDockerfile = fs.readFileSync(
  new URL("../render/mysql-staging/Dockerfile", import.meta.url),
  "utf8",
);
const mysqlInit = fs.readFileSync(
  new URL("../render/mysql-staging/01-init-databases.sh", import.meta.url),
  "utf8",
);
const mysqlDrill = fs.readFileSync(
  new URL("../render/mysql-staging/backup-restore-drill.sh", import.meta.url),
  "utf8",
);
const mysqlDrillRunbook = fs.readFileSync(
  new URL(
    "../../docs/operations/MYSQL-BACKUP-RESTORE-DRILL.md",
    import.meta.url,
  ),
  "utf8",
);
const mysqlWait = fs.readFileSync(
  new URL("../render/wait-for-staging-mysql.mjs", import.meta.url),
  "utf8",
);
const runbook = fs.readFileSync(
  new URL("../../docs/deployment/RENDER-STAGING-V2.md", import.meta.url),
  "utf8",
);
const mercadoPagoProvider = fs.readFileSync(
  new URL(
    "../../services/financial/src/mercado-pago-provider.ts",
    import.meta.url,
  ),
  "utf8",
);

function requireText(source, text, label = text) {
  if (!source.includes(text))
    throw new Error(`Missing staging contract: ${label}`);
}

function forbidText(source, text, label = text) {
  if (source.includes(text))
    throw new Error(`Forbidden staging contract text: ${label}`);
}

function envBlock(key) {
  const lines = blueprint.split(/\r?\n/u);
  const start = lines.findIndex((line) => line.trim() === `- key: ${key}`);
  if (start < 0) throw new Error(`Missing staging environment key: ${key}`);
  const block = [];
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index];
    if (index > start && /^\s*- key: /u.test(line)) break;
    block.push(line);
  }
  return block.join("\n");
}

function requireDirective(key, directive) {
  const block = envBlock(key);
  requireText(block, directive, `${key} -> ${directive}`);
}

for (const forbidden of [
  "luizidebook",
  "morro-de-sao-paulo-digital",
  "audit/business-flow-main-synced-2026-08",
  "npx prisma migrate deploy",
  "healthCheckPath: /api/health",
  "runtime: postgres",
  "fromDatabase:",
  "corepack enable && corepack prepare",
]) {
  forbidText(blueprint, forbidden);
}

for (const required of [
  "name: morro-digital-v2-staging-mysql",
  "type: pserv",
  "runtime: docker",
  "repo: https://github.com/luizanunciostoca/touristic-digital-platform",
  "branch: main",
  "region: ohio",
  "dockerfilePath: ./tooling/render/mysql-staging/Dockerfile",
  "mountPath: /var/lib/mysql",
  "name: morro-digital-v2-staging",
  "runtime: node",
  "buildCommand: corepack pnpm install --frozen-lockfile && corepack pnpm build",
  "preDeployCommand: node tooling/render/wait-for-staging-mysql.mjs && node tooling/render/with-staging-mysql-env.mjs node apps/morro-digital-platform/tooling/payments-migrate.mjs",
  "startCommand: node tooling/render/wait-for-staging-mysql.mjs && node tooling/render/with-staging-mysql-env.mjs node apps/morro-digital-platform/tooling/dev-server.mjs",
  "healthCheckPath: /readyz",
  "value: https://api.mercadopago.com",
  "value: https://www.mercadopago.com,https://www.mercadopago.com.br",
  "value: mapbox://styles/mapbox/streets-v12",
]) {
  requireText(blueprint, required);
}

for (const required of [
  "MORRO-STAGING-MYSQL-WAIT",
  "STAGING_MYSQL_WAIT_SERVICE_DENIED",
  "STAGING_MYSQL_WAIT_TIMEOUT",
  "300_000",
]) {
  requireText(mysqlWait, required);
}

for (const required of [
  "MERCADO_PAGO_TEST_CREDENTIALS_CONFIRMED",
  "requireMercadoPagoTestCredentialsConfirmation(environment);",
  "payload.init_point",
  "MERCADO_PAGO_TEST_ACCOUNT_REQUIRED",
]) {
  requireText(mercadoPagoProvider, required);
}
for (const obsolete of [
  'new URL("users/me", mercadoLivreApiBaseUrl)',
  'tags.includes("test_user")',
  "mercadoLivreApiBaseUrl",
]) {
  forbidText(mercadoPagoProvider, obsolete);
}
forbidText(
  mercadoPagoProvider,
  "payload.sandbox_init_point",
  "legacy sandbox_init_point selection",
);

const autoDeployDisabled = blueprint.match(/autoDeploy: false/gu)?.length ?? 0;
if (autoDeployDisabled !== 2) {
  throw new Error(
    `Expected autoDeploy disabled on both staging services, found ${autoDeployDisabled}`,
  );
}

for (const key of [
  "MYSQL_ROOT_PASSWORD",
  "AUTH_DATABASE_PASSWORD",
  "ORDERING_DATABASE_PASSWORD",
  "FINANCIAL_DATABASE_PASSWORD",
  "AFFILIATES_DATABASE_PASSWORD",
  "DASHBOARD_AUTH_SECRET",
  "PAYMENTS_STATUS_TOKEN_SECRET",
  "PAYMENTS_HANDOFF_SECRET",
]) {
  requireDirective(key, "generateValue: true");
}

for (const key of [
  "DASHBOARD_USERS_JSON",
  "DASHBOARD_AUTH_ORIGIN",
  "ORDERING_PRICING_CATALOG_JSON",
  "PAYMENTS_RETURN_URL_ORIGINS",
  "MERCADO_PAGO_ACCESS_TOKEN",
  "MERCADO_PAGO_TEST_CREDENTIALS_CONFIRMED",
  "MERCADO_PAGO_SUBSCRIPTIONS_TEST_SELLER_USER_ID",
  "MERCADO_PAGO_SUBSCRIPTIONS_TEST_SELLER_APPLICATION_ID",
  "MERCADO_PAGO_WEBHOOK_SECRET",
  "PAYMENTS_WEBHOOK_URL",
  "VITE_MERCADO_PAGO_PUBLIC_KEY",
  "VITE_MAPBOX_ACCESS_TOKEN",
  "OPENAI_API_KEY",
]) {
  requireDirective(key, "sync: false");
}

for (const key of [
  "STAGING_MYSQL_HOSTPORT",
  "STAGING_AUTH_DATABASE_NAME",
  "STAGING_AUTH_DATABASE_USER",
  "STAGING_AUTH_DATABASE_PASSWORD",
  "STAGING_ORDERING_DATABASE_NAME",
  "STAGING_ORDERING_DATABASE_USER",
  "STAGING_ORDERING_DATABASE_PASSWORD",
  "STAGING_FINANCIAL_DATABASE_NAME",
  "STAGING_FINANCIAL_DATABASE_USER",
  "STAGING_FINANCIAL_DATABASE_PASSWORD",
  "STAGING_AFFILIATES_DATABASE_NAME",
  "STAGING_AFFILIATES_DATABASE_USER",
  "STAGING_AFFILIATES_DATABASE_PASSWORD",
]) {
  requireDirective(key, "fromService:");
  requireDirective(key, "name: morro-digital-v2-staging-mysql");
}

requireDirective("STAGING_MYSQL_HOSTPORT", "property: hostport");

for (const [key, expected] of [
  ["PAYMENTS_PROVIDER_MODE", "value: mercado_pago"],
  ["MERCADO_PAGO_CHECKOUT_MODE", "value: test"],
  [
    "MERCADO_PAGO_SUBSCRIPTIONS_CREDENTIAL_ORIGIN",
    "value: test_seller_account",
  ],
  ["PAYMENTS_SUBSCRIPTIONS_ENABLED", 'value: "true"'],
  [
    "PAYMENTS_SUBSCRIPTION_BACK_URL",
    "value: https://morro-digital-v2-staging.onrender.com/",
  ],
  ["PAYMENTS_RUNTIME_REPLICA_COUNT", 'value: "1"'],
  ["PAYMENTS_RATE_LIMIT_DISTRIBUTED_STORE_CONFIGURED", 'value: "false"'],
  ["DASHBOARD_ADMIN_GLOBAL_BYPASS_CONFIRMED", 'value: "false"'],
  ["OPENAI_PROVIDER_HARD_LIMIT_CONFIRMED", 'value: "false"'],
]) {
  requireDirective(key, expected);
}

for (const domain of ["AUTH", "ORDERING", "FINANCIAL", "AFFILIATES"]) {
  requireText(mysqlInit, `\${${domain}_DATABASE_NAME}`);
  requireText(mysqlInit, `\${${domain}_DATABASE_USER}`);
  requireText(mysqlInit, `\${${domain}_DATABASE_PASSWORD}`);
}

requireText(mysqlDockerfile, "FROM mysql:8.4");
requireText(
  mysqlDockerfile,
  "/docker-entrypoint-initdb.d/01-init-databases.sh",
);
requireText(mysqlDockerfile, "/usr/local/bin/morro-mysql-backup-restore-drill");

for (const required of [
  'CONTRACT="MYSQL-BACKUP-RESTORE-DRILL"',
  "BACKUP_RESTORE_STAGING_ONLY",
  "DRILL_BACKUP_TARGET_MUST_NOT_BE_MYSQL_DATA_VOLUME",
  "DRILL_SOURCE_DATABASE_DENIED",
  "DRILL_RESTORE_DATABASE_NAME_DENIED",
  "DRILL_SOURCE_QUIESCED_CONFIRMATION_REQUIRED",
  "DRILL_KEEP_BACKUP",
]) {
  requireText(mysqlDrill, required);
}

for (const required of [
  "real staging backup/restore drill: **OPEN until executed",
  "production RPO/RTO",
  "must never be reported as a successful live restore",
]) {
  requireText(mysqlDrillRunbook, required);
}

for (const required of [
  "morro-digital-staging",
  "luizidebook/morro-de-sao-paulo-digital",
  "fa7bedb5896f8c3327589e737ef51f879bfe59d8",
  "CI_VERIFIED / STAGING_INFRA_PREPARED / STAGING_VERIFICATION_REQUIRED",
  "MERCADO_PAGO_CHECKOUT_MODE=test",
  "PAYMENTS_SUBSCRIPTIONS_ENABLED=true",
  "VITE_MERCADO_PAGO_PUBLIC_KEY",
]) {
  requireText(runbook, required);
}

console.log(
  "Render staging Blueprint contract valid: canonical repo/main, isolated MySQL 8.4, autoDeploy off, explicit Mercado Pago TEST Bricks/subscriptions configuration, legacy staging preserved.",
);
