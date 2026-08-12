import mysql, { type Pool, type PoolOptions } from "mysql2/promise";

import { CrmLeadHttpTransport } from "./leads-http-transport.js";
import { CrmMeetingHttpTransport } from "./meetings-http-transport.js";
import { MySqlCrmLeadAuditPort } from "./mysql-audit-port.js";
import { MySqlCrmLeadRepository } from "./mysql-leads-repository.js";
import { MySqlCrmMeetingAuditPort } from "./mysql-meetings-audit-port.js";
import { MySqlCrmMeetingRepository } from "./mysql-meetings-repository.js";
import { MySqlCrmProposalAuditPort } from "./mysql-proposals-audit-port.js";
import { MySqlCrmProposalRepository } from "./mysql-proposals-repository.js";
import { CrmProposalHttpTransport } from "./proposals-http-transport.js";
import { crmM71SchemaSql } from "./schema.js";

export {
  CrmLeadHttpTransport,
  CrmMeetingHttpTransport,
  CrmProposalHttpTransport,
  MySqlCrmLeadAuditPort,
  MySqlCrmLeadRepository,
  MySqlCrmMeetingAuditPort,
  MySqlCrmMeetingRepository,
  MySqlCrmProposalAuditPort,
  MySqlCrmProposalRepository,
  crmM71SchemaSql,
};
export type {
  CrmHttpRequest,
  CrmHttpResponse,
  CrmTransportAuthPort,
} from "./http-transport.js";

export interface CrmMySqlEnvironment {
  readonly CRM_DATABASE_URL?: string;
}

export function createCrmMySqlPoolFromEnvironment(
  environment: CrmMySqlEnvironment,
): Pool {
  const uri = environment.CRM_DATABASE_URL?.trim();
  if (!uri) throw new Error("CRM_DATABASE_URL is required");
  const options: PoolOptions = {
    uri,
    connectionLimit: 10,
    enableKeepAlive: true,
    decimalNumbers: false,
    timezone: "Z",
  };
  return mysql.createPool(options);
}

export async function applyCrmM71Schema(pool: Pool): Promise<void> {
  for (const statement of crmM71SchemaSql
    .split(";\n")
    .map((value) => value.trim())
    .filter(Boolean)) {
    await pool.query(statement);
  }
}
