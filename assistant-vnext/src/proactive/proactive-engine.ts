import type { AssistantPolicyEngine } from "../policy/policy-engine.js";

export interface ProactiveSignal {
  readonly type:
    | "time"
    | "weather"
    | "journey"
    | "proximity"
    | "event"
    | "navigation"
    | "transaction"
    | "returning_user";
  readonly relevance: number;
  readonly criticalFlowActive: boolean;
  readonly key: string;
  readonly message: string;
}

export interface ProactiveSuggestion {
  readonly key: string;
  readonly message: string;
  readonly relevance: number;
}

export class ProactiveEngine {
  private readonly lastShownAt = new Map<string, number>();

  constructor(
    private readonly policy: AssistantPolicyEngine,
    private readonly now: () => number,
    private readonly cooldownMs = 30 * 60 * 1000,
    private readonly threshold = 0.75,
  ) {}

  consider(signal: ProactiveSignal): ProactiveSuggestion | null {
    if (!this.policy.canRunProactive()) return null;
    if (signal.criticalFlowActive || signal.relevance < this.threshold) return null;
    const last = this.lastShownAt.get(signal.key) ?? 0;
    if (this.now() - last < this.cooldownMs) return null;
    this.lastShownAt.set(signal.key, this.now());
    return { key: signal.key, message: signal.message, relevance: signal.relevance };
  }
}
