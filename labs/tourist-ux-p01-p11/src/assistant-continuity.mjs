/** P06: proofable assistant/map/place continuity policy; does not replace V1 orchestrator. */
export const APPROVED_CATEGORY_ORDER = Object.freeze([
  "beaches",
  "tours",
  "attractions",
  "restaurants",
  "hotels",
  "nightlife",
  "shops",
  "transport",
  "emergencies",
  "help",
]);
export const BOTTOM_NAV = Object.freeze([
  "explore",
  "tours",
  "saved",
  "tickets",
  "profile",
]);
const SAVABLE = [
  "discover",
  "place",
  "assistant",
  "commerce",
  "navigation",
  "tour",
];
export function validateApprovedShell(document) {
  const selectors = [
    "#map-container",
    "#map",
    "#assistant-input-area",
    "#home-bottom-navigation",
  ];
  const missing = selectors.filter((s) => !document.querySelector(s));
  const disallowed = [
    ".quick-actions",
    ".floating-assistant-launcher",
    "[data-assistant-fab]",
  ].filter((s) => document.querySelector(s));
  const dock = document.querySelector("#unified-assistant-dock");
  const composer = document.querySelector("#assistant-input-area");
  const dockContainsComposer = Boolean(
    dock && composer && dock.contains(composer),
  );
  return Object.freeze({
    pass:
      missing.length === 0 && disallowed.length === 0 && dockContainsComposer,
    missing,
    disallowed,
    dockContainsComposer,
  });
}
export function captureContinuity({
  mode = "discover",
  category = null,
  placeId = null,
  locale = "pt-BR",
  camera = null,
  sheetState = null,
  assistantContextId = null,
  scrollY = 0,
} = {}) {
  if (!SAVABLE.includes(mode)) throw new Error("INVALID_UX_MODE");
  if (sheetState && !["peek", "half", "full"].includes(sheetState))
    throw new Error("INVALID_PLACE_SHEET");
  const center = camera?.center;
  if (
    center &&
    (!Array.isArray(center) ||
      center.length !== 2 ||
      center.some((x) => !Number.isFinite(x)))
  )
    throw new Error("INVALID_MAP_CAMERA");
  return Object.freeze({
    mode,
    category,
    placeId,
    locale,
    camera: center
      ? Object.freeze({
          center: [...center],
          zoom: camera.zoom,
          bearing: camera.bearing,
          pitch: camera.pitch,
        })
      : null,
    sheetState,
    assistantContextId,
    scrollY,
  });
}
export function planContinuityTransition(
  snapshot,
  event,
  { placeHasFullAuthority = false } = {},
) {
  if (!snapshot || !SAVABLE.includes(snapshot.mode))
    throw new Error("INVALID_SNAPSHOT");
  const known = [
    "open-assistant",
    "close-assistant",
    "open-place",
    "close-place",
    "open-commerce",
    "return-from-commerce",
    "start-navigation",
    "stop-navigation",
    "start-tour",
    "stop-tour",
  ];
  if (!known.includes(event)) throw new Error("UNKNOWN_TRANSITION");
  let next = snapshot.mode;
  if (event === "open-assistant") next = "assistant";
  if (event === "close-assistant")
    next = snapshot.placeId ? "place" : "discover";
  if (event === "open-place") next = "place";
  if (event === "close-place") next = "discover";
  if (event === "open-commerce") next = "commerce";
  if (event === "return-from-commerce")
    next = snapshot.placeId ? "place" : "discover";
  if (event === "start-navigation") next = "navigation";
  if (event === "stop-navigation")
    next = snapshot.placeId ? "place" : "discover";
  if (event === "start-tour") next = "tour";
  if (event === "stop-tour") next = snapshot.placeId ? "place" : "discover";
  return Object.freeze({
    mode: next,
    restore: Object.freeze({
      camera: snapshot.camera,
      category: snapshot.category,
      placeId: snapshot.placeId,
      locale: snapshot.locale,
      assistantContextId: snapshot.assistantContextId,
      sheetState: snapshot.sheetState,
      scrollY: snapshot.scrollY,
    }),
    mapOwner: "Mapbox",
    placeOwner: next === "place" ? "Place" : "none",
    assistantComposer:
      placeHasFullAuthority && next === "place" ? "compact" : "persistent",
    duplicateActionsAllowed: false,
    requireBrowserReadback: true,
  });
}
export const CONTINUITY_JOURNEYS = Object.freeze([
  "url-to-home",
  "qr-to-home",
  "explore-to-place",
  "place-to-assistant",
  "assistant-to-route",
  "route-to-place",
  "place-to-commerce-test",
  "commerce-back-to-place",
  "browser-back",
  "place-close",
  "offline-return",
  "locale-return",
]);
