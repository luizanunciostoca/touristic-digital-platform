import { describe, expect, it, vi } from "vitest";

import {
  MORRO_STARTUP_METRICS,
  recordMorroStartupMetric,
} from "./browser-startup-performance.js";

describe("browser startup performance", () => {
  it("records Assistant readiness from navigation-relative performance time", () => {
    const document = {
      documentElement: { dataset: {} },
      dispatchEvent: vi.fn(),
    } as unknown as Document;
    const mark = vi.fn();

    expect(
      recordMorroStartupMetric(
        document,
        { now: () => 412.4, mark },
        "assistant",
      ),
    ).toBe(412);

    expect(document.documentElement.dataset.assistantStartupMs).toBe("412");
    expect(mark).toHaveBeenCalledWith(MORRO_STARTUP_METRICS.assistant.mark);
    expect(document.dispatchEvent).toHaveBeenCalledOnce();
  });

  it("clamps negative timing values instead of exposing invalid durations", () => {
    const document = {
      documentElement: { dataset: {} },
      dispatchEvent: vi.fn(),
    } as unknown as Document;

    expect(
      recordMorroStartupMetric(document, { now: () => -10 }, "map"),
    ).toBe(0);
    expect(document.documentElement.dataset.mapStartupMs).toBe("0");
  });
});
