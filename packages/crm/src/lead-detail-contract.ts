import {
  crmLeadStages,
  type CrmChecklistStep,
  type CrmInteractionType,
  type CrmLeadStage,
} from "./index.js";

export interface CrmLeadDetailChecklistDefinition {
  readonly step: CrmChecklistStep;
  readonly label: string;
  readonly description: string;
}

export interface CrmLeadDetailStageDefinition {
  readonly stage: CrmLeadStage;
  readonly label: string;
}

export const crmLeadDetailStageLabels = Object.freeze({
  new_lead: "Novo lead",
  first_contact: "Primeiro contato",
  meeting_scheduled: "Reunião agendada",
  proposal_sent: "Proposta enviada",
  trial: "Trial",
  contract_sent: "Contrato enviado",
  contract_signed: "Contrato assinado",
  payment_pending: "Pagamento pendente",
  payment_done: "Pagamento concluído",
  onboarding: "Onboarding",
  photo_visit_scheduled: "Visita agendada",
  photo_visit_done: "Visita concluída",
  published: "Publicado",
  announced: "Anunciado",
  feedback: "Feedback",
  active_client: "Cliente ativo",
  churned: "Churn",
  lost: "Perdido",
} satisfies Readonly<Record<CrmLeadStage, string>>);

export const crmLeadDetailStages = Object.freeze(
  crmLeadStages.map((stage) =>
    Object.freeze({ stage, label: crmLeadDetailStageLabels[stage] }),
  ),
) satisfies readonly CrmLeadDetailStageDefinition[];

export const crmLeadDetailChecklist = Object.freeze([
  Object.freeze({
    step: "first_contact",
    label: "Primeiro Contato",
    description: "Mensagem inicial enviada via WhatsApp",
  }),
  Object.freeze({
    step: "meeting_scheduled",
    label: "Reunião Agendada",
    description: "Reunião presencial ou online marcada",
  }),
  Object.freeze({
    step: "meeting_done",
    label: "Reunião Realizada",
    description: "Apresentação do projeto concluída",
  }),
  Object.freeze({
    step: "proposal_sent",
    label: "Proposta Enviada",
    description: "Proposta personalizada enviada ao cliente",
  }),
  Object.freeze({
    step: "proposal_accepted",
    label: "Proposta Aceita",
    description: "Cliente aceitou os termos da proposta",
  }),
  Object.freeze({
    step: "trial_started",
    label: "Trial Iniciado",
    description: "Período de teste ativado para o cliente",
  }),
  Object.freeze({
    step: "contract_drafted",
    label: "Contrato Redigido",
    description: "Contrato elaborado com dados do cliente",
  }),
  Object.freeze({
    step: "contract_sent",
    label: "Contrato Enviado",
    description: "Contrato enviado para assinatura",
  }),
  Object.freeze({
    step: "contract_signed",
    label: "Contrato Assinado",
    description: "Contrato assinado pelo cliente",
  }),
  Object.freeze({
    step: "payment_received",
    label: "Pagamento Recebido",
    description: "Primeiro pagamento confirmado",
  }),
  Object.freeze({
    step: "data_collected",
    label: "Dados Coletados",
    description: "Informações da empresa coletadas para o site",
  }),
  Object.freeze({
    step: "photo_visit_scheduled",
    label: "Visita Fotográfica Agendada",
    description: "Data da visita para fotos marcada",
  }),
  Object.freeze({
    step: "photo_visit_done",
    label: "Visita Fotográfica Realizada",
    description: "Fotos do local produzidas",
  }),
  Object.freeze({
    step: "site_updated",
    label: "Site Atualizado",
    description: "Página da empresa publicada no site",
  }),
  Object.freeze({
    step: "announced",
    label: "Parceria Divulgada",
    description: "Nova parceria anunciada nas redes sociais",
  }),
  Object.freeze({
    step: "feedback_collected",
    label: "Feedback Coletado",
    description: "Avaliação do cliente registrada",
  }),
] as const satisfies readonly CrmLeadDetailChecklistDefinition[]);

export const crmLeadDetailManualInteractionTypes = Object.freeze([
  "note",
  "whatsapp",
  "call",
  "email",
  "meeting",
  "proposal",
  "contract",
  "payment",
  "follow_up",
] as const satisfies readonly CrmInteractionType[]);

export type CrmLeadDetailManualInteractionType =
  (typeof crmLeadDetailManualInteractionTypes)[number];

export const crmLeadDetailInteractionLabels = Object.freeze({
  note: "Nota",
  whatsapp: "WhatsApp",
  call: "Ligação",
  email: "E-mail",
  meeting: "Reunião",
  stage_change: "Mudança de etapa",
  proposal: "Proposta",
  contract: "Contrato",
  payment: "Pagamento",
  follow_up: "Follow-up",
  system: "Sistema",
} satisfies Readonly<Record<CrmInteractionType, string>>);

export function isCrmLeadDetailManualInteractionType(
  value: unknown,
): value is CrmLeadDetailManualInteractionType {
  return (
    typeof value === "string" &&
    (crmLeadDetailManualInteractionTypes as readonly string[]).includes(value)
  );
}
