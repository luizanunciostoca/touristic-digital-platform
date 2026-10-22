import assert from "node:assert/strict";

// Transitional validator compatibility only. Exact image contracts and the
// mandatory HIGH/CRITICAL image scan remain release authorities.
const approvedBuilders = Object.freeze([
  "golang:1.26.9-bookworm@sha256:d9c68c2c51161e12fd77e4c6320687c9cd86e1af1e3ad6e6cd63ff970641453c",
  "golang:1.26.10-bookworm@sha256:632dff7351799a5a9954a48dc06670ade72ee44e8c351cdc0e5a57af2fea21af",
]);

export function assertApprovedMysqlGosuBuilder(source) {
  const firstLine = source.split(/\r?\n/u)[0];
  const approved = approvedBuilders.some(
    (image) => firstLine === `FROM ${image} AS gosu-builder`,
  );
  const active = source
    .split(/\r?\n/u)
    .filter((line) => !line.trimStart().startsWith("#"))
    .join("\n")
    .replace(/\\\n/gu, " ");
  const stages = [
    ...active.matchAll(/^\s*FROM\b[^\n]*\bAS\s+gosu-builder(?:\s|$)/gimu),
  ];
  assert.ok(
    approved && stages.length === 1,
    "Missing production MySQL active directive: pinned Go builder image (exact approved tag/digest and unique stage required)",
  );
}
