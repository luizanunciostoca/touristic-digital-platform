import type { BusinessOnboardingStepId } from "./onboarding.js";
import {
  BUSINESS_ONBOARDING_CATEGORIES,
  getBusinessOnboardingSpecialties,
  getBusinessOnboardingStepDefinition,
  type BusinessOnboardingOption,
  type BusinessOnboardingStepDefinition,
} from "./onboarding-steps.js";

const CATEGORY_COPY = Object.freeze({
  restaurant: { query: "Onde jantar com vista para o mar?", generic: "restaurantes próximos de mim", cta: "Ver cardápio", icon: "🍽️" },
  lodging: { query: "Quero uma pousada charmosa perto da praia.", generic: "pousadas próximas de mim", cta: "Ver disponibilidade", icon: "🏨" },
  tour: { query: "Qual passeio vale mais a pena amanhã?", generic: "passeios próximos de mim", cta: "Reservar passeio", icon: "🚤" },
  transport: { query: "Como faço o transfer entre Salvador e Morro?", generic: "transportes próximos de mim", cta: "Solicitar transfer", icon: "🚐" },
  fashion: { query: "Onde comprar moda praia e lembranças?", generic: "lojas próximas de mim", cta: "Ver produtos", icon: "🛍️" },
  market: { query: "Onde encontro mercado com entrega perto de mim?", generic: "supermercados próximos de mim", cta: "Fazer pedido", icon: "🛒" },
  events: { query: "O que fazer hoje à noite em Morro?", generic: "eventos próximos de mim", cta: "Garantir ingresso", icon: "🎉" },
  other: { query: "Qual negócio local você recomenda para mim?", generic: "serviços próximos de mim", cta: "Conhecer empresa", icon: "🏪" },
} as const);

export interface BusinessOnboardingResolvedStep extends BusinessOnboardingStepDefinition {
  readonly title: string;
  readonly description: string;
  readonly primary?: string;
  readonly secondary?: string;
  readonly response?: string;
  readonly items?: readonly string[];
  readonly options?: readonly BusinessOnboardingOption[];
}

function categoryKey(context: Readonly<Record<string, unknown>>): keyof typeof CATEGORY_COPY {
  const value = String(context.category ?? "other");
  return value in CATEGORY_COPY ? (value as keyof typeof CATEGORY_COPY) : "other";
}

function interpolate(value: string, context: Readonly<Record<string, unknown>>): string {
  const category = BUSINESS_ONBOARDING_CATEGORIES.find((item) => item.value === context.category) ?? BUSINESS_ONBOARDING_CATEGORIES[7];
  const copy = CATEGORY_COPY[categoryKey(context)];
  const replacements: Readonly<Record<string, string>> = {
    businessName: String(context.businessName ?? "sua empresa"),
    category: category?.label ?? "seu negócio",
    specialty: String(context.specialty ?? "sua especialidade"),
    query: copy.query,
    generic: copy.generic,
    cta: copy.cta,
    icon: copy.icon,
  };
  return value.replace(/\{([a-zA-Z]+)\}/gu, (match, key: string) => replacements[key] ?? match);
}

export function resolveBusinessOnboardingStep(
  stepId: BusinessOnboardingStepId,
  context: Readonly<Record<string, unknown>> = {},
): BusinessOnboardingResolvedStep {
  const definition = getBusinessOnboardingStepDefinition(stepId);
  const options = definition.type === "dynamic-choice"
    ? getBusinessOnboardingSpecialties(String(context.category ?? "other"))
    : definition.options;

  return Object.freeze({
    ...definition,
    title: interpolate(definition.title, context),
    description: interpolate(definition.description, context),
    ...(definition.primary ? { primary: interpolate(definition.primary, context) } : {}),
    ...(definition.secondary ? { secondary: interpolate(definition.secondary, context) } : {}),
    ...(definition.response ? { response: interpolate(definition.response, context) } : {}),
    ...(definition.items ? { items: Object.freeze(definition.items.map((item) => interpolate(item, context))) } : {}),
    ...(options ? { options } : {}),
  });
}
