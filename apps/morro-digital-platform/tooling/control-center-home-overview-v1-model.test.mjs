import assert from "node:assert/strict";
import test from "node:test";

import { buildHomeModelV1 } from "../public/control-center-home-overview-v1.js";

function fixtureDestinations(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: "destination-" + (index + 1),
    status: "active",
    branding: { name: "Destino " + (index + 1) },
  }));
}

function attentionItems(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: "attention-" + index,
    kind: index % 2 ? "support-open" : "business-approval",
    count: 1,
    severity: index === 0 ? "critical" : "warning",
    destinationId: "destination-1",
    createdAt: new Date(Date.UTC(2026, 8, 22, index)).toISOString(),
  }));
}

for (const count of [0, 1, 4, 7]) {
  test("attention visual cap preserves known count: " + count, () => {
    const model = buildHomeModelV1({
      dashboard: {
        summary: { businesses: 3 },
        attention: { status: "READY", count, items: attentionItems(count) },
      },
      destinations: fixtureDestinations(1),
      destinationAvailable: true,
      auditAvailable: true,
      affiliateAvailable: true,
      scope: { scope: "global", destinationId: null },
    });
    assert.equal(model.attention.count, count);
    assert.equal(model.attention.items.length, Math.min(count, 4));
    assert.equal(model.attention.hiddenCount, Math.max(0, count - 4));
  });
}

for (const count of [0, 1, 2, 6]) {
  test(
    "destination summary supports exact authorized cardinality: " + count,
    () => {
      const destinations = fixtureDestinations(count);
      const model = buildHomeModelV1({
        dashboard: { summary: { businesses: 9 } },
        destinations,
        destinationAvailable: true,
        auditAvailable: true,
        scope: { scope: "global", destinationId: null },
      });
      assert.equal(model.destinations.rows.length, count);
      assert.deepEqual(
        model.destinations.rows.map((row) => row.destinationId),
        destinations.map((destination) => destination.id),
      );
    },
  );
}

test("does not fabricate absent owner metrics as zero", () => {
  const model = buildHomeModelV1({
    dashboard: { summary: { businesses: 12 } },
    affiliates: Array.from({ length: 250 }, (_, index) => ({
      id: String(index),
    })),
    destinations: fixtureDestinations(1),
    affiliateAvailable: true,
    destinationAvailable: true,
    auditAvailable: false,
    scope: { scope: "global", destinationId: null },
  });
  const byKey = Object.fromEntries(
    model.metrics.map((metric) => [metric.key, metric]),
  );
  assert.equal(byKey.businesses.value, "12");
  assert.equal(byKey.affiliates.value, "—");
  assert.equal(byKey.affiliates.state, "partial");
  assert.equal(byKey.reservations.value, "—");
  assert.equal(byKey.revenue.value, "—");
  assert.equal(byKey.alerts.value, "—");
});

test("destination scope never reuses a global business total", () => {
  const model = buildHomeModelV1({
    dashboard: { summary: { businesses: 99 } },
    destinations: fixtureDestinations(2),
    destinationAvailable: true,
    affiliateAvailable: true,
    auditAvailable: true,
    scope: { scope: "destination", destinationId: "destination-2" },
  });
  const business = model.metrics.find((metric) => metric.key === "businesses");
  assert.equal(business.value, "—");
  assert.equal(business.state, "unavailable");
  assert.deepEqual(
    model.destinations.rows.map((row) => row.destinationId),
    ["destination-2"],
  );
});

test("never infers destination identity from a label", () => {
  const destinations = fixtureDestinations(2);
  const model = buildHomeModelV1({
    dashboard: {
      destinationSummary: {
        status: "READY",
        items: [
          {
            destinationId: "destination-1",
            businesses: { count: 3, status: "READY" },
          },
          {
            destinationId: "forbidden",
            businesses: { count: 999, status: "READY" },
          },
          { name: "Destino 2", businesses: { count: 777, status: "READY" } },
        ],
      },
    },
    destinations,
    destinationAvailable: true,
    auditAvailable: true,
    scope: { scope: "global", destinationId: null },
  });
  const row1 = model.destinations.rows.find(
    (row) => row.destinationId === "destination-1",
  );
  const row2 = model.destinations.rows.find(
    (row) => row.destinationId === "destination-2",
  );
  assert.equal(row1.businesses.value, 3);
  assert.equal(row2.businesses.value, null);
  assert.equal(
    model.destinations.rows.some((row) => row.destinationId === "forbidden"),
    false,
  );
});

test("filters attention and audit by exact readable destination id", () => {
  const destinations = fixtureDestinations(2);
  const model = buildHomeModelV1({
    dashboard: {
      attention: {
        status: "READY",
        count: 2,
        items: [
          { id: "a", kind: "support-open", destinationId: "destination-1" },
          { id: "b", kind: "support-open", destinationId: "destination-2" },
          { id: "x", kind: "support-open", destinationId: "forbidden" },
        ],
      },
    },
    destinations,
    destinationAvailable: true,
    auditAvailable: true,
    auditEntries: [
      {
        entityType: "reservation",
        entityId: "r1",
        destinationId: "destination-1",
      },
      {
        entityType: "reservation",
        entityId: "r2",
        destinationId: "destination-2",
      },
      { entityType: "reservation", entityId: "rx", destinationId: "forbidden" },
    ],
    scope: { scope: "destination", destinationId: "destination-2" },
  });
  assert.deepEqual(
    model.attention.items.map((item) => item.id),
    ["b"],
  );
  assert.deepEqual(
    model.recent.items.map((item) => item.entity),
    ["r2"],
  );
});
