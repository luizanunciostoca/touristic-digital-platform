/** P10: deterministic cross-viewport and assistive technology contract. */
export const DEVICES = Object.freeze(
  [
    { id: "mobile-320", width: 320, height: 720 },
    { id: "mobile-360", width: 360, height: 800 },
    { id: "mobile-390", width: 390, height: 844 },
    { id: "mobile-430", width: 430, height: 932 },
    { id: "tablet-768", width: 768, height: 1024 },
    { id: "desktop-1440", width: 1440, height: 900 },
    { id: "short-landscape", width: 844, height: 390 },
  ].map((x) => Object.freeze(x)),
);
export const AUDIT_FEATURES = Object.freeze([
  "first-run",
  "discover",
  "explore",
  "place-peek",
  "place-half",
  "place-full",
  "assistant",
  "route",
  "tour",
  "commerce-test",
  "offline",
  "saved-A",
  "saved-B",
  "header-before-after",
]);
export const A11Y_STATES = Object.freeze([
  "keyboard",
  "200%-zoom",
  "forced-colors",
  "reduced-motion",
  "high-contrast",
  "rtl-he",
  "screen-reader",
]);
export const PINNED_SELECTORS = Object.freeze([
  "#map",
  "#map-container",
  "#unified-assistant-dock",
  "#assistant-input-area",
  "#home-bottom-navigation",
  "#weather-widget",
]);
export const FORBIDDEN_REGRESSIONS = Object.freeze([
  "quick-actions",
  "assistant-floating-launcher",
  "duplicate-place-actions",
  "legacy-source-change",
  "payment-without-readback",
]);
export function auditHitTargets(rects, { minimum = 44 } = {}) {
  const invalid = rects
    .filter(
      (x) =>
        x.interactive === true && (x.width < minimum || x.height < minimum),
    )
    .map((x) => x.name);
  return Object.freeze({ pass: invalid.length === 0, invalid, minimum });
}
export function auditOverlayClashes(rects) {
  const visible = rects.filter((r) => r.visible);
  const overlap = (a, b) =>
    Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
    Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  const collisions = [];
  for (let i = 0; i < visible.length; i++)
    for (let j = i + 1; j < visible.length; j++) {
      const a = visible[i],
        b = visible[j];
      if (
        a.owner === b.owner ||
        a.allowsOverlap?.includes(b.owner) ||
        b.allowsOverlap?.includes(a.owner)
      )
        continue;
      const size = overlap(a, b);
      if (size > 0)
        collisions.push(Object.freeze({ a: a.name, b: b.name, area: size }));
    }
  return Object.freeze({
    pass: collisions.length === 0,
    collisions: Object.freeze(collisions),
  });
}
export function buildQaMatrix({ sha, source = "isolated", runId = null } = {}) {
  if (!/^[a-f0-9]{40}$/.test(sha ?? "")) throw new Error("EXACT_HEAD_REQUIRED");
  return Object.freeze({
    sha,
    source,
    runId,
    status: "PLANNED_NOT_RUN",
    cases: DEVICES.flatMap((d) =>
      AUDIT_FEATURES.map((feature) =>
        Object.freeze({
          id: `${d.id}:${feature}`,
          width: d.width,
          height: d.height,
          feature,
          status: "PENDING_REAL_BROWSER_PROOF",
        }),
      ),
    ),
    assistance: A11Y_STATES,
  });
}
