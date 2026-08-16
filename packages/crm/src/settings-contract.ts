import { crmActiveFunnelStages, type CrmLeadStage } from "./index.js";

/**
 * Labels frozen from the V1 CRM presentation contract.
 *
 * Keep these labels separate from persistence identifiers: the identifiers in
 * `crmLeadStages` remain the domain authority while this mapping exists only to
 * preserve the user-facing CRM vocabulary during migration.
 */
export const crmLeadStageLabels = Object.freeze({
  new_lead: "Novo Lead",
  first_contact: "Primeiro Contato",
  meeting_scheduled: "Reunião Agendada",
  proposal_sent: "Proposta Enviada",
  trial: "Trial",
  contract_sent: "Contrato Enviado",
  contract_signed: "Contrato Assinado",
  payment_pending: "Pagamento Pendente",
  payment_done: "Pagamento Recebido",
  onboarding: "Onboarding",
  photo_visit_scheduled: "Visita Agendada",
  photo_visit_done: "Visita Realizada",
  published: "Publicado",
  announced: "Divulgado",
  feedback: "Feedback",
  active_client: "Cliente Ativo",
  churned: "Cancelado",
  lost: "Perdido",
} as const satisfies Readonly<Record<CrmLeadStage, string>>);

/**
 * The mutable portion of the frozen V1 Settings page is follow-up automation.
 * These bounds intentionally preserve the V1 browser contract even though the
 * lower-level V2 follow-up boundary accepts a wider operational range.
 */
export const crmSettingsV1Baseline = Object.freeze({
  systemName: "Morro Digital CRM",
  frozenVersion: "1.1.0",
  followUpDefaults: Object.freeze({
    name: "Padrão",
    intervalDays: 3,
    maxAttempts: 5,
    isActive: true,
  }),
  followUpBounds: Object.freeze({
    intervalDays: Object.freeze({ min: 1, max: 30 }),
    maxAttempts: Object.freeze({ min: 1, max: 20 }),
  }),
});

export interface CrmSettingsFunnelStage {
  readonly stage: (typeof crmActiveFunnelStages)[number];
  readonly label: string;
}

export const crmSettingsFunnelStages: readonly CrmSettingsFunnelStage[] =
  Object.freeze(
    crmActiveFunnelStages.map((stage) =>
      Object.freeze({ stage, label: crmLeadStageLabels[stage] }),
    ),
  );
