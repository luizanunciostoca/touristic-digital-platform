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
const readback = fs.readFileSync(
  new URL("../render/mysql-production/readback.sh", import.meta.url),
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

function requireActiveLine(source, value, label = value) {
  const found = source
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .some((line) => line === value && !line.startsWith("#"));
  if (!found) {
    throw new Error("Missing production MySQL active directive: " + label);
  }
}

function forbidText(source, value, label = value) {
  if (source.includes(value)) {
    throw new Error("Forbidden production MySQL contract text: " + label);
  }
}

function serviceBlock(name) {
  const lines = blueprint.split(/\r?\n/u);
  const nameIndex = lines.findIndex((line) => line.trim() === "name: " + name);
  if (nameIndex < 0) {
    throw new Error("Missing production MySQL service: " + name);
  }

  let start = nameIndex;
  while (start >= 0 && !/^\s{2}- type: /u.test(lines[start])) start -= 1;
  if (start < 0) {
    throw new Error("Malformed production MySQL service: " + name);
  }

  let end = start + 1;
  while (end < lines.length && !/^\s{2}- type: /u.test(lines[end])) end += 1;
  return lines.slice(start, end).join("\n");
}

const mysqlService = serviceBlock("morro-digital-v2-production-mysql");
const bootstrapService = serviceBlock("morro-digital-v2-production-db-bootstrap");
const webService = serviceBlock("morro-digital-v2");

function envBlock(key) {
  const lines = mysqlService.split(/\r?\n/u);
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

function bootstrapEnvBlock(key) {
  const lines = bootstrapService.split(/\r?\n/u);
  const start = lines.findIndex((line) => line.trim() === "- key: " + key);
  if (start < 0) {
    throw new Error("Missing production bootstrap worker environment key: " + key);
  }
  const block = [];
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index];
    if (index > start && /^\s*- key: /u.test(line)) break;
    block.push(line);
  }
  return block.join("\n");
}

function requireBootstrapDirective(key, directive) {
  const block = bootstrapEnvBlock(key);
  if (!block.split(/\r?\n/u).some((line) => line.trim() === directive)) {
    throw new Error(
      "Missing production bootstrap worker contract: " +
        key +
        " -> " +
        directive,
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
  requireText(mysqlService, required);
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

requireActiveLine(
  dockerfile,
  "FROM golang:1.26.8-bookworm@sha256:a688600ca24f8a4d3ca77f95b0dd40704a9fc787c826660eb7ba0b641b8b175d AS gosu-builder",
  "pinned Go builder image",
);
requireActiveLine(
  dockerfile,
  "ARG GOSU_COMMIT=6456aaa0f3c854d199d0f037f068eb97515b7513",
  "full gosu source commit",
);
requireActiveLine(
  dockerfile,
  "FROM mysql:8.4@sha256:0744ee5ef89ce6ccfa13de3e579fe6b9e27f93dd70da9c06d2c908b1b193fb8d",
  "pinned MySQL 8.4 image",
);
for (const required of [
  "COPY tooling/render/mysql-production/morro-memory.cnf /etc/mysql/conf.d/99-morro-memory.cnf",
  "RUN mysqld --verbose --help >/dev/null",
  "COPY tooling/render/mysql-production/01-init-databases.sh /docker-entrypoint-initdb.d/01-init-databases.sh",
  "COPY tooling/render/mysql-production/readback.sh /usr/local/bin/morro-mysql-readback",
]) {
  requireActiveLine(dockerfile, required);
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
requireText(init, "\\`$database\\`", "escaped SQL database identifier");

for (const required of [
  'CONTRACT="MORRO-PRODUCTION-MYSQL-READBACK"',
  'HOST="${MORRO_MYSQL_READBACK_HOST:-morro-digital-v2-production-mysql}"',
  'PORT="${MORRO_MYSQL_READBACK_PORT:-3306}"',
  'DOMAINS="AUTH AUDIT DESTINATIONS CONTENT BUSINESS ORDERING FINANCIAL TICKETING NOTIFICATIONS AFFILIATES ANALYTICS CRM COMMERCE"',
  "schemaOwners",
  "crossDomainDenied",
  "tableCounts",
  "EXPECTED_SHA",
  'render_git_commit="$(required_env RENDER_GIT_COMMIT)"',
  '[ "$render_git_commit" = "$expected_sha" ]',
  "for target_domain in $DOMAINS",
  '[ "$denied_count" -eq 156 ]',
  "CROSS_DOMAIN_ACCESS_ALLOWED_",
  "information_schema.tables",
]) {
  requireText(readback, required);
}
forbidText(
  readback,
  "MYSQL_ROOT_PASSWORD",
  "readback must use domain owners only",
);
forbidText(readback, "morro_app", "readback must not use shared broad user");
forbidText(
  readback,
  "next_domain()",
  "readback must test the full domain matrix",
);

forbidText(init, "morro_app", "shared broad production database user");

for (const required of [
  "type: worker",
  "name: morro-digital-v2-production-db-bootstrap",
  "runtime: node",
  "repo: https://github.com/luizanunciostoca/touristic-digital-platform",
  "branch: main",
  "region: virginia",
  "plan: starter",
  "autoDeploy: false",
  'startCommand: node -e "setInterval(() => {}, 2147483647)"',
]) {
  requireText(bootstrapService, required, "bootstrap worker " + required);
}

requireBootstrapDirective(
  "PRODUCTION_MYSQL_HOSTPORT",
  "value: morro-digital-v2-production-mysql:3306",
);
for (const [domain] of domains) {
  for (const suffix of ["NAME", "USER", "PASSWORD"]) {
    const key = "PRODUCTION_" + domain + "_DATABASE_" + suffix;
    requireBootstrapDirective(key, "type: pserv");
    requireBootstrapDirective(key, "name: morro-digital-v2-production-mysql");
    requireBootstrapDirective(key, "envVarKey: " + domain + "_DATABASE_" + suffix);
  }
}

forbidText(
  webService,
  "PRODUCTION_MYSQL_HOSTPORT",
  "bootstrap host must not be exposed to production web service",
);
for (const [domain] of domains) {
  for (const suffix of ["NAME", "USER", "PASSWORD"]) {
    forbidText(
      webService,
      "PRODUCTION_" + domain + "_DATABASE_" + suffix,
      "bootstrap owner credentials must not be exposed to production web service",
    );
  }
}

requireText(
  webService,
  "preDeployCommand: node apps/morro-digital-platform/tooling/payments-migrate.mjs",
);
requireText(
  webService,
  "startCommand: node apps/morro-digital-platform/tooling/dev-server.mjs",
);

console.log(
  "Render production MySQL Blueprint contract valid: private Virginia MySQL 8.4, persistent disk, 13 domain owners scoped to the bootstrap worker, no application cutover.",
);
