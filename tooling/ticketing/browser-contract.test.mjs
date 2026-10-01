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
const tourBooking = await readFile(
  "apps/morro-digital-platform/public/tour-booking.html",
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

test("Tour booking confirms only after required identity fields", () => {
  const name = tourBooking.indexOf('id="holder-name"');
  const email = tourBooking.indexOf('id="holder-email"');
  const reserve = tourBooking.indexOf('id="reserve-button"');
  assert.ok(name > -1 && email > name && reserve > email);
  assert.doesNotMatch(tourBooking, /novalidate/u);
  assert.match(tourBooking, /id="quantity"[\s\S]*?form="reservation-form"/u);
  const reservationForm = tourBooking.match(
    /<form id="reservation-form"[\s\S]*?<\/form>/u,
  )?.[0];
  assert.ok(reservationForm);
  assert.doesNotMatch(
    reservationForm.match(
      /<button[\s\S]*?id="reserve-button"[\s\S]*?<\/button>/u,
    )?.[0] ?? "",
    /form="reservation-form"/u,
  );
  assert.match(script, /elements\.form\.checkValidity\(\)/u);
  assert.match(script, /Array\.from\(elements\.form\.elements\)/u);
  assert.match(script, /scrollIntoView/u);
});
