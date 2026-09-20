export const MORRO_STARTUP_METRICS = Object.freeze({
  assistant: Object.freeze({
    mark: "morro:assistant-ready",
    datasetKey: "assistantStartupMs",
  }),
  map: Object.freeze({
    mark: "morro:map-ready",
    datasetKey: "mapStartupMs",
  }),
} as const);

export type MorroStartupMetric = keyof typeof MORRO_STARTUP_METRICS;

export interface BrowserStartupPerformancePort {
  now(): number;
  mark?(name: string): void;
}

export function recordMorroStartupMetric(
  document: Document,
  performance: BrowserStartupPerformancePort,
  metric: MorroStartupMetric,
): number {
  const value = Math.max(0, Math.round(performance.now()));
  const definition = MORRO_STARTUP_METRICS[metric];

  document.documentElement.dataset[definition.datasetKey] = String(value);
  performance.mark?.(definition.mark);

  document.dispatchEvent(
    new CustomEvent("morro:startup-performance", {
      detail: Object.freeze({
        metric,
        durationMs: value,
      }),
    }),
  );

  return value;
}
