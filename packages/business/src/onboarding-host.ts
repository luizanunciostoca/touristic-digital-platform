import {
  BUSINESS_ONBOARDING_CHAPTERS,
  createBusinessOnboardingSession,
  getBusinessOnboardingChapter,
  isBusinessOnboardingResumable,
  setBusinessOnboardingStatus,
  transitionBusinessOnboarding,
  type BusinessOnboardingSession,
  type BusinessOnboardingStepId,
} from "./onboarding.js";

export const BUSINESS_ONBOARDING_GUARD_TIMEOUT_MS = 8000;

export type BusinessOnboardingDirection = "next" | "previous";

export interface BusinessOnboardingGuardContext {
  readonly session: BusinessOnboardingSession;
  readonly fromStepId: BusinessOnboardingStepId;
  readonly toStepId: BusinessOnboardingStepId;
  readonly direction: BusinessOnboardingDirection;
}

export interface BusinessOnboardingHostOptions {
  readonly session?: BusinessOnboardingSession;
  readonly now?: Date;
  readonly locale?: string;
  readonly guardTimeoutMs?: number;
  readonly beforeTransition?: (
    context: BusinessOnboardingGuardContext,
  ) => boolean | Promise<boolean>;
}

export interface BusinessOnboardingHostSnapshot {
  readonly session: BusinessOnboardingSession;
  readonly stepId: BusinessOnboardingStepId;
  readonly stepIndex: number;
  readonly stepNumber: number;
  readonly totalSteps: number;
  readonly canGoBack: boolean;
  readonly canGoForward: boolean;
  readonly chapter: ReturnType<typeof getBusinessOnboardingChapter>;
}

const ORDERED_STEPS = Object.freeze(
  BUSINESS_ONBOARDING_CHAPTERS.flatMap((chapter) => [...chapter.steps]),
);

function currentStepId(session: BusinessOnboardingSession): BusinessOnboardingStepId {
  const stepId = session.conversationDraft.currentStepId;
  return stepId && ORDERED_STEPS.includes(stepId) ? stepId : "welcome";
}

async function withTimeout(
  result: boolean | Promise<boolean>,
  timeoutMs: number,
): Promise<boolean> {
  if (!(result instanceof Promise)) return result;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      result,
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export class BusinessOnboardingHostController {
  private session: BusinessOnboardingSession;
  private readonly beforeTransition?: BusinessOnboardingHostOptions["beforeTransition"];
  private readonly guardTimeoutMs: number;

  constructor(options: BusinessOnboardingHostOptions = {}) {
    const now = options.now ?? new Date();
    const existing = options.session;
    this.session =
      existing && isBusinessOnboardingResumable(existing, now)
        ? existing.status === "PAUSED"
          ? setBusinessOnboardingStatus(existing, "ACTIVE", {
              now,
              reason: "resume",
            })
          : existing
        : createBusinessOnboardingSession({
            now,
            ...(options.locale ? { locale: options.locale } : {}),
          });
    this.beforeTransition = options.beforeTransition;
    this.guardTimeoutMs = Math.max(
      100,
      options.guardTimeoutMs ?? BUSINESS_ONBOARDING_GUARD_TIMEOUT_MS,
    );
  }

  snapshot(): BusinessOnboardingHostSnapshot {
    const stepId = currentStepId(this.session);
    const stepIndex = ORDERED_STEPS.indexOf(stepId);
    return Object.freeze({
      session: this.session,
      stepId,
      stepIndex,
      stepNumber: stepIndex + 1,
      totalSteps: ORDERED_STEPS.length,
      canGoBack: stepIndex > 0,
      canGoForward: stepIndex < ORDERED_STEPS.length - 1,
      chapter: getBusinessOnboardingChapter(stepId),
    });
  }

  async move(
    direction: BusinessOnboardingDirection,
    now = new Date(),
  ): Promise<BusinessOnboardingHostSnapshot> {
    const snapshot = this.snapshot();
    const delta = direction === "previous" ? -1 : 1;
    const target = ORDERED_STEPS[snapshot.stepIndex + delta];
    if (!target) return snapshot;

    if (this.beforeTransition) {
      const allowed = await withTimeout(
        this.beforeTransition({
          session: this.session,
          fromStepId: snapshot.stepId,
          toStepId: target,
          direction,
        }),
        this.guardTimeoutMs,
      );
      if (!allowed) return snapshot;
    }

    this.session = transitionBusinessOnboarding(this.session, target, {
      now,
      reason: `host-${direction}`,
    });
    return this.snapshot();
  }

  async next(now = new Date()): Promise<BusinessOnboardingHostSnapshot> {
    return this.move("next", now);
  }

  async back(now = new Date()): Promise<BusinessOnboardingHostSnapshot> {
    return this.move("previous", now);
  }

  pause(
    reason = "user_skip",
    now = new Date(),
  ): BusinessOnboardingHostSnapshot {
    this.session = setBusinessOnboardingStatus(this.session, "PAUSED", {
      now,
      reason,
    });
    return this.snapshot();
  }

  complete(now = new Date()): BusinessOnboardingHostSnapshot {
    this.session = setBusinessOnboardingStatus(this.session, "COMPLETED", {
      now,
      reason: "complete",
    });
    return this.snapshot();
  }

  restart(now = new Date()): BusinessOnboardingHostSnapshot {
    this.session = createBusinessOnboardingSession({
      locale: this.session.selectedLanguage,
      now,
    });
    return this.snapshot();
  }
}
