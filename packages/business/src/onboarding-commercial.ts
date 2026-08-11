export const BUSINESS_TERMS_VERSION = "business-partner-terms-2026-08";
export const BUSINESS_PRIVACY_VERSION = "privacy-policy-2026-08";

export interface BusinessCommercialPlan {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly goals: readonly string[];
  readonly recommended?: boolean;
  readonly features: readonly string[];
}

export interface BusinessCommercialContractor {
  readonly name: string;
  readonly email: string;
  readonly phone: string;
  readonly document: string;
}

export interface BusinessCommercialAcceptance {
  readonly type: "terms" | "privacy" | "marketing";
  readonly version: string;
  readonly acceptedAt: string;
}

export interface BusinessCommercialDraft {
  readonly selectedPlanId: string;
  readonly contractor: BusinessCommercialContractor;
  readonly acceptedTerms: readonly BusinessCommercialAcceptance[];
  readonly marketingConsent: boolean;
  readonly tutorial: true;
  readonly excludeFromBusinessMetrics: true;
}

export interface BusinessCheckoutHandoff {
  readonly sessionId: string;
  readonly planId: string;
  readonly contractor: BusinessCommercialContractor;
  readonly businessDraft: Readonly<Record<string, unknown>>;
  readonly acceptedTerms: readonly BusinessCommercialAcceptance[];
  readonly returnUrl: string;
  readonly requiresPaymentProvider: true;
  readonly tutorial: false;
}

export interface BusinessPaymentVerification {
  readonly verified?: unknown;
  readonly sessionId?: unknown;
  readonly reference?: unknown;
}

export const BUSINESS_COMMERCIAL_PLANS: readonly BusinessCommercialPlan[] =
  Object.freeze([
    Object.freeze({
      id: "essential",
      name: "Essencial",
      description: "Presença no mapa, perfil comercial e descoberta orgânica.",
      goals: Object.freeze(["brand"]),
      features: Object.freeze([
        "Perfil comercial",
        "Mapa e busca",
        "Informações em quatro idiomas",
      ]),
    }),
    Object.freeze({
      id: "growth",
      name: "Crescimento",
      description: "Mais ferramentas para gerar contatos, reservas e vendas.",
      goals: Object.freeze(["clients", "reservations", "whatsapp", "sales"]),
      recommended: true,
      features: Object.freeze([
        "Tudo do Essencial",
        "Promoções e ofertas",
        "Métricas e painel do parceiro",
      ]),
    }),
    Object.freeze({
      id: "performance",
      name: "Performance",
      description:
        "Campanhas, eventos e maior capacidade de ativação comercial.",
      goals: Object.freeze(["events"]),
      features: Object.freeze([
        "Tudo do Crescimento",
        "Campanhas e eventos",
        "Acompanhamento comercial avançado",
      ]),
    }),
  ]);

function safeText(value: unknown, maxLength = 240): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[<>]/gu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, maxLength);
}

export function recommendBusinessCommercialPlan(
  objective: unknown,
): BusinessCommercialPlan {
  const goal = safeText(objective, 80);
  return (
    BUSINESS_COMMERCIAL_PLANS.find((plan) => plan.goals.includes(goal)) ??
    BUSINESS_COMMERCIAL_PLANS.find((plan) => plan.recommended) ??
    BUSINESS_COMMERCIAL_PLANS[0]!
  );
}

export function buildBusinessCommercialDraft(
  input: Readonly<{
    selectedPlanId?: unknown;
    objective?: unknown;
    contractor?: Readonly<Record<string, unknown>>;
    acceptTerms?: unknown;
    acceptPrivacy?: unknown;
    marketingConsent?: unknown;
    acceptedAt?: unknown;
  }>,
): BusinessCommercialDraft | null {
  if (input.acceptTerms !== true || input.acceptPrivacy !== true) return null;
  const recommended = recommendBusinessCommercialPlan(input.objective);
  const requestedPlanId = safeText(input.selectedPlanId, 80);
  const selectedPlan =
    BUSINESS_COMMERCIAL_PLANS.find((plan) => plan.id === requestedPlanId) ??
    recommended;
  const contractorInput = input.contractor ?? {};
  const contractor = Object.freeze({
    name: safeText(contractorInput.name, 120),
    email: safeText(contractorInput.email, 160),
    phone: safeText(contractorInput.phone, 80),
    document: safeText(contractorInput.document, 80),
  });
  if (
    !contractor.name ||
    !contractor.email ||
    !contractor.phone ||
    !contractor.document
  ) {
    return null;
  }
  const acceptedAt =
    typeof input.acceptedAt === "string" && input.acceptedAt.trim()
      ? input.acceptedAt
      : new Date().toISOString();
  const acceptedTerms: BusinessCommercialAcceptance[] = [
    Object.freeze({
      type: "terms",
      version: BUSINESS_TERMS_VERSION,
      acceptedAt,
    }),
    Object.freeze({
      type: "privacy",
      version: BUSINESS_PRIVACY_VERSION,
      acceptedAt,
    }),
  ];
  if (input.marketingConsent === true) {
    acceptedTerms.push(
      Object.freeze({ type: "marketing", version: "consent-v1", acceptedAt }),
    );
  }
  return Object.freeze({
    selectedPlanId: selectedPlan.id,
    contractor,
    acceptedTerms: Object.freeze(acceptedTerms),
    marketingConsent: input.marketingConsent === true,
    tutorial: true,
    excludeFromBusinessMetrics: true,
  });
}

export function buildBusinessCheckoutHandoff(
  input: Readonly<{
    sessionId?: unknown;
    commercialDraft?: BusinessCommercialDraft | null;
    businessDraft?: Readonly<object>;
    returnUrl?: unknown;
  }>,
): BusinessCheckoutHandoff | null {
  const sessionId = safeText(input.sessionId, 160);
  const returnUrl = safeText(input.returnUrl, 500);
  if (!sessionId || !returnUrl || !input.commercialDraft) return null;
  const businessDraft: Readonly<Record<string, unknown>> = Object.freeze({
    ...(input.businessDraft ?? {}),
  });
  return Object.freeze({
    sessionId,
    planId: input.commercialDraft.selectedPlanId,
    contractor: input.commercialDraft.contractor,
    businessDraft,
    acceptedTerms: input.commercialDraft.acceptedTerms,
    returnUrl,
    requiresPaymentProvider: true,
    tutorial: false,
  });
}

export function verifyBusinessPaymentForSession(
  expectedSessionId: unknown,
  detail: BusinessPaymentVerification,
): Readonly<{ reference: string }> | null {
  const expected = safeText(expectedSessionId, 160);
  const actual = safeText(detail.sessionId, 160);
  if (!expected || detail.verified !== true || actual !== expected) return null;
  return Object.freeze({ reference: safeText(detail.reference, 160) });
}
