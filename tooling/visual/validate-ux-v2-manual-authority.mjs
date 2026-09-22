import { readFileSync, writeFileSync } from "node:fs";

const matrix = JSON.parse(
  readFileSync(
    "tests/visual-regression/ux-v2-manual-reference-matrix.json",
    "utf8",
  ),
);
const conformance = JSON.parse(
  readFileSync("tests/visual-regression/ux-v2-manual-conformance.json", "utf8"),
);

const requiredSurfaces = [
  "discover",
  "place",
  "searchExplore",
  "navigation",
  "tour",
  "assistant",
  "commerce",
  "ticketing",
];
const requiredViewports = [
  "360x800",
  "390x844",
  "430x932",
  "768x1024",
  "1440x900",
  "compact-landscape",
];
const requiredVariants = [
  "light",
  "dark",
  "text-200",
  "forced-colors",
  "reduced-motion",
];
const requiredFields = [
  "state",
  "expectedHierarchy",
  "expectedDominantRegion",
  "expectedControls",
  "expectedHiddenControls",
  "geometryConstraints",
  "manualReference",
];
const errors = [];

for (const key of requiredSurfaces) {
  const surface = matrix.surfaces?.[key];
  if (!surface) {
    errors.push("missing surface: " + key);
    continue;
  }
  for (const field of requiredFields) {
    const value = surface[field];
    if (
      value == null ||
      value === "" ||
      (Array.isArray(value) && value.length === 0)
    ) {
      errors.push(key + " missing " + field);
    }
  }
}
for (const id of requiredViewports) {
  if (!matrix.viewports?.some((v) => v.id === id))
    errors.push("missing viewport: " + id);
}
for (const variant of requiredVariants) {
  if (!matrix.variants?.includes(variant))
    errors.push("missing variant: " + variant);
}
if (matrix.goldenPolicy?.freezeRequiresManualReview !== true)
  errors.push("manual review is not mandatory");
if (matrix.goldenPolicy?.currentScreenshotIsNeverAuthorityByDefault !== true)
  errors.push("self-regression can become authority");
const forbiddenMasks = new Set(matrix.goldenPolicy?.forbiddenMaskTargets || []);
for (const key of [
  "controls",
  "sheets",
  "navigation",
  "cta",
  "cards",
  "typography",
]) {
  if (!forbiddenMasks.has(key))
    errors.push("mask policy does not protect " + key);
}

const forbidden = new Set(
  conformance.certification?.forbiddenWhileAnyStatusMatches || [],
);
const blocking = Object.entries(conformance.surfaces || {})
  .filter(([, surface]) => forbidden.has(surface.status))
  .map(([surface, value]) => ({ surface, status: value.status }));

const forbiddenGateStatuses = new Set(
  conformance.certification?.forbiddenGateStatuses || ["PENDING", "FAIL"],
);
const gateBlocking = Object.entries(conformance.certification?.gates || {})
  .filter(([, gate]) => forbiddenGateStatuses.has(gate.status))
  .map(([gate, value]) => ({ gate, status: value.status }));

const report = {
  manualAuthority: matrix.manualAuthority,
  appendix: matrix.appendix,
  matrixValid: errors.length === 0,
  blocking,
  gateBlocking,
  releaseEnforced: process.argv.includes("--enforce-release"),
  errors,
};
writeFileSync(
  "/tmp/ux-v2-manual-golden-authority.json",
  JSON.stringify(report, null, 2),
);

if (errors.length) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
if (
  process.argv.includes("--enforce-release") &&
  (blocking.length || gateBlocking.length)
) {
  console.error("MANUAL_VISUAL_CONFORMANCE_BLOCKED");
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(JSON.stringify(report, null, 2));
