export interface ShadowComparison {
  readonly intentMatch: boolean;
  readonly toolSetMatch: boolean;
  readonly latencyDeltaMs: number;
  readonly legacyIntent: string;
  readonly vnextIntent: string;
}
export interface ShadowMetrics {
  readonly runs: number;
  readonly intentMatches: number;
  readonly toolSetMatches: number;
  readonly averageLatencyDeltaMs: number;
}
export class ShadowComparator {
  compare(
    args: Readonly<{
      legacy: { intent: string; tools: readonly string[]; latencyMs: number };
      vnext: { intent: string; tools: readonly string[]; latencyMs: number };
    }>,
  ): ShadowComparison {
    const normalize = (values: readonly string[]) => [...new Set(values)].sort();
    return {
      intentMatch: args.legacy.intent === args.vnext.intent,
      toolSetMatch:
        JSON.stringify(normalize(args.legacy.tools)) ===
        JSON.stringify(normalize(args.vnext.tools)),
      latencyDeltaMs: args.vnext.latencyMs - args.legacy.latencyMs,
      legacyIntent: args.legacy.intent,
      vnextIntent: args.vnext.intent,
    };
  }
}
export class ShadowRunner {
  private readonly comparisons: ShadowComparison[] = [];
  private readonly pending = new Set<Promise<void>>();

  constructor(private readonly comparator: ShadowComparator) {}

  run<TLegacy, TVNext>(
    args: Readonly<{
      legacy: () => Promise<TLegacy>;
      vnext: () => Promise<TVNext>;
      summarizeLegacy: (
        value: TLegacy,
        latencyMs: number,
      ) => { intent: string; tools: readonly string[]; latencyMs: number };
      summarizeVNext: (
        value: TVNext,
        latencyMs: number,
      ) => { intent: string; tools: readonly string[]; latencyMs: number };
      now?: () => number;
    }>,
  ): Promise<TLegacy> {
    const now = args.now ?? Date.now;
    const legacyStarted = now();
    const legacyPromise = args.legacy().then((value) => ({
      value,
      latencyMs: Math.max(0, now() - legacyStarted),
    }));
    const vnextStarted = now();
    const vnextPromise = args.vnext().then((value) => ({
      value,
      latencyMs: Math.max(0, now() - vnextStarted),
    }));

    const work = Promise.all([legacyPromise, vnextPromise])
      .then(([legacy, vnext]) => {
        this.comparisons.push(
          this.comparator.compare({
            legacy: args.summarizeLegacy(legacy.value, legacy.latencyMs),
            vnext: args.summarizeVNext(vnext.value, vnext.latencyMs),
          }),
        );
      })
      .catch(() => {
        // Shadow failures never affect the legacy authority.
      });
    this.pending.add(work);
    void work.finally(() => this.pending.delete(work));
    return legacyPromise.then(({ value }) => value);
  }

  async drain(): Promise<void> {
    await Promise.allSettled([...this.pending]);
  }

  metrics(): ShadowMetrics {
    const runs = this.comparisons.length;
    return {
      runs,
      intentMatches: this.comparisons.filter((item) => item.intentMatch).length,
      toolSetMatches: this.comparisons.filter((item) => item.toolSetMatch).length,
      averageLatencyDeltaMs:
        runs === 0
          ? 0
          : this.comparisons.reduce((sum, item) => sum + item.latencyDeltaMs, 0) / runs,
    };
  }
}
