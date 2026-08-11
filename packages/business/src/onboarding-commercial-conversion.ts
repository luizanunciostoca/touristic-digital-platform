export const BUSINESS_PARTNER_TERMS_VERSION = "business-partner-terms-2026-08";
export const BUSINESS_PRIVACY_VERSION = "privacy-policy-2026-08";

export interface BusinessCommercialPlan {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly priceLabel: string;
  readonly goals: readonly string[];
  readonly features: readonly string[];
  readonly recommended: boolean;
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

export interface BusinessCommercialCheckoutHandoff {
  readonly sessionId: string;
  readonly planId: string;
  readonly contractor: BusinessCommercialContractor;
  readonly businessDraft: Readonly<Record<string, unknown>>;
  readonly acceptedTerms: readonly BusinessCommercialAcceptance[];
  readonly returnUrl: string;
  readonly tutorial: false;
  readonly requiresPaymentsCapability: true;
}

export interface BusinessCommercialVerifiedPayment {
  readonly verified: true;
  readonly sessionId: string;
  readonly reference: string;
  readonly definitiveBusinessId?: string | null;
  readonly activationStatus?: string | null;
}

export interface BusinessCommercialActivation {
  readonly paymentStatus: "CONFIRMED";
  readonly activationStatus: "READY_TO_CONVERT";
  readonly paymentReference: string;
  readonly definitiveBusinessId: string | null;
}

const FALLBACK_PLANS = Object.freeze([
  Object.freeze({
    id: "essential",
    name: "Essencial",
    description: "Presença no mapa, perfil comercial e descoberta orgânica.",
    priceLabel: "Valor confirmado antes do pagamento",
    goals: Object.freeze(["brand"]),
    features: Object.freeze([
      "Perfil comercial",
      "Mapa e busca",
      "Informações em quatro idiomas",
    ]),
    recommended: false,
  }),
  Object.freeze({
    id: "growth",
    name: "Crescimento",
    description: "Mais ferramentas para gerar contatos, reservas e vendas.",
    priceLabel: "Valor confirmado antes do pagamento",
    goals: Object.freeze(["clients", "reservations", "whatsapp", "sales"]),
    features: Object.freeze([
      "Tudo do Essencial",
      "Promoções e ofertas",
      "Métricas e painel do parceiro",
    ]),
    recommended: true,
  }),
  Object.freeze({
    id: "performance",
    name: "Performance",
    description: "Campanhas, eventos e maior capacidade de ativação comercial.",
    priceLabel: "Valor confirmado antes do pagamento",
    goals: Object.freeze(["events"]),
    features: Object.freeze([
      "Tudo do Crescimento",
      "Campanhas e eventos",
      "Acompanhamento comercial avançado",
    ]),
    recommended: false,
  }),
] satisfies readonly BusinessCommercialPlan[]);

function safeText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/[<>]/gu, "").trim().slice(0, maxLength);
}

function validEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value);
}

export function getBusinessCommercialPlans(): readonly BusinessCommercialPlan[] {
  return FALLBACK_PLANS;
}

export function recommendBusinessCommercialPlan(
  objective: unknown,
  plans: readonly BusinessCommercialPlan[] = FALLBACK_PLANS,
): BusinessCommercialPlan | null {
  if (plans.length === 0) return null;
  const normalizedObjective = safeText(objective, 80);
  return (
    plans.find((plan) => plan.goals.includes(normalizedObjective)) ??
    plans.find((plan) => plan.recommended) ??
    plans[0] ??
    null
  );
}

export function buildBusinessCommercialContractor(
  input: Readonly<Record<string, unknown>>,
): BusinessCommercialContractor | null {
  const contractor = Object.freeze({
    name: safeText(input.name, 160),
    email: safeText(input.email, 200).toLowerCase(),
    phone: safeText(input.phone, 80),
    document: safeText(input.document, 80),
  });
  if (
    !contractor.name ||
    !validEmail(contractor.email) ||
    !contractor.phone ||
    !contractor.document
  ) {
    return null;
  }
  return contractor;
}

export function buildBusinessCommercialAcceptances(
  input: Readonly<{ terms?: boolean; privacy?: boolean; marketing?: boolean }>,
  acceptedAt: string,
): readonly BusinessCommercialAcceptance[] | null {
  if (!input.terms || !input.privacy || !acceptedAt) return null;
  const acceptances: BusinessCommercialAcceptance[] = [
    Object.freeze({
      type: "terms",
      version: BUSINESS_PARTNER_TERMS_VERSION,
      acceptedAt,
    }),
    Object.freeze({
      type: "privacy",
      version: BUSINESS_PRIVACY_VERSION,
      acceptedAt,
    }),
  ];
  if (input.marketing) {
    acceptances.push(
      Object.freeze({
        type: "marketing",
        version: "consent-v1",
        acceptedAt,
      }),
    );
  }
  return Object.freeze(acceptances);
}

export function buildBusinessCommercialCheckoutHandoff(
  input: Readonly<{
    sessionId?: unknown;
    planId?: unknown;
    contractor?: BusinessCommercialContractor | null;
    businessDraft?: Readonly<Record<string, unknown>>;
    acceptedTerms?: readonly BusinessCommercialAcceptance[] | null;
    returnUrl?: unknown;
  }>,
): BusinessCommercialCheckoutHandoff | null {
  const sessionId = safeText(input.sessionId, 120);
  const planId = safeText(input.planId, 80);
  const returnUrl = safeText(input.returnUrl, 500);
  if (
    !sessionId ||
    !planId ||
    !input.contractor ||
    !input.acceptedTerms?.length ||
    !returnUrl
  ) {
    return null;
  }
  return Object.freeze({
    sessionId,
    planId,
    contractor: input.contractor,
    businessDraft: Object.freeze({ ...(input.businessDraft ?? {}) }),
    acceptedTerms: Object.freeze([...input.acceptedTerms]),
    returnUrl,
    tutorial: false,
    requiresPaymentsCapability: true,
  });
}

export function acceptBusinessCommercialVerifiedPayment(
  expectedSessionId: unknown,
  result: Readonly<Partial<BusinessCommercialVerifiedPayment>>,
): BusinessCommercialActivation | null {
  const sessionId = safeText(expectedSessionId, 120);
  const resultSessionId = safeText(result.sessionId, 120);
  if (result.verified !== true || !sessionId || resultSessionId !== sessionId) {
    return null;
  }
  const reference = safeText(result.reference, 160);
  if (!reference) return null;
  return Object.freeze({
    paymentStatus: "CONFIRMED",
    activationStatus: "READY_TO_CONVERT",
    paymentReference: reference,
    definitiveBusinessId: safeText(result.definitiveBusinessId, 160) || null,
  });
}
