import type { AssistantLocale } from "../core/contracts.js";

export const EVAL_CATEGORIES = [
  "intent",
  "multi-turn",
  "tool-selection",
  "grounding",
  "hallucination",
  "action-safety",
  "confirmation",
  "navigation",
  "commerce",
  "ticketing",
  "payments",
  "memory",
  "language",
  "recovery",
] as const;
export type EvalCategory = (typeof EVAL_CATEGORIES)[number];

export interface EvalCase<TActual> {
  readonly id: string;
  readonly category: EvalCategory;
  readonly locale: AssistantLocale;
  readonly input: string;
  run(): Promise<TActual>;
  score(actual: TActual): Readonly<{ pass: boolean; reason: string }>;
}

export interface EvalResult {
  readonly id: string;
  readonly category: EvalCategory;
  readonly pass: boolean;
  readonly reason: string;
}

export interface EvalSummary {
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly passRate: number;
  readonly results: readonly EvalResult[];
}

export class AssistantEvalRunner {
  async run<T>(cases: readonly EvalCase<T>[]): Promise<EvalSummary> {
    const results: EvalResult[] = [];
    for (const item of cases) {
      try {
        const actual = await item.run();
        const scored = item.score(actual);
        results.push({ id: item.id, category: item.category, ...scored });
      } catch (cause) {
        results.push({
          id: item.id,
          category: item.category,
          pass: false,
          reason: cause instanceof Error ? cause.message : "eval execution failed",
        });
      }
    }
    const passed = results.filter((result) => result.pass).length;
    return {
      total: results.length,
      passed,
      failed: results.length - passed,
      passRate: results.length === 0 ? 1 : passed / results.length,
      results,
    };
  }
}
