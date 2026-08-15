import type { Pool } from "mysql2/promise";

import { applyFinancialM145Schema } from "./index.js";
import {
  applyFinancialM146SettlementSchema,
  financialM146SettlementSchemaSql,
} from "./settlement-schema.js";

export {
  MySqlFinancialSettlementRepository,
} from "./mysql-settlement-repository.js";
export {
  SettlementApplicationError,
  createSettlementApplicationService,
  type SettlementApplicationDependencies,
  type SettlementApplicationErrorCode,
  type SettlementApplicationService,
} from "./settlement-application-service.js";
export {
  SandboxSettlementProviderError,
  createSandboxSettlementProviderFromEnvironment,
  type SandboxSettlementEnvironment,
} from "./sandbox-settlement-provider.js";
export {
  applyFinancialM146SettlementSchema,
  financialM146SettlementSchemaSql,
};

export async function applyFinancialM146Schema(pool: Pool): Promise<void> {
  await applyFinancialM145Schema(pool);
  await applyFinancialM146SettlementSchema(pool);
}
