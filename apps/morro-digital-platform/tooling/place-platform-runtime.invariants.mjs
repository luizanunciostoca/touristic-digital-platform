import assert from "node:assert/strict";
import test from "node:test";

import { createPlacePlatformRuntime } from "./place-platform-runtime.mjs";

function fixture({ row = null, duplicate = false, publishedRow = null } = {}) {
  const executed = [];
  const transaction = { committed: false, rolledBack: false, released: 0 };
  const execute = async (sql, params = []) => {
    executed.push({ sql, params });
    if (sql.includes("INSERT INTO business_entities") && duplicate) {
      throw new Error("ER_DUP_ENTRY");
    }
    if (sql.includes("FROM business_places WHERE business_id")) {
      return [row ? [row] : []];
    }
    if (sql.includes("WHERE place_id = ? AND published_revision IS NOT NULL")) {
      return [publishedRow ? [publishedRow] : []];
    }
    if (sql.includes("FROM business_entities b")) return [[]];
    if (sql.includes("FROM business_place_revision_history")) return [[]];
    return [{ affectedRows: 1 }];
  };
  const connection = {
    execute,
    async beginTransaction() {},
    async commit() {
      transaction.committed = true;
    },
    async rollback() {
      transaction.rolledBack = true;
    },
    release() {
      transaction.released += 1;
    },
  };
  const pool = {
    async query() {},
    execute,
    async getConnection() {
      return connection;
    },
    async end() {},
  };
  const runtime = createPlacePlatformRuntime({
    poolFactory: () => pool,
    getEnvironmentValue: (key) =>
      key === "BUSINESS_DATABASE_URL" ? "mysql://fixture" : "",
  });
  return { runtime, executed, transaction };
}

const actor = { subject: "platform-admin", role: "PLATFORM_ADMIN" };
const draft = {
  businessId: "business-a",
  name: "Empresa A",
  categoryId: "attractions",
  destinationId: "morro-de-sao-paulo",
};

test("rejects duplicate Business atomically without renaming its owner", async () => {
  const { runtime, executed, transaction } = fixture({ duplicate: true });
  assert.equal(await runtime.start(), true);
  await assert.rejects(runtime.createDraft(actor, draft), /ER_DUP_ENTRY/u);
  assert.equal(transaction.rolledBack, true);
  assert.equal(transaction.committed, false);
  assert.equal(transaction.released, 1);
  assert.equal(executed[0].sql.includes("ON DUPLICATE KEY UPDATE"), false);
  assert.equal(executed.length, 1);
  await runtime.stop();
});

test("rejects an empty location instead of coercing it to 0,0", async () => {
  const place = {
    id: "place-business-a",
    businessId: "business-a",
    destinationId: "morro-de-sao-paulo",
    categoryId: "attractions",
    name: "Empresa A",
    location: { latitude: null, longitude: null },
    capabilities: { enabled: ["directions"] },
  };
  const row = {
    place_id: place.id,
    business_id: place.businessId,
    destination_id: place.destinationId,
    publication_state: "draft",
    editable_place_json: JSON.stringify(place),
    editable_revision: 1,
    editable_revision_id: `${place.id}:r1`,
    editable_revision_json: JSON.stringify({
      placeId: place.id,
      businessId: place.businessId,
      destinationId: place.destinationId,
    }),
    updated_at: new Date(),
    updated_by: "platform-admin",
  };
  const { runtime, executed } = fixture({ row });
  assert.equal(await runtime.start(), true);
  await assert.rejects(
    runtime.updateLocation(actor, "business-a", {
      latitude: "",
      longitude: "",
    }),
    /INVALID_PLACE_LOCATION/u,
  );
  assert.equal(executed.length, 1);
  await runtime.stop();
});

test("refuses publication when operator reviewed an older revision", async () => {
  const row = {
    place_id: "place-business-a",
    business_id: "business-a",
    destination_id: "morro-de-sao-paulo",
    publication_state: "review",
    editable_revision: 3,
    editable_revision_id: "place-business-a:r3",
    editable_revision_json: JSON.stringify({
      placeId: "place-business-a",
      businessId: "business-a",
      destinationId: "morro-de-sao-paulo",
    }),
    updated_at: new Date(),
    updated_by: "platform-admin",
  };
  const { runtime, executed } = fixture({ row });
  assert.equal(await runtime.start(), true);
  await assert.rejects(
    runtime.transitionPublication(actor, "business-a", "publish", 2),
    /PLACE_PUBLICATION_STALE_REVISION/u,
  );
  assert.equal(executed.length, 1);
  await runtime.stop();
});

test("restricts location filters to meaningful canonical states", async () => {
  const { runtime, executed } = fixture();
  assert.equal(await runtime.start(), true);
  const result = await runtime.listCms(
    new URL(
      "http://localhost/api/admin/v1/businesses/cms?locationStatus=confirmed",
    ),
  );
  assert.equal(result.filters.locationStatus, "confirmed");
  assert.match(executed[0].sql, /JSON_EXTRACT\(p\.editable_place_json/u);
  await assert.rejects(
    runtime.listCms(
      new URL(
        "http://localhost/api/admin/v1/businesses/cms?locationStatus=bogus",
      ),
    ),
    /INVALID_LOCATION_STATUS/u,
  );
  assert.equal(executed.length, 1);
  await runtime.stop();
});

test("serves approved revision while a newer edit remains draft", async () => {
  const published = {
    id: "place-business-a",
    businessId: "business-a",
    destinationId: "morro-de-sao-paulo",
    name: "Nome aprovado",
    slug: "nome-aprovado",
    categoryId: "attractions",
    subcategoryIds: [],
    shortDescription: "Publicado",
    description: "Descrição pública",
    location: {
      latitude: -13.38,
      longitude: -38.91,
      address: "Morro de São Paulo",
      area: "Centro",
    },
    contact: {},
    openingHours: null,
    amenities: [],
    tags: [],
    capabilities: { enabled: ["directions"] },
    visibility: "public",
  };
  const publishedRow = {
    place_id: published.id,
    publication_state: "draft",
    published_revision: 2,
    published_revision_id: `${published.id}:r2`,
    published_place_json: JSON.stringify(published),
    published_revision_json: JSON.stringify({ name: published.name }),
    editable_place_json: JSON.stringify({ ...published, name: "Novo draft" }),
    updated_at: new Date(),
    updated_by: "platform-admin",
  };
  const { runtime, executed } = fixture({ publishedRow });
  assert.equal(await runtime.start(), true);
  const response = {
    statusCode: 0,
    body: "",
    setHeader() {},
    end(body = "") {
      this.body = String(body);
    },
  };
  const url = new URL(`http://localhost/api/places/v1/${published.id}`);
  assert.equal(
    await runtime.handlePublic({ method: "GET", headers: {} }, response, url),
    true,
  );
  assert.equal(response.statusCode, 200);
  const detail = JSON.parse(response.body);
  assert.equal(detail.profile.name, "Nome aprovado");
  assert.equal(detail.revision.number, 2);
  assert.equal(response.body.includes("Novo draft"), false);
  assert.match(executed[0].sql, /published_revision IS NOT NULL/u);
  assert.match(executed[0].sql, /publication_state NOT IN/u);
  await runtime.stop();
});
