import {
  crmActiveFunnelStages,
  crmInteractionTypes,
  crmLeadStages,
  type CrmInteractionType,
  type CrmLeadStage,
  type CrmMoney,
} from "@touristic/crm";
import type {
  CrmDashboardMetrics,
  CrmDashboardRecentInteraction,
  CrmDashboardRecentLead,
  CrmDashboardStageConversion,
  CrmMetricsRepository,
} from "@touristic/crm/metrics-boundary";
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";

interface AggregateRow extends RowDataPacket {
  total: number | string | bigint;
  active: number | string | bigint;
  converted: number | string | bigint;
  lost: number | string | bigint;
  total_revenue: number | string;
}

interface StageCountRow extends RowDataPacket {
  stage: string;
  count: number | string | bigint;
}

interface RecentLeadRow extends RowDataPacket {
  id: number | string | bigint;
  company_name: string;
  stage: string;
  created_at: Date | string;
}

interface RecentInteractionRow extends RowDataPacket {
  id: number | string | bigint;
  lead_id: number | string | bigint;
  type: string;
  content: string;
  created_at: Date | string;
}

function safeCount(value: number | string | bigint): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error("CRM_METRICS_INVALID_COUNT");
  }
  return parsed;
}

function normalizeMoney(value: number | string): CrmMoney {
  const text =
    typeof value === "number"
      ? Number.isFinite(value)
        ? value.toFixed(2)
        : ""
      : value.trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/u.exec(text);
  if (!match?.[1]) throw new Error("CRM_METRICS_INVALID_REVENUE");
  const whole = BigInt(match[1]).toString();
  const fraction = (match[2] ?? "").padEnd(2, "0");
  return `${whole}.${fraction}`;
}

function timestamp(value: Date | string): Date {
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error("CRM_METRICS_INVALID_TIMESTAMP");
  }
  return parsed;
}

function isLeadStage(value: string): value is CrmLeadStage {
  return (crmLeadStages as readonly string[]).includes(value);
}

function isInteractionType(value: string): value is CrmInteractionType {
  return (crmInteractionTypes as readonly string[]).includes(value);
}

function emptyStageGroups(): Record<CrmLeadStage, number> {
  return Object.fromEntries(crmLeadStages.map((stage) => [stage, 0])) as Record<
    CrmLeadStage,
    number
  >;
}

function stageConversion(
  total: number,
  stageGroups: Readonly<Record<CrmLeadStage, number>>,
): readonly CrmDashboardStageConversion[] {
  return crmActiveFunnelStages.map((stage, index) => {
    const count = stageGroups[stage];
    const previousStage = index > 0 ? crmActiveFunnelStages[index - 1] : null;
    const denominator = previousStage ? stageGroups[previousStage] : total;
    return Object.freeze({
      stage,
      count,
      conversionRate:
        denominator > 0 ? Math.round((count / denominator) * 100) : 0,
    });
  });
}

function recentLead(row: RecentLeadRow): CrmDashboardRecentLead {
  const id = safeCount(row.id);
  if (id <= 0 || !row.company_name || !isLeadStage(row.stage)) {
    throw new Error("CRM_METRICS_INVALID_RECENT_LEAD");
  }
  return Object.freeze({
    id,
    companyName: row.company_name,
    stage: row.stage,
    createdAt: timestamp(row.created_at),
  });
}

function recentInteraction(
  row: RecentInteractionRow,
): CrmDashboardRecentInteraction {
  const id = safeCount(row.id);
  const leadId = safeCount(row.lead_id);
  if (
    id <= 0 ||
    leadId <= 0 ||
    !isInteractionType(row.type) ||
    typeof row.content !== "string"
  ) {
    throw new Error("CRM_METRICS_INVALID_RECENT_INTERACTION");
  }
  return Object.freeze({
    id,
    leadId,
    type: row.type,
    content: row.content,
    createdAt: timestamp(row.created_at),
  });
}

async function readConsistentSnapshot(connection: PoolConnection): Promise<{
  readonly aggregateRows: AggregateRow[];
  readonly stageRows: StageCountRow[];
  readonly recentLeadRows: RecentLeadRow[];
  readonly recentInteractionRows: RecentInteractionRow[];
}> {
  await connection.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
  await connection.query("START TRANSACTION READ ONLY");
  try {
    const [aggregateRows] = await connection.execute<AggregateRow[]>(
      `SELECT
         COUNT(*) AS total,
         COALESCE(SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END), 0) AS active,
         COALESCE(SUM(CASE WHEN stage = 'active_client' THEN 1 ELSE 0 END), 0) AS converted,
         COALESCE(SUM(CASE WHEN status = 'lost' OR stage = 'lost' THEN 1 ELSE 0 END), 0) AS lost,
         COALESCE(SUM(CASE WHEN stage = 'active_client' AND monthly_value IS NOT NULL THEN monthly_value ELSE 0 END), 0.00) AS total_revenue
       FROM crm_leads`,
    );
    const [stageRows] = await connection.execute<StageCountRow[]>(
      "SELECT stage, COUNT(*) AS count FROM crm_leads GROUP BY stage",
    );
    const [recentLeadRows] = await connection.execute<RecentLeadRow[]>(
      "SELECT id, company_name, stage, created_at FROM crm_leads ORDER BY created_at DESC, id DESC LIMIT 5",
    );
    const [recentInteractionRows] = await connection.execute<
      RecentInteractionRow[]
    >(
      "SELECT id, lead_id, type, content, created_at FROM crm_interactions ORDER BY created_at DESC, id DESC LIMIT 10",
    );
    await connection.commit();
    return {
      aggregateRows,
      stageRows,
      recentLeadRows,
      recentInteractionRows,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

export class MySqlCrmMetricsRepository implements CrmMetricsRepository {
  constructor(private readonly pool: Pool) {}

  async readSnapshot(): Promise<CrmDashboardMetrics> {
    const connection = await this.pool.getConnection();
    let rows: Awaited<ReturnType<typeof readConsistentSnapshot>>;
    try {
      rows = await readConsistentSnapshot(connection);
    } finally {
      connection.release();
    }

    const aggregate = rows.aggregateRows[0];
    if (!aggregate) throw new Error("CRM_METRICS_AGGREGATE_MISSING");

    const total = safeCount(aggregate.total);
    const active = safeCount(aggregate.active);
    const converted = safeCount(aggregate.converted);
    const lost = safeCount(aggregate.lost);
    if (active > total || converted > total || lost > total) {
      throw new Error("CRM_METRICS_INCONSISTENT_AGGREGATE");
    }

    const stageGroups = emptyStageGroups();
    let groupedTotal = 0;
    for (const row of rows.stageRows) {
      if (!isLeadStage(row.stage)) throw new Error("CRM_METRICS_INVALID_STAGE");
      const count = safeCount(row.count);
      stageGroups[row.stage] = count;
      groupedTotal += count;
    }
    if (groupedTotal !== total) {
      throw new Error("CRM_METRICS_STAGE_TOTAL_MISMATCH");
    }

    return Object.freeze({
      total,
      active,
      converted,
      lost,
      conversionRate: total > 0 ? Math.round((converted / total) * 100) : 0,
      totalRevenue: normalizeMoney(aggregate.total_revenue),
      stageGroups: Object.freeze(stageGroups),
      stageConversion: Object.freeze(stageConversion(total, stageGroups)),
      recentLeads: Object.freeze(rows.recentLeadRows.map(recentLead)),
      recentInteractions: Object.freeze(
        rows.recentInteractionRows.map(recentInteraction),
      ),
    });
  }
}
