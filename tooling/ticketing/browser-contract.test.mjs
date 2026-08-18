import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(
  "apps/morro-digital-platform/public/tickets.html",
  "utf8",
);
const script = await readFile(
  "apps/morro-digital-platform/public/ticketing.js",
  "utf8",
);

test("Ticketing browser surface exposes the authenticated reservation flow", () => {
  assert.match(html, /id="reservation-form"/);
  assert.match(html, /id="reserve-button"/);
  assert.match(html, /id="reservations"/);
  assert.match(html, /ticketing\.js/);
  assert.match(script, /\/api\/ticketing\/v1\/inventory/);
  assert.match(script, /\/api\/ticketing\/v1\/reservations/);
  assert.match(script, /\/api\/payments\/v1\/checkouts/);
  assert.match(script, /\/ticket/);
  assert.match(script, /status === "confirmed"/);
  assert.match(script, /status === "held"/);
});

test("Ticketing browser surface fails closed on malformed checkout handoff", () => {
  assert.match(script, /CHECKOUT_HANDOFF_INVALID/);
  assert.match(
    script,
    /descriptor\.handoff\.reservationReference !== descriptor\.reservationReference/,
  );
  assert.match(script, /credentials: "same-origin"/);
});
