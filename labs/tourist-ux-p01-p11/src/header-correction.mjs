/** P07: opt-in cosmetic overlay ONLY for confirmed header/container halo. */
export const HEADER_TEST_VIEWPORTS = Object.freeze([360, 390, 430, 768]);
export const HEADER_CORRECTION_CSS = `/* Isolated P07 preview; never inject without normalized before/after approval */
html[data-p07-header-approved="true"] body[data-md-mode="discover"] .md-home-header-inner {
  box-shadow: none;
}
html[data-p07-header-approved="true"] .md-home-header h1,
html[data-p07-header-approved="true"] .md-home-header .tagline { text-shadow: none; }
/* Deliberately DO NOT touch #weather-widget: weather elevation is independent. */`;
export function approveHeaderPreview({
  baselineCaptured,
  haloConfirmed,
  comparisonReviewed,
} = {}) {
  return Object.freeze({
    enable: Boolean(baselineCaptured && haloConfirmed && comparisonReviewed),
    requiredScreens: HEADER_TEST_VIEWPORTS.map((width) =>
      Object.freeze({ width, before: true, after: true }),
    ),
    selector: ".md-home-header-inner",
    weatherMustRemainUnchanged: true,
  });
}
