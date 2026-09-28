import fs from "node:fs";

const blueprint = fs.readFileSync(
  new URL("../../render.yaml", import.meta.url),
  "utf8",
);
const dockerfile = fs.readFileSync(
  new URL("../render/mysql-production/Dockerfile", import.meta.url),
  "utf8",
);
const memory = fs.readFileSync(
  new URL("../render/mysql-production/morro-memory.cnf", import.meta.url),
  "utf8",
);
const init = fs.readFileSync(
  new URL("../render/mysql-production/01-init-databases.sh", import.meta.url),
  "utf8",
);

const domains = [
  ["AUTH", "morro_auth"],
  ["AUDIT", "morro_audit"],
  ["DESTINATIONS", "morro_destinations"],
  ["CONTENT", "morro_content"],
  ["BUSINESS", "morro_business"],
  ["ORDERING", "morro_ordering"],
  ["FINANCIAL", "morro_financial"],
  ["TICKETING", "morro_ticketing"],
  ["NOTIFICATIONS", "morro_notifications"],
  ["AFFILIATES", "morro_affiliates"],
  ["ANALYTICS", "morro_analytics"],
  ["CRM", "morro_crm"],
  ["COMMERCE", "morro_commerce"],
];

function requireText(source, value, label = value) {
  if (!source.includes(value)) {
    throw new Error("Missing production MySQL contract: " + label);
  }
}

function forbidText(source, value, label = value) {
  if (source.includes(value)) {
    throw new Error("Forbidden production MySQL contract text: " + label);
  }
}

function envBlock(key) {
  const lines = blueprint.split(/\r?\n/u);
  const start = lines.findIndex((line) => line.trim() === "- key: " + key);
  if (start < 0) {
    throw new Error("Missing production MySQL environment key: " + key);
  }
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
  if (!block.split(/\r?\n/u).some((line) => line.trim() === directive)) {
    throw new Error(
      "Missing production MySQL contract: " + key + " -> " + directive,
    );
  }
}

for (const required of [
  "type: pserv",
  "name: morro-digital-v2-production-mysql",
  "runtime: docker",
  "repo: https://github.com/luizanunciostoca/touristic-digital-platform",
  "branch: main",
  "region: virginia",
  "plan: starter",
  "autoDeploy: false",
  "dockerfilePath: ./tooling/render/mysql-production/Dockerfile",
  "name: mysql-production-data",
  "mountPath: /var/lib/mysql",
  "sizeGB: 10",
]) {
  requireText(blueprint, required);
}

requireDirective("MYSQL_ROOT_PASSWORD", "generateValue: true");

for (const [domain, database] of domains) {
  requireDirective(domain + "_DATABASE_NAME", "value: " + database);
  requireDirective(domain + "_DATABASE_USER", "value: " + database);
  requireDirective(domain + "_DATABASE_PASSWORD", "generateValue: true");
  requireText(init, "$" + domain + "_DATABASE_NAME");
  requireText(init, "$" + domain + "_DATABASE_USER");
  requireText(init, "$" + domain + "_DATABASE_PASSWORD");
}

for (const required of [
  "FROM mysql:8.4",
  "COPY tooling/render/mysql-production/morro-memory.cnf /etc/mysql/conf.d/99-morro-memory.cnf",
  "/docker-entrypoint-initdb.d/01-init-databases.sh",
  "RUN mysqld --verbose --help >/dev/null",
]) {
  requireText(dockerfile, required);
}

for (const required of [
  "performance_schema=OFF",
  "mysqlx=OFF",
  "innodb_buffer_pool_size=96M",
  "innodb_flush_method=O_DIRECT",
  "max_connections=40",
  "tmp_table_size=8M",
  "max_heap_table_size=8M",
]) {
  requireText(memory, required);
}

for (const required of [
  "CREATE DATABASE IF NOT EXISTS",
  "CREATE USER IF NOT EXISTS",
  "ALTER USER",
  "GRANT ALL PRIVILEGES",
  "utf8mb4_0900_ai_ci",
  "13 canonical schemas and least-privilege owners initialized",
]) {
  requireText(init, required);
}

forbidText(init, "morro_app", "shared broad production database user");

// Phase 1 is infrastructure-only. Do not cut the production app over until
// the new private database has been deployed, inspected, backed up and proven.
for (const forbidden of [
  "PRODUCTION_MYSQL_HOSTPORT",
  "with-production-mysql-env.mjs",
]) {
  forbidText(blueprint, forbidden, "premature production cutover wiring");
}

requireText(
  blueprint,
  "preDeployCommand: node apps/morro-digital-platform/tooling/payments-migrate.mjs",
);
requireText(
  blueprint,
  "startCommand: node apps/morro-digital-platform/tooling/dev-server.mjs",
);

console.log(
  "Render production MySQL Blueprint contract valid: private Virginia MySQL 8.4, persistent disk, 13 domain owners, no application cutover.",
);
