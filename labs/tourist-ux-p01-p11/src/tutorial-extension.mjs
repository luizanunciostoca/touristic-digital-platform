/** P05: six existing anchors unchanged; Explore and Place->action appended by opt-in. */
const ORIGINAL = Object.freeze([
  Object.freeze({ key: "map", selectors: ["#map-container", "#map"] }),
  Object.freeze({ key: "weather", selectors: ["#weather-widget"] }),
  Object.freeze({ key: "assistant", selectors: ["#assistant-input-area"] }),
  Object.freeze({
    key: "voice",
    selectors: ["#voiceButton", "#assistant-input-area"],
  }),
  Object.freeze({ key: "profile", selectors: ["#home-profile-button"] }),
  Object.freeze({ key: "perspective", selectors: ["#toggle-globe-view"] }),
]);
const EXTRA = Object.freeze([
  Object.freeze({
    key: "explore",
    selectors: [
      "#unified-assistant-dock [data-category]",
      '[data-home-nav-action="explore"]',
    ],
  }),
  Object.freeze({
    key: "place-action",
    selectors: [
      "#place-bottom-sheet .place-bottom-sheet-actions",
      "#place-bottom-sheet .place-bottom-sheet-primary",
    ],
  }),
]);
export const TUTORIAL_STEPS = Object.freeze([...ORIGINAL, ...EXTRA]);
export const EXISTING_STEP_KEYS = Object.freeze(ORIGINAL.map((s) => s.key));
export const TUTORIAL_EXTENSION_PROGRESS_KEY =
  "morro-digital-tutorial-extension-v1";
export function restoreTutorial({
  existingCompleted = false,
  extensionChoice = false,
  persisted = null,
} = {}) {
  if (existingCompleted && !extensionChoice)
    return Object.freeze({
      state: "preserved-complete",
      index: 0,
      steps: [],
      shouldReplay: false,
    });
  const parsed = (() => {
    try {
      return typeof persisted === "string" ? JSON.parse(persisted) : persisted;
    } catch {
      return null;
    }
  })();
  const index =
    parsed?.version === 1 && Number.isInteger(parsed.index)
      ? Math.min(Math.max(0, parsed.index), 7)
      : existingCompleted
        ? 6
        : 0;
  const steps = existingCompleted ? EXTRA : TUTORIAL_STEPS;
  return Object.freeze({
    state: parsed?.completed ? "completed" : "in_progress",
    index: existingCompleted ? Math.max(0, index - 6) : index,
    steps,
    shouldReplay: !parsed?.completed,
  });
}
export function tutorialAdvance(session, action) {
  if (!session || !Array.isArray(session.steps))
    throw new Error("INVALID_TUTORIAL_SESSION");
  if (session.state === "preserved-complete") return session;
  if (action === "skip" || action === "finish")
    return Object.freeze({
      ...session,
      state: action === "skip" ? "skipped" : "completed",
      shouldReplay: false,
    });
  if (action !== "next" && action !== "back")
    throw new Error("INVALID_TUTORIAL_ACTION");
  const next = Math.max(
    0,
    Math.min(
      session.steps.length - 1,
      session.index + (action === "next" ? 1 : -1),
    ),
  );
  return Object.freeze({ ...session, index: next, state: "in_progress" });
}
export function serializeTutorial(session) {
  return JSON.stringify({
    version: 1,
    index: session.index,
    completed: session.state === "completed" || session.state === "skipped",
  });
}
export function currentTutorialTarget(session, document) {
  const entry = session.steps[session.index];
  if (!entry) return null;
  for (const selector of entry.selectors) {
    const node = document.querySelector(selector);
    if (node && !node.hidden) return node;
  }
  return null; // tell the user this target isn't ready, don't falsely mark it complete
}
