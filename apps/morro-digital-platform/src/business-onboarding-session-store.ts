import {
  BUSINESS_ONBOARDING_SESSION_VERSION,
  BUSINESS_ONBOARDING_STEP_STATE,
  BUSINESS_ONBOARDING_TTL_MS,
  createBusinessOnboardingSession,
  setBusinessOnboardingStatus,
  transitionBusinessOnboarding,
  type BusinessOnboardingSession,
  type BusinessOnboardingStepId,
} from "@touristic/business/onboarding";

export const BUSINESS_ONBOARDING_BROWSER_SESSION_KEY =
  "morro-digital-business-onboarding-session-v2";

const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const MAX_ARRAY_ITEMS = 60;
const MAX_OBJECT_ENTRIES = 80;
const MAX_VALUE_DEPTH = 5;

const PERSISTED_CONTEXT_KEYS = new Set([
  "category",
  "specialty",
  "businessName",
  "objective",
  "audience",
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

const BLOCKED_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);

type BrowserStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;
type ResumableStatus = "ACTIVE" | "PAUSED";

interface PersistedBusinessOnboardingSession {
  readonly version: number;
  readonly status: ResumableStatus;
  readonly stepId: BusinessOnboardingStepId;
  readonly selectedLanguage: string;
  readonly context: Readonly<Record<string, unknown>>;
  readonly completedCapabilities: readonly string[];
  readonly skippedCapabilities: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly expiresAt: string;
}

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

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > MAX_VALUE_DEPTH || value === null) return value === null ? null : undefined;
  if (typeof value === "string") return safeText(value, 800);
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => sanitizeValue(item, depth + 1))
      .filter((item) => item !== undefined);
  }
  if (typeof value !== "object" || !value) return undefined;

  const result: Record<string, unknown> = {};
  for (const [rawKey, item] of Object.entries(value).slice(
    0,
    MAX_OBJECT_ENTRIES,
  )) {
    const key = safeText(rawKey, 100);
    if (!key || BLOCKED_OBJECT_KEYS.has(key)) continue;
    const sanitized = sanitizeValue(item, depth + 1);
    if (sanitized !== undefined) result[key] = sanitized;
  }
  return result;
}

function sanitizeContext(value: unknown): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return Object.freeze({});
  }
  const context: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!PERSISTED_CONTEXT_KEYS.has(key)) continue;
    const sanitized = sanitizeValue(item);
    if (sanitized !== undefined) context[key] = sanitized;
  }
  return Object.freeze(context);
}

function sanitizeCapabilities(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return Object.freeze([]);
  return Object.freeze(
    [...new Set(value.map((item) => safeText(item, 120)).filter(Boolean))].slice(
      0,
      MAX_ARRAY_ITEMS,
    ),
  );
}

function isResumableStatus(value: unknown): value is ResumableStatus {
  return value === "ACTIVE" || value === "PAUSED";
}

function isStepId(value: unknown): value is BusinessOnboardingStepId {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(BUSINESS_ONBOARDING_STEP_STATE, value)
  );
}

function dateMs(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function restoreSession(
  value: unknown,
  now: Date,
): BusinessOnboardingSession | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const persisted = value as Partial<PersistedBusinessOnboardingSession>;
  if (persisted.version !== BUSINESS_ONBOARDING_SESSION_VERSION) return null;
  if (!isResumableStatus(persisted.status)) return null;
  if (!isStepId(persisted.stepId)) return null;

  const createdMs = dateMs(persisted.createdAt);
  const updatedMs = dateMs(persisted.updatedAt);
  const expiresMs = dateMs(persisted.expiresAt);
  if (createdMs === null || updatedMs === null || expiresMs === null) return null;
  if (createdMs > now.getTime() + MAX_CLOCK_SKEW_MS) return null;
  if (updatedMs < createdMs || updatedMs > now.getTime() + MAX_CLOCK_SKEW_MS) {
    return null;
  }
  const expectedExpiresMs = createdMs + BUSINESS_ONBOARDING_TTL_MS;
  if (Math.abs(expiresMs - expectedExpiresMs) > 1000) return null;
  if (expectedExpiresMs <= now.getTime()) return null;

  const context = sanitizeContext(persisted.context);
  const selectedLanguage = safeText(persisted.selectedLanguage, 20) || "pt";
  let session = createBusinessOnboardingSession({
    context,
    locale: selectedLanguage,
    now: new Date(createdMs),
  });

  if (persisted.stepId !== "welcome") {
    session = transitionBusinessOnboarding(session, persisted.stepId, {
      now: new Date(updatedMs),
      reason: "browser-resume",
    });
  }
  if (persisted.status === "PAUSED") {
    session = setBusinessOnboardingStatus(session, "PAUSED", {
      now: new Date(updatedMs),
      reason: "browser-persisted-pause",
    });
  }

  return Object.freeze({
    ...session,
    completedCapabilities: sanitizeCapabilities(persisted.completedCapabilities),
    skippedCapabilities: sanitizeCapabilities(persisted.skippedCapabilities),
  });
}

export class BusinessOnboardingBrowserSessionStore {
  constructor(private readonly storage: BrowserStorage | null) {}

  load(now = new Date()): BusinessOnboardingSession | null {
    if (!this.storage) return null;
    try {
      const raw = this.storage.getItem(BUSINESS_ONBOARDING_BROWSER_SESSION_KEY);
      if (!raw) return null;
      const restored = restoreSession(JSON.parse(raw), now);
      if (!restored) this.clear();
      return restored;
    } catch {
      this.clear();
      return null;
    }
  }

  save(session: BusinessOnboardingSession): void {
    if (!this.storage) return;
    if (!isResumableStatus(session.status)) {
      this.clear();
      return;
    }

    const payload: PersistedBusinessOnboardingSession = Object.freeze({
      version: BUSINESS_ONBOARDING_SESSION_VERSION,
      status: session.status,
      stepId: session.conversationDraft.currentStepId ?? "welcome",
      selectedLanguage: safeText(session.selectedLanguage, 20) || "pt",
      context: sanitizeContext(session.conversationDraft.context),
      completedCapabilities: sanitizeCapabilities(session.completedCapabilities),
      skippedCapabilities: sanitizeCapabilities(session.skippedCapabilities),
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      expiresAt: session.expiresAt,
    });

    try {
      this.storage.setItem(
        BUSINESS_ONBOARDING_BROWSER_SESSION_KEY,
        JSON.stringify(payload),
      );
    } catch {
      // Persistence is a recoverability enhancement; onboarding remains usable
      // when storage is unavailable or quota-limited.
    }
  }

  clear(): void {
    if (!this.storage) return;
    try {
      this.storage.removeItem(BUSINESS_ONBOARDING_BROWSER_SESSION_KEY);
    } catch {
      // Storage can be disabled by the browser. Fail open for the tutorial UI.
    }
  }
}
