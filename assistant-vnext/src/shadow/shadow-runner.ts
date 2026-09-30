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
  constructor(private readonly comparator: ShadowComparator) {}

  async run<TLegacy, TVNext>(
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
    const legacyStart = now();
    const legacyValue = await args.legacy();
    const legacyLatency = Math.max(0, now() - legacyStart);

    const vnextStart = now();
    try {
      const vnextValue = await args.vnext();
      const vnextLatency = Math.max(0, now() - vnextStart);
      this.comparisons.push(
        this.comparator.compare({
          legacy: args.summarizeLegacy(legacyValue, legacyLatency),
          vnext: args.summarizeVNext(vnextValue, vnextLatency),
        }),
      );
    } catch {
      // Shadow failures never affect legacy authority.
    }
    return legacyValue;
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
