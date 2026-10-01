import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const BASE_SHA = "37eb641eefa91f57d8d74c1dc87894c2da36f3ae";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const laneRoot = path.join(root, "tooling/integration/phase20-commerce-ticketing-affiliates");

function git(...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function file(relative) {
  return readFileSync(path.join(root, relative), "utf8");
}

test("lane is based on the frozen Phase 19 baseline and changes only lane-owned files", () => {
  assert.equal(git("merge-base", BASE_SHA, "HEAD"), BASE_SHA);
  const changed = git("diff", "--name-only", BASE_SHA + "...HEAD")
    .split("\n")
    .filter(Boolean);
  assert.ok(changed.length > 0);
  assert.ok(
    changed.every((entry) =>
      entry.startsWith("tooling/integration/phase20-commerce-ticketing-affiliates/"),
    ),
    "unexpected changed paths: " + changed.join(", "),
  );
  assert.equal(changed.some((entry) => entry.startsWith(".github/")), false);
  assert.equal(changed.includes("package.json"), false);
  assert.equal(changed.includes("pnpm-lock.yaml"), false);
});

test("IF-COM-005 remains a transport semantic contract gap", () => {
  const schema = file("services/ticketing/src/transport-product-kind-schema.ts");
  const reservation = file("services/ticketing/src/reservation-schema.ts");
  const packageIndex = file("packages/ticketing/src/index.ts");
  assert.match(schema, /transport/u);
  assert.match(packageIndex, /transport/u);
  assert.match(reservation, /transport/u);
  for (const field of [
    "origin_stop_id",
    "destination_stop_id",
    "operator_id",
    "trip_id",
    "boarding_at",
  ]) {
    assert.equal(reservation.includes(field), false, field + " unexpectedly became canonical");
  }
});

test("IF-COM-006 still has no canonical lodging reservation capability", () => {
  const commerce = file("packages/commerce/src/index.ts");
  const restaurant = file("packages/commerce/src/restaurant-reservations.ts");
  const ticketing = file("packages/ticketing/src/index.ts");
  const combined = commerce + "\n" + restaurant + "\n" + ticketing;
  assert.doesNotMatch(combined, /LodgingReservationV1|inventory[_-]night|rate[_-]plan|room[_-]inventory/iu);
});

test("IF-BIZ-010 is revalidated only; business reservation ownership was not invented", () => {
  const ticketing = file("services/ticketing/src/commerce-public-http-transport.ts");
  const commerce = file("apps/morro-digital-platform/tooling/commerce-api.mjs");
  const consumerTicketing = file("services/ticketing/src/public-http-transport.ts");
  assert.match(ticketing, /operator\\\/businesses\\\//u);
  assert.match(ticketing, /inventory/u);
  assert.doesNotMatch(ticketing, /operator\\\/businesses\\\/.*\\\/reservations/u);
  assert.match(commerce, /restaurant-slots/u);
  assert.doesNotMatch(commerce, /operator\\\/businesses\\\/.*\\\/reservations/u);
  assert.match(consumerTicketing, /listReservationsByHolderReference/u);
});

test("IF-AFF-002 owner primitives exist but self-onboarding HTTP orchestration remains unapproved", () => {
  const identity = file("services/affiliates/src/affiliate-identity-application-service.ts");
  const api = file("apps/morro-digital-platform/tooling/affiliates-api.mjs");
  assert.match(identity, /async createAffiliate\(/u);
  assert.match(identity, /async createMembership\(/u);
  assert.doesNotMatch(api, /self-onboard|self_onboard|self-onboarding/iu);
});

test("IF-AFF-006 keeps server referral authority while canonical QR export remains absent", () => {
  const api = file("apps/morro-digital-platform/tooling/affiliates-api.mjs");
  const client = file("apps/morro-digital-platform/src/affiliate-portal-client.ts");
  const entry = file("apps/morro-digital-platform/src/affiliate-portal-entry.ts");
  assert.match(api, /referral-links/u);
  assert.match(api, /issueAffiliateReferralToken/u);
  assert.match(client, /issueReferralLink/u);
  assert.doesNotMatch(client, /\bqr\b|download/iu);
  assert.doesNotMatch(entry, /createObjectURL|download\s*=|qrSvg/iu);
});

test("lane core has no network/provider client and is not runtime-wired", () => {
  const coreFiles = readdirSync(laneRoot)
    .filter((name) => name.endsWith(".mjs"))
    .map((name) => file("tooling/integration/phase20-commerce-ticketing-affiliates/" + name));
  const combined = coreFiles.join("\n");
  assert.doesNotMatch(combined, /\bfetch\s*\(/u);
  assert.doesNotMatch(combined, /from\s+["'](?:axios|stripe|mercadopago|qrcode|playwright|puppeteer)["']/iu);
  assert.match(combined, /RUNTIME_BINDING_NOT_APPROVED/u);
  assert.match(combined, /externalProviderCallsAllowed:\s*false/u);
});
