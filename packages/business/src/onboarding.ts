export const BUSINESS_ONBOARDING_SESSION_VERSION = 2;
export const BUSINESS_ONBOARDING_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const BUSINESS_ONBOARDING_STATUSES = [
  "ACTIVE",
  "PAUSED",
  "COMPLETED",
  "EXPIRED",
  "CONVERTED",
  "DISCARDED",
] as const;

export type BusinessOnboardingStatus =
  (typeof BUSINESS_ONBOARDING_STATUSES)[number];

export const BUSINESS_ONBOARDING_STEP_STATE = Object.freeze({
  welcome: "WELCOME",
  category: "BUSINESS_CATEGORY",
  specialty: "BUSINESS_SPECIALTY",
  name: "BUSINESS_IDENTITY",
  objective: "BUSINESS_OBJECTIVE",
  audience: "BUSINESS_AUDIENCE",
  ready: "BUSINESS_LOCATION",
  arrival: "TRUST_CYCLE",
  "trust-cycle": "TRUST_CYCLE",
  "menu-discovery": "MENU_DISCOVERY",
  "text-discovery": "TEXT_SEARCH",
  "name-discovery": "NAME_SEARCH",
  "voice-discovery": "VOICE_SEARCH",
  multilingual: "MULTILINGUAL_DEMO",
  "always-on": "ALWAYS_ON_DEMO",
  "assistant-query": "AI_RECOMMENDATION",
  "ranking-explanation": "RANKING_EXPLANATION",
  context: "RANKING_EXPLANATION",
  map: "BUSINESS_PROFILE",
  profile: "BUSINESS_PROFILE",
  route: "ROUTE_DEMO",
  conversion: "EVENT_SUMMARY",
  reputation: "EVENT_SUMMARY",
  promotions: "PROMOTION_CREATE",
  analytics: "PARTNER_DASHBOARD",
  "partner-panel": "PARTNER_DASHBOARD",
  ecosystem: "VALUE_SUMMARY",
  finish: "COMPLETED",
} as const);

export type BusinessOnboardingStepId =
  keyof typeof BUSINESS_ONBOARDING_STEP_STATE;
export type BusinessOnboardingState =
  (typeof BUSINESS_ONBOARDING_STEP_STATE)[BusinessOnboardingStepId];

export interface BusinessOnboardingChapter {
  readonly id: string;
  readonly title: string;
  readonly shortTitle: string;
  readonly description: string;
  readonly steps: readonly BusinessOnboardingStepId[];
}

function onboardingSteps<const T extends readonly BusinessOnboardingStepId[]>(
  steps: T,
): readonly BusinessOnboardingStepId[] {
  return Object.freeze([...steps]);
}

export const BUSINESS_ONBOARDING_CHAPTERS: readonly BusinessOnboardingChapter[] =
  Object.freeze([
    Object.freeze({
      id: "business-foundation",
      title: "Seu negócio",
      shortTitle: "Negócio",
      description: "Categoria, identidade, objetivo e público.",
      steps: onboardingSteps([
        "welcome",
        "category",
        "specialty",
        "name",
        "objective",
        "audience",
        "ready",
      ]),
    }),
    Object.freeze({
      id: "tourist-discovery",
      title: "Como o turista encontra você",
      shortTitle: "Descoberta",
      description: "Confiança, menu, texto, nome e voz.",
      steps: onboardingSteps([
        "arrival",
        "trust-cycle",
        "menu-discovery",
        "text-discovery",
        "name-discovery",
        "voice-discovery",
      ]),
    }),
    Object.freeze({
      id: "intelligent-recommendation",
      title: "Inteligência e alcance",
      shortTitle: "Inteligência",
      description: "Idiomas, disponibilidade e recomendação contextual.",
      steps: onboardingSteps([
        "multilingual",
        "always-on",
        "assistant-query",
        "ranking-explanation",
        "context",
      ]),
    }),
    Object.freeze({
      id: "tourist-experience",
      title: "Experiência que gera ação",
      shortTitle: "Experiência",
      description: "Mapa, perfil, rota, confiança e promoções.",
      steps: onboardingSteps([
        "map",
        "profile",
        "route",
        "conversion",
        "reputation",
        "promotions",
      ]),
    }),
    Object.freeze({
      id: "business-growth",
      title: "Gestão e crescimento",
      shortTitle: "Crescimento",
      description: "Métricas, painel, ecossistema e conclusão.",
      steps: onboardingSteps([
        "analytics",
        "partner-panel",
        "ecosystem",
        "finish",
      ]),
    }),
  ]);

export interface BusinessOnboardingContext {
  readonly businessName?: string;
  readonly category?: string;
  readonly specialty?: string;
  readonly objective?: string;
  readonly businessLocation?: unknown;
  readonly [key: string]: unknown;
}

export interface BusinessOnboardingConversationDraft {
  readonly currentStepId: BusinessOnboardingStepId | null;
  readonly context: Readonly<Record<string, unknown>>;
  readonly history: readonly unknown[];
  readonly status: BusinessOnboardingStatus;
  readonly reason: string;
  readonly updatedAt: string;
}

export interface BusinessOnboardingBusinessDraft {
  readonly displayName: string;
  readonly normalizedName: string;
  readonly categoryId: string;
  readonly specialtyTags: readonly string[];
  readonly location: unknown;
  readonly environment: "sandbox";
  readonly publishable: false;
}

export interface BusinessOnboardingSession {
  readonly version: 2;
  readonly status: BusinessOnboardingStatus;
  readonly currentState: BusinessOnboardingState;
  readonly previousState: BusinessOnboardingState | null;
  readonly businessDraft: BusinessOnboardingBusinessDraft;
  readonly conversationDraft: BusinessOnboardingConversationDraft;
  readonly selectedObjective: string | null;
  readonly selectedLanguage: string;
  readonly completedCapabilities: readonly string[];
  readonly skippedCapabilities: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly expiresAt: string;
}

export interface BusinessDiscoveryPort {
  readonly searchBusiness: (query: string) => Promise<unknown>;
}

export interface BusinessLocationPort {
  readonly findExistingLocation: (businessName: string) => Promise<unknown>;
  readonly requestDeviceLocation: () => Promise<unknown>;
}

export interface BusinessAssistantPort {
  readonly ask: (message: string, locale: string) => Promise<unknown>;
}

export interface BusinessRouteCoordinate {
  readonly latitude: number;
  readonly longitude: number;
}

export interface BusinessRouteRequest {
  readonly origin: BusinessRouteCoordinate;
  readonly destination: BusinessRouteCoordinate;
  readonly destinationName: string;
  readonly language?: string;
}

export interface BusinessRouteResult {
  readonly success: boolean;
  readonly code: string;
  readonly distanceMeters: number;
  readonly durationSeconds: number;
  readonly route: unknown;
  readonly tutorial: true;
  readonly excludeFromBusinessMetrics: true;
}

export interface BusinessRoutePort {
  readonly showRoute: (
    request: BusinessRouteRequest,
  ) => Promise<BusinessRouteResult>;
}

export interface BusinessOnboardingPorts {
  readonly discovery?: BusinessDiscoveryPort;
  readonly location?: BusinessLocationPort;
  readonly assistant?: BusinessAssistantPort;
  readonly route?: BusinessRoutePort;
}

function safeText(value: unknown, maxLength = 240): string {
  if (typeof value !== "string") return "";
  const sanitized = Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 ||
      codePoint === 127 ||
      character === "<" ||
      character === ">"
      ? " "
      : character;
  }).join("");
  return sanitized.replace(/\s+/gu, " ").trim().slice(0, maxLength);
}

function normalizeName(value: unknown): string {
  return safeText(value, 180)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .trim();
}

function freezeArray<T>(values: readonly T[]): readonly T[] {
  return Object.freeze([...values]);
}

function freezeContext(
  context: BusinessOnboardingContext = {},
): Readonly<Record<string, unknown>> {
  return Object.freeze({ ...context });
}

function isStatus(value: unknown): value is BusinessOnboardingStatus {
  return (
    typeof value === "string" &&
    BUSINESS_ONBOARDING_STATUSES.includes(value as BusinessOnboardingStatus)
  );
}

export function getBusinessOnboardingChapter(stepId: unknown):
  | (BusinessOnboardingChapter & {
      readonly chapterIndex: number;
      readonly chapterNumber: number;
      readonly chapterStepIndex: number;
      readonly chapterStepNumber: number;
      readonly chapterStepTotal: number;
      readonly totalChapters: number;
    })
  | null {
  if (typeof stepId !== "string") return null;

  for (
    let chapterIndex = 0;
    chapterIndex < BUSINESS_ONBOARDING_CHAPTERS.length;
    chapterIndex += 1
  ) {
    const chapter = BUSINESS_ONBOARDING_CHAPTERS[chapterIndex];
    if (!chapter) continue;
    const chapterStepIndex = chapter.steps.indexOf(
      stepId as BusinessOnboardingStepId,
    );
    if (chapterStepIndex < 0) continue;

    return Object.freeze({
      ...chapter,
      chapterIndex,
      chapterNumber: chapterIndex + 1,
      chapterStepIndex,
      chapterStepNumber: chapterStepIndex + 1,
      chapterStepTotal: chapter.steps.length,
      totalChapters: BUSINESS_ONBOARDING_CHAPTERS.length,
    });
  }

  return null;
}

export function createBusinessOnboardingSession(
  input: {
    readonly context?: BusinessOnboardingContext;
    readonly locale?: string;
    readonly now?: Date;
  } = {},
): BusinessOnboardingSession {
  const now = input.now ?? new Date();
  const context = input.context ?? {};
  const createdAt = now.toISOString();
  const expiresAt = new Date(
    now.getTime() + BUSINESS_ONBOARDING_TTL_MS,
  ).toISOString();
  const businessName = safeText(context.businessName, 180);
  const specialty = safeText(context.specialty, 120);

  return Object.freeze({
    version: BUSINESS_ONBOARDING_SESSION_VERSION,
    status: "ACTIVE",
    currentState: "WELCOME",
    previousState: null,
    businessDraft: Object.freeze({
      displayName: businessName,
      normalizedName: normalizeName(businessName),
      categoryId: safeText(context.category, 120),
      specialtyTags: freezeArray(specialty ? [specialty] : []),
      location: context.businessLocation ?? null,
      environment: "sandbox",
      publishable: false,
    }),
    conversationDraft: Object.freeze({
      currentStepId: "welcome",
      context: freezeContext(context),
      history: freezeArray([]),
      status: "ACTIVE",
      reason: "created",
      updatedAt: createdAt,
    }),
    selectedObjective: safeText(context.objective, 160) || null,
    selectedLanguage: safeText(input.locale, 20) || "pt",
    completedCapabilities: freezeArray([]),
    skippedCapabilities: freezeArray([]),
    createdAt,
    updatedAt,
    expiresAt,
  });
}

export function isBusinessOnboardingResumable(
  session: BusinessOnboardingSession,
  now = new Date(),
): boolean {
  if (session.status !== "ACTIVE" && session.status !== "PAUSED") return false;
  return Date.parse(session.expiresAt) > now.getTime();
}

export function transitionBusinessOnboarding(
  session: BusinessOnboardingSession,
  nextStepId: BusinessOnboardingStepId,
  input: { readonly now?: Date; readonly reason?: string } = {},
): BusinessOnboardingSession {
  const nextState = BUSINESS_ONBOARDING_STEP_STATE[nextStepId];
  const now = input.now ?? new Date();
  const updatedAt = now.toISOString();

  return Object.freeze({
    ...session,
    status: session.status === "PAUSED" ? "ACTIVE" : session.status,
    previousState: session.currentState,
    currentState: nextState,
    conversationDraft: Object.freeze({
      ...session.conversationDraft,
      currentStepId: nextStepId,
      status: session.status === "PAUSED" ? "ACTIVE" : session.status,
      reason: safeText(input.reason, 120) || "progress",
      updatedAt,
    }),
    updatedAt,
  });
}

export function setBusinessOnboardingStatus(
  session: BusinessOnboardingSession,
  status: BusinessOnboardingStatus,
  input: { readonly now?: Date; readonly reason?: string } = {},
): BusinessOnboardingSession {
  const now = input.now ?? new Date();
  const updatedAt = now.toISOString();
  const currentState =
    status === "COMPLETED" ? "COMPLETED" : session.currentState;

  return Object.freeze({
    ...session,
    status,
    currentState,
    conversationDraft: Object.freeze({
      ...session.conversationDraft,
      status,
      reason: safeText(input.reason, 120) || status.toLowerCase(),
      updatedAt,
    }),
    updatedAt,
  });
}

export function completeBusinessOnboardingCapability(
  session: BusinessOnboardingSession,
  capabilityInput: unknown,
): BusinessOnboardingSession {
  const capability = safeText(capabilityInput, 120);
  if (!capability) return session;

  return Object.freeze({
    ...session,
    completedCapabilities: freezeArray([
      ...new Set([...session.completedCapabilities, capability]),
    ]),
  });
}

export function skipBusinessOnboardingCapability(
  session: BusinessOnboardingSession,
  capabilityInput: unknown,
): BusinessOnboardingSession {
  const capability = safeText(capabilityInput, 120);
  if (!capability) return session;

  return Object.freeze({
    ...session,
    skippedCapabilities: freezeArray([
      ...new Set([...session.skippedCapabilities, capability]),
    ]),
  });
}

export function normalizeBusinessOnboardingStatus(
  value: unknown,
): BusinessOnboardingStatus {
  return isStatus(value) ? value : "ACTIVE";
}
