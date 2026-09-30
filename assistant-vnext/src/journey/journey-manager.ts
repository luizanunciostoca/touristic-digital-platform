import type { Clock, IdGenerator } from "../core/runtime.js";

export const JOURNEY_KINDS = [
  "discover",
  "explore",
  "navigate",
  "eat",
  "stay",
  "tour",
  "event",
  "purchase",
  "support",
] as const;
export type JourneyKind = (typeof JOURNEY_KINDS)[number];

export interface JourneyState {
  readonly id: string;
  readonly kind: JourneyKind;
  readonly goal: string;
  readonly currentStep: string;
  readonly completedSteps: readonly string[];
  readonly pendingSteps: readonly string[];
  readonly context: Readonly<Record<string, unknown>>;
  readonly expiresAt: string;
}

export class JourneyManager {
  private readonly journeys = new Map<string, JourneyState>();

  constructor(
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  start(
    input: Readonly<{
      kind: JourneyKind;
      goal: string;
      steps: readonly string[];
      context?: Readonly<Record<string, unknown>>;
      ttlMs?: number;
    }>,
  ): JourneyState {
    const [first = "start", ...rest] = input.steps;
    const state: JourneyState = {
      id: this.ids.next("journey"),
      kind: input.kind,
      goal: input.goal,
      currentStep: first,
      completedSteps: [],
      pendingSteps: rest,
      context: { ...(input.context ?? {}) },
      expiresAt: new Date(
        this.clock.now().getTime() + (input.ttlMs ?? 4 * 60 * 60 * 1000),
      ).toISOString(),
    };
    this.journeys.set(state.id, state);
    return structuredClone(state);
  }

  advance(id: string): JourneyState | null {
    const state = this.get(id);
    if (!state) return null;
    const [next, ...rest] = state.pendingSteps;
    const updated: JourneyState = next
      ? {
          ...state,
          completedSteps: [...state.completedSteps, state.currentStep],
          currentStep: next,
          pendingSteps: rest,
        }
      : {
          ...state,
          completedSteps: [...state.completedSteps, state.currentStep],
          currentStep: "completed",
          pendingSteps: [],
        };
    this.journeys.set(id, updated);
    return structuredClone(updated);
  }

  get(id: string): JourneyState | null {
    const state = this.journeys.get(id);
    if (!state) return null;
    if (new Date(state.expiresAt).getTime() <= this.clock.now().getTime()) {
      this.journeys.delete(id);
      return null;
    }
    return structuredClone(state);
  }
}
