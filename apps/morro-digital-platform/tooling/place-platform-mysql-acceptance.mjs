import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { normalizeAuthSessionIdentity } from "@touristic/auth";

import { createPlacePlatformRuntime } from "./place-platform-runtime.mjs";

if (!process.env.BUSINESS_DATABASE_URL) {
  throw new Error("BUSINESS_DATABASE_URL_REQUIRED_FOR_ACCEPTANCE");
}

const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const businessId = `cms-acceptance-${suffix}`;
const placeId = `place-${businessId}`;
const admin = normalizeAuthSessionIdentity({
  subject: "cms-acceptance-admin",
  email: "admin@example.invalid",
  role: "PLATFORM_ADMIN",
  businessIds: [],
  issuedAt: 1_700_000_000,
  expiresAt: 4_000_000_000,
  sessionId: `cms-admin-${suffix}`,
});
const foreignOwner = normalizeAuthSessionIdentity({
  subject: "cms-acceptance-foreign",
  email: "foreign@example.invalid",
  role: "BUSINESS_OWNER",
  businessIds: ["unrelated-business"],
  issuedAt: 1_700_000_000,
  expiresAt: 4_000_000_000,
  sessionId: `cms-foreign-${suffix}`,
});
assert.ok(admin && foreignOwner);

const runtime = createPlacePlatformRuntime({
  authApi: {
    async listAdminUsers() {
      return [];
    },
  },
});

async function publicDetail() {
  const url = new URL(`http://localhost/api/places/v1/${placeId}`);
  const response = {
    statusCode: 0,
    headers: {},
    setHeader(key, value) {
      this.headers[key.toLowerCase()] = value;
    },
    end(body = "") {
      this.body = body;
    },
  };
  assert.equal(
    await runtime.handlePublic({ method: "GET", headers: {} }, response, url),
    true,
  );
  return { status: response.statusCode, body: JSON.parse(response.body) };
}

try {
  assert.equal(
    await runtime.start(),
    true,
    JSON.stringify(runtime.readinessCheck()),
  );
  const created = await runtime.createDraft(admin, {
    businessId,
    placeId,
    name: "Empresa original",
    categoryId: "attractions",
    destinationId: "morro-de-sao-paulo",
    shortDescription: "Experiência no Morro",
  });
  assert.deepEqual(created, { businessId, placeId });
  assert.equal((await publicDetail()).status, 404, "draft must remain private");

  await assert.rejects(
    runtime.createDraft(admin, {
      businessId,
      placeId: `${placeId}-other`,
      name: "Nome indevido",
      categoryId: "attractions",
    }),
    /duplicate|ER_DUP_ENTRY/iu,
  );
  assert.equal(
    (await runtime.getCmsDetail(businessId)).name,
    "Empresa original",
  );

  await assert.rejects(
    runtime.updateLocation(admin, businessId, { latitude: "", longitude: "" }),
    /INVALID_PLACE_LOCATION/u,
  );
  await runtime.updateProfile(admin, businessId, {
    name: "Nome publicado",
    description: "Experiência no Morro de São Paulo",
    shortDescription: "Experiência local",
  });
  await runtime.updateLocation(admin, businessId, {
    latitude: -13.3833,
    longitude: -38.9167,
    address: "Morro de São Paulo",
  });
  await assert.rejects(
    runtime.transitionPublication(admin, businessId, "publish", 2),
    /STALE_REVISION/u,
  );
  await runtime.transitionPublication(admin, businessId, "review", 3);
  await runtime.transitionPublication(admin, businessId, "publish", 3);
  const approved = await publicDetail();
  assert.equal(approved.status, 200);
  assert.equal(approved.body.profile.name, "Nome publicado");
  assert.equal(approved.body.revision.number, 3);

  await assert.rejects(
    runtime.updateProfile(foreignOwner, businessId, { name: "Ataque" }),
    /DENIED|ACCESS/u,
  );
  await runtime.updateProfile(admin, businessId, { name: "Novo draft" });
  const afterEdit = await publicDetail();
  assert.equal(afterEdit.status, 200);
  assert.equal(afterEdit.body.profile.name, "Nome publicado");
  assert.equal(afterEdit.body.revision.number, 3);
  assert.equal(
    (await runtime.getCmsDetail(businessId)).profile.name,
    "Novo draft",
  );
  process.stdout.write("Business CMS MySQL acceptance: PASS\n");
} finally {
  await runtime.stop();
}
