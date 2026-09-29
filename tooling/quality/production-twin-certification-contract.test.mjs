import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflowPath = ".github/workflows/production-twin-certification.yml";
const executorPath = "tooling/release/production-twin-certification.sh";
const promotionPath = ".github/workflows/production-oci-promotion.yml";

test("production twin executor is syntactically valid and isolated", () => {
  const syntax = spawnSync("bash", ["-n", executorPath], { encoding: "utf8" });
  assert.equal(syntax.status, 0, syntax.stderr);

  const source = readFileSync(executorPath, "utf8");
  for (const required of [
    'CONTRACT="MORRO-PRODUCTION-TWIN-CERTIFICATION"',
    'IMAGE_REPOSITORY="ghcr.io/luizanunciostoca/morro-digital-v2"',
    'MYSQL_ALIAS="morro-digital-v2-production-mysql"',
    "production-mysql-backup-restore-proof-",
    "production-mysql-backup-restore-evidence.json",
    "production-mysql-backup.sql.gz.enc",
    "openssl enc -d -aes-256-cbc",
    'docker pull "$image_path"',
    "--network-alias "$MYSQL_ALIAS"",
    "production-runtime-database-predeploy.mjs",
    "payments-migrate.mjs",
    "/healthz",
    "/readyz",
    "/api/analytics/v1/events",
    'docker rm -f "$app_container"',
    'persistence:{',
    'survivedRedeploy:true',
    'productionMutation:false',
    'renderMutation:false',
    'railwayTouched:false',
    'paymentsMode:"test"',
    'productionCredentialsConfirmed:false',
    'subscriptionsEnabled:false',
    'plaintextUploaded:false',
  ]) {
    assert.ok(source.includes(required), `missing production twin contract: ${required}`);
  }

  for (const forbidden of [
    "RENDER_PRODUCTION_API_KEY",
    "RAILWAY_",
    "railway.app",
    "api.render.com/v1/services",
    "morro-digital-v2.onrender.com",
    "MERCADO_PAGO_CHECKOUT_MODE=production",
    "MERCADO_PAGO_PRODUCTION_CREDENTIALS_CONFIRMED=true",
    "PAYMENTS_SUBSCRIPTIONS_ENABLED=true",
  ]) {
    assert.ok(!source.includes(forbidden), `unsafe production twin marker: ${forbidden}`);
  }
});

test("production twin workflow is exact-head, encrypted-input and certificate-only", () => {
  const source = readFileSync(workflowPath, "utf8");
  for (const required of [
    "name: Production Twin Certification",
    "confirm_twin:",
    "Type CERTIFY",
    "permissions:",
    "actions: read",
    "packages: read",
    "environment:",
    "name: production",
    "PRODUCTION_MYSQL_DR_ENCRYPTION_KEY_V1",
    "bash tooling/release/production-twin-certification.sh",
    "production-twin-certification-${{ github.run_id }}",
    "production-twin-certification-evidence.json",
    "retention-days: 90",
  ]) {
    assert.ok(source.includes(required), `missing twin workflow contract: ${required}`);
  }

  assert.ok(!source.includes("RENDER_PRODUCTION_API_KEY"));
  assert.ok(!source.includes("RAILWAY_"));
});

test("production cutover requires and reuses a golden digest certificate", () => {
  const source = readFileSync(promotionPath, "utf8");
  for (const required of [
    "production-twin-certification.yml",
    "production-twin-certification-",
    "PRODUCTION_TWIN_CERTIFICATION = PASS",
    ".safety.productionMutation == false",
    ".safety.renderMutation == false",
    ".safety.railwayTouched == false",
    ".safety.productionCredentialsConfirmed == false",
    ".safety.subscriptionsEnabled == false",
    "twinCertification",
  ]) {
    assert.ok(source.includes(required), `missing promotion twin gate: ${required}`);
  }
});
