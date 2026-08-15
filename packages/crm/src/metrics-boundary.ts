import type { AuthSessionIdentity } from "@touristic/auth";

import {
  authorizeCrmAccess,
  type CrmAuthorizationReason,
} from "./authorization.js";
import type {
  CrmId,
  CrmInteractionType,
  CrmLeadStage,
  CrmMoney,
} from "./index.js";

export type CrmDashboardFunnelStage = Exclude<CrmLeadStage, "churned" | "lost">;

export interface CrmDashboardStageConversion {
  readonly stage: CrmDashboardFunnelStage;
  readonly count: number;
  readonly conversionRate: number;
}

export interface CrmDashboardRecentLead {
  readonly id: CrmId;
  readonly companyName: string;
  readonly stage: CrmLeadStage;
  readonly createdAt: Date;
}

export interface CrmDashboardRecentInteraction {
  readonly id: CrmId;
  readonly leadId: CrmId;
  readonly type: CrmInteractionType;
  readonly content: string;
  readonly createdAt: Date;
}

export interface CrmDashboardMetrics {
  readonly total: number;
  readonly active: number;
  readonly converted: number;
  readonly lost: number;
  readonly conversionRate: number;
  readonly totalRevenue: CrmMoney;
  readonly stageGroups: Readonly<Record<CrmLeadStage, number>>;
  readonly stageConversion: readonly CrmDashboardStageConversion[];
  readonly recentLeads: readonly CrmDashboardRecentLead[];
  readonly recentInteractions: readonly CrmDashboardRecentInteraction[];
}

export interface CrmMetricsRepository {
  readonly readSnapshot: () => Promise<CrmDashboardMetrics>;
}

export type CrmMetricsBoundaryOperation = "dashboard.metrics.read";

export interface CrmMetricsAuditEvent {
  readonly operation: CrmMetricsBoundaryOperation;
  readonly allowed: boolean;
  readonly reason: CrmAuthorizationReason;
  readonly actorSubject: string | null;
  readonly leadId: null;
}

export interface CrmMetricsAuditPort {
  readonly record: (event: CrmMetricsAuditEvent) => Promise<void>;
}

export type CrmMetricsBoundaryResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: CrmAuthorizationReason };

export class CrmMetricsServerBoundary {
  constructor(
    private readonly repository: CrmMetricsRepository,
    private readonly audit: CrmMetricsAuditPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async read(
    session: AuthSessionIdentity | null,
  ): Promise<CrmMetricsBoundaryResult<CrmDashboardMetrics>> {
    const authorization = authorizeCrmAccess(session, {
      mutation: false,
      nowEpochSeconds: Math.floor(this.now().getTime() / 1000),
    });
    if (!authorization.allowed) {
      await this.audit.record({
        operation: "dashboard.metrics.read",
        allowed: false,
        reason: authorization.reason,
        actorSubject: session?.subject ?? null,
        leadId: null,
      });
      return { ok: false, reason: authorization.reason };
    }

    return { ok: true, value: await this.repository.readSnapshot() };
  }
}
