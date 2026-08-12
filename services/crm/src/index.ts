import mysql, { type Pool, type PoolOptions } from "mysql2/promise";

import { CrmContractHttpTransport } from "./contracts-http-transport.js";
import { CrmContractPublicHttpTransport } from "./contracts-public-http-transport.js";
import { CrmFollowUpHttpTransport } from "./followups-http-transport.js";
import {
  CrmFollowUpSchedulerHost,
  createCrmFollowUpSchedulerHost,
} from "./followups-scheduler-host.js";
import { CrmLeadHttpTransport } from "./leads-http-transport.js";
import { CrmMeetingHttpTransport } from "./meetings-http-transport.js";
import { MySqlCrmLeadAuditPort } from "./mysql-audit-port.js";
import { MySqlCrmContractAuditPort } from "./mysql-contracts-audit-port.js";
import { MySqlCrmContractRepository } from "./mysql-contracts-repository.js";
import { MySqlCrmFollowUpAuditPort } from "./mysql-followups-audit-port.js";
import { MySqlCrmFollowUpRepository } from "./mysql-followups-repository.js";
import { MySqlCrmLeadRepository } from "./mysql-leads-repository.js";
import { MySqlCrmMeetingAuditPort } from "./mysql-meetings-audit-port.js";
import { MySqlCrmMeetingRepository } from "./mysql-meetings-repository.js";
import { MySqlCrmProposalAuditPort } from "./mysql-proposals-audit-port.js";
import { MySqlCrmProposalRepository } from "./mysql-proposals-repository.js";
import { MySqlCrmTrialAuditPort } from "./mysql-trials-audit-port.js";
import { MySqlCrmTrialRepository } from "./mysql-trials-repository.js";
import { CrmProposalHttpTransport } from "./proposals-http-transport.js";
import { CrmProposalPublicHttpTransport } from "./proposals-public-http-transport.js";
import { crmM71SchemaSql } from "./schema.js";
import { CrmTrialHttpTransport } from "./trials-http-transport.js";
import { crmM90TrialsSchemaSql } from "./trials-schema.js";

export {
  CrmContractHttpTransport,
  CrmContractPublicHttpTransport,
  CrmFollowUpHttpTransport,
  CrmFollowUpSchedulerHost,
  CrmLeadHttpTransport,
  CrmMeetingHttpTransport,
  CrmProposalHttpTransport,
  CrmProposalPublicHttpTransport,
  CrmTrialHttpTransport,
  MySqlCrmContractAuditPort,
  MySqlCrmContractRepository,
  MySqlCrmFollowUpAuditPort,
  MySqlCrmFollowUpRepository,
  MySqlCrmLeadAuditPort,
  MySqlCrmLeadRepository,
  MySqlCrmMeetingAuditPort,
  MySqlCrmMeetingRepository,
  MySqlCrmProposalAuditPort,
  MySqlCrmProposalRepository,
  MySqlCrmTrialAuditPort,
  MySqlCrmTrialRepository,
  createCrmFollowUpSchedulerHost,
  crmM71SchemaSql,
  crmM90TrialsSchemaSql,
};
export type {
  CreateCrmFollowUpSchedulerHostOptions,
  CrmFollowUpSchedulerHostOptions,
} from "./followups-scheduler-host.js";
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

async function applySqlStatements(pool: Pool, sql: string): Promise<void> {
  for (const statement of sql
    .split(";\n")
    .map((value) => value.trim())
    .filter(Boolean)) {
    await pool.query(statement);
  }
}

export async function applyCrmM71Schema(pool: Pool): Promise<void> {
  await applySqlStatements(pool, crmM71SchemaSql);
}

export async function applyCrmM90Schema(pool: Pool): Promise<void> {
  await applyCrmM71Schema(pool);
  await applySqlStatements(pool, crmM90TrialsSchemaSql);
}
