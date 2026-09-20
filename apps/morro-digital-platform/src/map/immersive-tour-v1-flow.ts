export type V1ImmersiveTourStage =
  | "idle"
  | "intro"
  | "list"
  | "stop"
  | "finale";

export interface V1ImmersiveTourState {
  readonly stage: V1ImmersiveTourStage;
  readonly tourId: string | null;
  readonly currentStopIndex: number;
  readonly totalStops: number;
}

export type V1ImmersiveTourAction =
  | Readonly<{ type: "show_first_stop" }>
  | Readonly<{ type: "show_list" }>
  | Readonly<{ type: "go_to_stop"; index: number }>
  | Readonly<{ type: "next" }>
  | Readonly<{ type: "previous" }>
  | Readonly<{ type: "finish" }>
  | Readonly<{ type: "stop" }>;

export const idleV1ImmersiveTourState: V1ImmersiveTourState = Object.freeze({
  stage: "idle",
  tourId: null,
  currentStopIndex: 0,
  totalStops: 0,
});

function freezeState(
  stage: V1ImmersiveTourStage,
  tourId: string | null,
  currentStopIndex: number,
  totalStops: number,
): V1ImmersiveTourState {
  return Object.freeze({ stage, tourId, currentStopIndex, totalStops });
}

export function startV1ImmersiveTourState(
  tourId: string,
  totalStops: number,
): V1ImmersiveTourState {
  if (!tourId.trim()) throw new Error("Immersive tour id is required.");
  if (!Number.isInteger(totalStops) || totalStops < 1) {
    throw new Error("Immersive tour requires at least one stop.");
  }

  return freezeState("intro", tourId, 0, totalStops);
}

export function transitionV1ImmersiveTourState(
  state: V1ImmersiveTourState,
  action: V1ImmersiveTourAction,
): V1ImmersiveTourState {
  if (action.type === "stop") return idleV1ImmersiveTourState;
  if (state.stage === "idle" || !state.tourId || state.totalStops < 1) {
    return state;
  }

  if (action.type === "show_first_stop") {
    return freezeState("stop", state.tourId, 0, state.totalStops);
  }

  if (action.type === "show_list") {
    return freezeState(
      "list",
      state.tourId,
      state.currentStopIndex,
      state.totalStops,
    );
  }

  if (action.type === "go_to_stop") {
    if (
      !Number.isInteger(action.index) ||
      action.index < 0 ||
      action.index >= state.totalStops
    ) {
      return state;
    }
    return freezeState(
      "stop",
      state.tourId,
      action.index,
      state.totalStops,
    );
  }

  if (action.type === "previous") {
    if (state.currentStopIndex <= 0) return state;
    return freezeState(
      "stop",
      state.tourId,
      state.currentStopIndex - 1,
      state.totalStops,
    );
  }

  if (action.type === "next") {
    if (state.currentStopIndex >= state.totalStops - 1) {
      return freezeState(
        "finale",
        state.tourId,
        state.currentStopIndex,
        state.totalStops,
      );
    }
    return freezeState(
      "stop",
      state.tourId,
      state.currentStopIndex + 1,
      state.totalStops,
    );
  }

  return freezeState(
    "finale",
    state.tourId,
    state.currentStopIndex,
    state.totalStops,
  );
}
