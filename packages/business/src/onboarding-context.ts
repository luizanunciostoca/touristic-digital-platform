import type {
  BusinessOnboardingSession,
  BusinessOnboardingStepId,
} from "./onboarding.js";
import {
  getBusinessOnboardingSpecialties,
  validateBusinessOnboardingStepInput,
} from "./onboarding-steps.js";

export type BusinessOnboardingEditableField =
  "category" | "specialty" | "businessName" | "objective" | "audience";

const RUNTIME_CONTEXT_KEYS = new Set([
  "businessLocation",
  "businessLocationCandidate",
  "businessLocationConfirmed",
  "businessVoiceDiscoveryReady",
  "businessRankingExplanationReady",
  "businessTutorialRouteReady",
  "businessDiscoveryResult",
  "businessAssistantResult",
  "businessRouteResult",
  "tutorialBusinessCandidate",
  "businessRecommendationResult",
  "tutorialBusinessProfile",
  "businessTutorialEventSummary",
  "businessDemoPromotion",
  "businessTutorialWorkspace",
  "businessCommercialCheckoutHandoff",
  "businessCommercialActivation",
]);

function safeText(value: unknown, maxLength: number): string {
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

function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .trim();
}

function fieldForStep(
  stepId: BusinessOnboardingStepId,
): BusinessOnboardingEditableField | null {
  if (stepId === "category") return "category";
  if (stepId === "specialty") return "specialty";
  if (stepId === "name") return "businessName";
  if (stepId === "objective") return "objective";
  if (stepId === "audience") return "audience";
  return null;
}

function replaceContext(
  session: BusinessOnboardingSession,
  context: Readonly<Record<string, unknown>>,
  reason: string,
  now: Date,
): BusinessOnboardingSession {
  const updatedAt = now.toISOString();
  return Object.freeze({
    ...session,
    conversationDraft: Object.freeze({
      ...session.conversationDraft,
      context: Object.freeze({ ...context }),
      reason,
      updatedAt,
    }),
    updatedAt,
  });
}

export function updateBusinessOnboardingRuntimeContext(
  session: BusinessOnboardingSession,
  patch: Readonly<Record<string, unknown>>,
  now = new Date(),
): BusinessOnboardingSession {
  const safePatch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (RUNTIME_CONTEXT_KEYS.has(key)) safePatch[key] = value;
  }
  if (Object.keys(safePatch).length === 0) return session;
  return replaceContext(
    session,
    { ...session.conversationDraft.context, ...safePatch },
    "runtime-context",
    now,
  );
}

export function updateBusinessOnboardingStepInput(
  session: BusinessOnboardingSession,
  stepId: BusinessOnboardingStepId,
  value: unknown,
  now = new Date(),
): BusinessOnboardingSession {
  const field = fieldForStep(stepId);
  if (!field) return session;

  const currentContext = session.conversationDraft.context;
  if (!validateBusinessOnboardingStepInput(stepId, value, currentContext)) {
    return session;
  }

  const sanitized = safeText(value, field === "businessName" ? 80 : 160);
  const nextContext: Record<string, unknown> = {
    ...currentContext,
    [field]: sanitized,
  };
  let businessDraft = session.businessDraft;
  let selectedObjective = session.selectedObjective;

  if (field === "category") {
    const specialties = getBusinessOnboardingSpecialties(sanitized);
    const currentSpecialty = safeText(currentContext.specialty, 160);
    if (!specialties.some((option) => option.value === currentSpecialty)) {
      delete nextContext.specialty;
    }
    businessDraft = Object.freeze({
      ...businessDraft,
      categoryId: sanitized,
      specialtyTags: Object.freeze([]),
    });
  } else if (field === "specialty") {
    businessDraft = Object.freeze({
      ...businessDraft,
      specialtyTags: Object.freeze(sanitized ? [sanitized] : []),
    });
  } else if (field === "businessName") {
    businessDraft = Object.freeze({
      ...businessDraft,
      displayName: sanitized,
      normalizedName: normalizeName(sanitized),
    });
  } else if (field === "objective") {
    selectedObjective = sanitized || null;
  }

  const updatedAt = now.toISOString();
  return Object.freeze({
    ...session,
    businessDraft,
    selectedObjective,
    conversationDraft: Object.freeze({
      ...session.conversationDraft,
      context: Object.freeze(nextContext),
      reason: `input:${stepId}`,
      updatedAt,
    }),
    updatedAt,
  });
}
