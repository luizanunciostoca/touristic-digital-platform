#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const repositoryRoot = resolve(new URL("../..", import.meta.url).pathname);
const migrationPath = resolve(
  repositoryRoot,
  "apps/morro-digital-platform/tooling/payments-migrate.mjs",
);
const source = await readFile(migrationPath, "utf8");

const requiredMarkers = [
  "applyOrderingM151Schema",
  "applyOrderingTicketingReservationSchema",
  "applyFinancialM145Schema",
  "createOrderingMySqlPoolFromEnvironment",
  "createFinancialMySqlPoolFromEnvironment",
  'contract: "PAYMENTS-PREDEPLOY"',
  'status: "fail"',
];

const missing = requiredMarkers.filter((marker) => !source.includes(marker));
if (missing.length > 0) {
  throw new Error(`MIGRATION_CONTRACT_MARKERS_MISSING:${missing.join(",")}`);
}

const forbidden = [
  "DROP DATABASE",
  "DROP SCHEMA",
  "TRUNCATE TABLE",
  "DELETE FROM",
];
const unsafe = forbidden.filter((marker) =>
  source.toUpperCase().includes(marker),
);
if (unsafe.length > 0) {
  throw new Error(`MIGRATION_DRY_RUN_UNSAFE_SQL:${unsafe.join(",")}`);
}

process.stdout.write(
  `${JSON.stringify({
    contract: "MIGRATION-DRY-RUN",
    contractVersion: 1,
    status: "pass",
    mode: "static-non-destructive",
    migrationEntryPoint:
      "apps/morro-digital-platform/tooling/payments-migrate.mjs",
    migrations: [
      "ordering:M151",
      "ordering:ticketing-reservation",
      "financial:M145",
    ],
  })}\n`,
);
