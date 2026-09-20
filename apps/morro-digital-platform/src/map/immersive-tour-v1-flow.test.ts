import { describe, expect, it } from "vitest";

import {
  idleV1ImmersiveTourState,
  startV1ImmersiveTourState,
  transitionV1ImmersiveTourState,
} from "./immersive-tour-v1-flow.js";

describe("V1 immersive tour state machine", () => {
  it("starts at the introduction and enters the first stop exactly like V1", () => {
    const intro = startV1ImmersiveTourState("volta-a-ilha", 8);
    expect(intro).toEqual({
      stage: "intro",
      tourId: "volta-a-ilha",
      currentStopIndex: 0,
      totalStops: 8,
    });

    expect(
      transitionV1ImmersiveTourState(intro, { type: "show_first_stop" }),
    ).toEqual({
      stage: "stop",
      tourId: "volta-a-ilha",
      currentStopIndex: 0,
      totalStops: 8,
    });
  });

  it("supports the V1 stop list and direct navigation to any valid stop", () => {
    const intro = startV1ImmersiveTourState("trilha-gamboa", 5);
    const list = transitionV1ImmersiveTourState(intro, { type: "show_list" });
    expect(list.stage).toBe("list");

    const selected = transitionV1ImmersiveTourState(list, {
      type: "go_to_stop",
      index: 3,
    });
    expect(selected).toMatchObject({ stage: "stop", currentStopIndex: 3 });

    expect(
      transitionV1ImmersiveTourState(selected, {
        type: "go_to_stop",
        index: 99,
      }),
    ).toBe(selected);
  });

  it("moves previous/next and converts next on the final stop into the finale", () => {
    const intro = startV1ImmersiveTourState("passeio-quadriciclo", 3);
    const first = transitionV1ImmersiveTourState(intro, {
      type: "show_first_stop",
    });
    const second = transitionV1ImmersiveTourState(first, { type: "next" });
    const third = transitionV1ImmersiveTourState(second, { type: "next" });

    expect(second.currentStopIndex).toBe(1);
    expect(third).toMatchObject({ stage: "stop", currentStopIndex: 2 });
    expect(
      transitionV1ImmersiveTourState(third, { type: "next" }),
    ).toMatchObject({ stage: "finale", currentStopIndex: 2 });
    expect(
      transitionV1ImmersiveTourState(second, { type: "previous" }),
    ).toMatchObject({ stage: "stop", currentStopIndex: 0 });
    expect(transitionV1ImmersiveTourState(first, { type: "previous" })).toBe(
      first,
    );
  });

  it("finishes explicitly and resets completely when the tour is stopped", () => {
    const intro = startV1ImmersiveTourState("volta-a-ilha", 8);
    const first = transitionV1ImmersiveTourState(intro, {
      type: "show_first_stop",
    });
    const finale = transitionV1ImmersiveTourState(first, { type: "finish" });

    expect(finale.stage).toBe("finale");
    expect(transitionV1ImmersiveTourState(finale, { type: "stop" })).toBe(
      idleV1ImmersiveTourState,
    );
  });

  it("rejects invalid starts instead of creating a corrupt tour state", () => {
    expect(() => startV1ImmersiveTourState("", 3)).toThrow(
      "Immersive tour id is required.",
    );
    expect(() => startV1ImmersiveTourState("volta-a-ilha", 0)).toThrow(
      "Immersive tour requires at least one stop.",
    );
  });
});
