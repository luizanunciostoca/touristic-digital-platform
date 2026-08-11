export const crmLeadStages = Object.freeze([
  "new_lead",
  "first_contact",
  "meeting_scheduled",
  "proposal_sent",
  "trial",
  "contract_sent",
  "contract_signed",
  "payment_pending",
  "payment_done",
  "onboarding",
  "photo_visit_scheduled",
  "photo_visit_done",
  "published",
  "announced",
  "feedback",
  "active_client",
  "churned",
  "lost",
] as const);

export type CrmLeadStage = (typeof crmLeadStages)[number];

export const crmActiveFunnelStages = Object.freeze([
  "new_lead",
  "first_contact",
  "meeting_scheduled",
  "proposal_sent",
  "trial",
  "contract_sent",
  "contract_signed",
  "payment_pending",
  "payment_done",
  "onboarding",
  "photo_visit_scheduled",
  "photo_visit_done",
  "published",
  "announced",
  "feedback",
  "active_client",
] as const satisfies readonly CrmLeadStage[]);

export const crmTerminalLeadStages = Object.freeze([
  "churned",
  "lost",
] as const satisfies readonly CrmLeadStage[]);

export const crmChecklistSteps = Object.freeze([
  "first_contact",
  "meeting_scheduled",
  "meeting_done",
  "proposal_sent",
  "proposal_accepted",
  "trial_started",
  "contract_drafted",
  "contract_sent",
  "contract_signed",
  "payment_received",
  "data_collected",
  "photo_visit_scheduled",
  "photo_visit_done",
  "site_updated",
  "announced",
  "feedback_collected",
] as const);

export type CrmChecklistStep = (typeof crmChecklistSteps)[number];

export const crmLeadStatuses = Object.freeze([
  "active",
  "inactive",
  "lost",
] as const);
export type CrmLeadStatus = (typeof crmLeadStatuses)[number];

export const crmMeetingModalities = Object.freeze([
  "in_person",
  "online",
] as const);
export type CrmMeetingModality = (typeof crmMeetingModalities)[number];

export const crmMeetingStatuses = Object.freeze([
  "scheduled",
  "done",
  "cancelled",
  "no_show",
] as const);
export type CrmMeetingStatus = (typeof crmMeetingStatuses)[number];

export const crmProposalStatuses = Object.freeze([
  "draft",
  "sent",
  "viewed",
  "accepted",
  "rejected",
] as const);
export type CrmProposalStatus = (typeof crmProposalStatuses)[number];

export const crmContractStatuses = Object.freeze([
  "draft",
  "sent",
  "signed",
  "cancelled",
] as const);
export type CrmContractStatus = (typeof crmContractStatuses)[number];

export const crmInteractionTypes = Object.freeze([
  "note",
  "whatsapp",
  "call",
  "email",
  "meeting",
  "stage_change",
  "proposal",
  "contract",
  "payment",
  "follow_up",
  "system",
] as const);
export type CrmInteractionType = (typeof crmInteractionTypes)[number];

export const crmFollowUpStatuses = Object.freeze([
  "pending",
  "sent",
  "responded",
  "skipped",
] as const);
export type CrmFollowUpStatus = (typeof crmFollowUpStatuses)[number];

export const crmTrialStatuses = Object.freeze([
  "active",
  "expired",
  "converted",
  "cancelled",
] as const);
export type CrmTrialStatus = (typeof crmTrialStatuses)[number];

export const crmReferralStatuses = Object.freeze([
  "pending",
  "contacted",
  "converted",
  "lost",
] as const);
export type CrmReferralStatus = (typeof crmReferralStatuses)[number];

export const crmSegments = Object.freeze([
  "Pousada / Hotel",
  "Restaurante / Bar",
  "Passeio / Turismo",
  "Comércio",
  "Serviços",
  "Imobiliária",
  "Saúde / Beleza",
  "Educação",
  "Outro",
] as const);
export type CrmSegment = (typeof crmSegments)[number];

export type CrmId = number;
export type CrmTimestamp = Date;
export type CrmMoney = string;

export interface CrmLead {
  readonly id: CrmId;
  readonly companyName: string;
  readonly segment: string | null;
  readonly contactName: string | null;
  readonly phone: string | null;
  readonly whatsapp: string | null;
  readonly email: string | null;
  readonly address: string | null;
  readonly website: string | null;
  readonly notes: string | null;
  readonly stage: CrmLeadStage;
  readonly status: CrmLeadStatus;
  readonly source: string | null;
  readonly referredById: CrmId | null;
  readonly assignedToId: CrmId | null;
  readonly monthlyValue: CrmMoney | null;
  readonly createdAt: CrmTimestamp;
  readonly updatedAt: CrmTimestamp;
  readonly lastContactAt: CrmTimestamp | null;
  readonly convertedAt: CrmTimestamp | null;
}

export interface CrmChecklistItem {
  readonly id: CrmId;
  readonly leadId: CrmId;
  readonly step: CrmChecklistStep;
  readonly completed: boolean;
  readonly completedAt: CrmTimestamp | null;
  readonly completedById: CrmId | null;
  readonly notes: string | null;
  readonly createdAt: CrmTimestamp;
}

export interface CrmMeeting {
  readonly id: CrmId;
  readonly leadId: CrmId;
  readonly title: string;
  readonly scheduledAt: CrmTimestamp;
  readonly modality: CrmMeetingModality;
  readonly meetingLink: string | null;
  readonly location: string | null;
  readonly status: CrmMeetingStatus;
  readonly notes: string | null;
  readonly createdById: CrmId | null;
  readonly createdAt: CrmTimestamp;
  readonly updatedAt: CrmTimestamp;
}

export interface CrmProposal {
  readonly id: CrmId;
  readonly leadId: CrmId;
  readonly title: string;
  readonly planName: string | null;
  readonly monthlyValue: CrmMoney;
  readonly setupFee: CrmMoney | null;
  readonly trialDays: number;
  readonly features: unknown;
  readonly customMessage: string | null;
  readonly pdfUrl: string | null;
  readonly shareToken: string | null;
  readonly status: CrmProposalStatus;
  readonly sentAt: CrmTimestamp | null;
  readonly viewedAt: CrmTimestamp | null;
  readonly respondedAt: CrmTimestamp | null;
  readonly validUntil: CrmTimestamp | null;
  readonly createdById: CrmId | null;
  readonly createdAt: CrmTimestamp;
  readonly updatedAt: CrmTimestamp;
}

export interface CrmContract {
  readonly id: CrmId;
  readonly leadId: CrmId;
  readonly proposalId: CrmId | null;
  readonly title: string;
  readonly content: string;
  readonly monthlyValue: CrmMoney | null;
  readonly status: CrmContractStatus;
  readonly shareToken: string | null;
  readonly sentAt: CrmTimestamp | null;
  readonly signedAt: CrmTimestamp | null;
  readonly signatureData: string | null;
  readonly signerName: string | null;
  readonly signerIp: string | null;
  readonly createdById: CrmId | null;
  readonly createdAt: CrmTimestamp;
  readonly updatedAt: CrmTimestamp;
}

export interface CrmInteraction {
  readonly id: CrmId;
  readonly leadId: CrmId;
  readonly type: CrmInteractionType;
  readonly content: string;
  readonly metadata: unknown;
  readonly createdById: CrmId | null;
  readonly createdAt: CrmTimestamp;
}

export interface CrmFollowUpSetting {
  readonly id: CrmId;
  readonly name: string;
  readonly intervalDays: number;
  readonly maxAttempts: number;
  readonly messageTemplate: string | null;
  readonly isActive: boolean;
  readonly createdAt: CrmTimestamp;
  readonly updatedAt: CrmTimestamp;
}

export interface CrmFollowUp {
  readonly id: CrmId;
  readonly leadId: CrmId;
  readonly settingId: CrmId | null;
  readonly attemptNumber: number;
  readonly status: CrmFollowUpStatus;
  readonly generatedMessage: string | null;
  readonly scheduledAt: CrmTimestamp;
  readonly sentAt: CrmTimestamp | null;
  readonly respondedAt: CrmTimestamp | null;
  readonly scheduleCronTaskUid: string | null;
  readonly createdAt: CrmTimestamp;
  readonly updatedAt: CrmTimestamp;
}

export interface CrmTrial {
  readonly id: CrmId;
  readonly leadId: CrmId;
  readonly startDate: CrmTimestamp;
  readonly endDate: CrmTimestamp;
  readonly durationDays: number;
  readonly status: CrmTrialStatus;
  readonly convertedAt: CrmTimestamp | null;
  readonly notifiedAt: CrmTimestamp | null;
  readonly scheduleCronTaskUid: string | null;
  readonly createdAt: CrmTimestamp;
  readonly updatedAt: CrmTimestamp;
}

export interface CrmReferral {
  readonly id: CrmId;
  readonly referrerLeadId: CrmId;
  readonly referredLeadId: CrmId | null;
  readonly referredName: string | null;
  readonly referredPhone: string | null;
  readonly referredEmail: string | null;
  readonly status: CrmReferralStatus;
  readonly benefitDescription: string | null;
  readonly benefitGrantedAt: CrmTimestamp | null;
  readonly notes: string | null;
  readonly createdAt: CrmTimestamp;
  readonly updatedAt: CrmTimestamp;
}

export interface CrmLeadQuery {
  readonly stage?: CrmLeadStage;
  readonly status?: CrmLeadStatus;
  readonly search?: string;
  readonly limit?: number;
  readonly offset?: number;
}

export interface CrmLeadRepository {
  readonly findById: (id: CrmId) => Promise<CrmLead | null>;
  readonly list: (query?: CrmLeadQuery) => Promise<readonly CrmLead[]>;
  readonly save: (lead: CrmLead) => Promise<CrmLead>;
}

export interface CrmPipelineRepository {
  readonly listChecklist: (
    leadId: CrmId,
  ) => Promise<readonly CrmChecklistItem[]>;
  readonly saveChecklistItem: (
    item: CrmChecklistItem,
  ) => Promise<CrmChecklistItem>;
  readonly listInteractions: (
    leadId: CrmId,
  ) => Promise<readonly CrmInteraction[]>;
  readonly appendInteraction: (
    interaction: CrmInteraction,
  ) => Promise<CrmInteraction>;
}

export interface CrmCommercialRepository {
  readonly listMeetings: (leadId?: CrmId) => Promise<readonly CrmMeeting[]>;
  readonly saveMeeting: (meeting: CrmMeeting) => Promise<CrmMeeting>;
  readonly listProposals: (leadId?: CrmId) => Promise<readonly CrmProposal[]>;
  readonly saveProposal: (proposal: CrmProposal) => Promise<CrmProposal>;
  readonly listContracts: (leadId?: CrmId) => Promise<readonly CrmContract[]>;
  readonly saveContract: (contract: CrmContract) => Promise<CrmContract>;
}

export interface CrmEngagementRepository {
  readonly listFollowUps: (leadId?: CrmId) => Promise<readonly CrmFollowUp[]>;
  readonly saveFollowUp: (followUp: CrmFollowUp) => Promise<CrmFollowUp>;
  readonly listTrials: (leadId?: CrmId) => Promise<readonly CrmTrial[]>;
  readonly saveTrial: (trial: CrmTrial) => Promise<CrmTrial>;
  readonly listReferrals: (leadId?: CrmId) => Promise<readonly CrmReferral[]>;
  readonly saveReferral: (referral: CrmReferral) => Promise<CrmReferral>;
}

export function isCrmLeadStage(value: unknown): value is CrmLeadStage {
  return (
    typeof value === "string" &&
    (crmLeadStages as readonly string[]).includes(value)
  );
}

export function isActiveCrmFunnelStage(
  value: CrmLeadStage,
): value is (typeof crmActiveFunnelStages)[number] {
  return (crmActiveFunnelStages as readonly CrmLeadStage[]).includes(value);
}

export function crmFunnelStageIndex(stage: CrmLeadStage): number | null {
  const index = (crmActiveFunnelStages as readonly CrmLeadStage[]).indexOf(stage);
  return index < 0 ? null : index;
}

export function normalizeCrmId(value: unknown): CrmId | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    return null;
  }
  return value;
}
