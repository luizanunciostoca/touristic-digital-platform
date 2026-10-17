// Real disposable SQL + socket HTTP proof. No browser interception or live providers.
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer, request } from "node:http";
import { execFileSync } from "node:child_process";
const proofArgs = process.argv.slice(2);
if (
  proofArgs.length &&
  (proofArgs.length !== 1 || proofArgs[0] !== "--mode=runtime-http")
) {
  throw new Error(
    proofArgs[0] === "--mode=dev-server"
      ? "ITACARE_DEV_SERVER_PROOF_NOT_PROVEN"
      : "ITACARE_PROOF_MODE_INVALID",
  );
}
const databaseUrl = process.env.ITACARE_DISPOSABLE_MYSQL_URL;
let database;
try {
  database = new URL(databaseUrl);
} catch {
  throw new Error("DISPOSABLE_DATABASE_URL_INVALID");
}
if (
  database.protocol !== "mysql:" ||
  database.hostname !== "127.0.0.1" ||
  database.pathname !== "/itacare_disposable" ||
  database.search ||
  database.hash
)
  throw new Error("DISPOSABLE_DATABASE_SCOPE_REQUIRED");
// Validate before loading a driver, harness, or owner runtime.
process.env.BUSINESS_DATABASE_URL = databaseUrl;
process.env.CONTENT_DATABASE_URL = databaseUrl;
const { createMySqlPool, applyContentM156Schema } =
  await import("@touristic/content-server");
const { normalizeAuthSessionIdentity } = await import("@touristic/auth");
const { createPlacePlatformRuntime } =
  await import("./place-platform-runtime.mjs");
const { resolveTrustedPlaceDestinationScope, publicDestinationApiHostGate } =
  await import("./destination-api-host-gate.mjs");
// Reuse existing exact-revision/media snapshot/restart proof, with DSN mandatory above.
await import("./place-platform-runtime.mysql.mjs");

test("real scoped SQL and HTTP excludes foreign/private Place revisions", async () => {
  const prefix = `scope-${randomUUID().slice(0, 8)}`;
  const actor = normalizeAuthSessionIdentity({
    subject: prefix,
    email: "proof@example.invalid",
    role: "PLATFORM_ADMIN",
    businessIds: [],
    issuedAt: 1700000000,
    expiresAt: 4000000000,
    sessionId: prefix,
  });
  assert.ok(actor);
  const pool = createMySqlPool(databaseUrl);
  const runtime = createPlacePlatformRuntime({
    getEnvironmentValue: (key) =>
      ["BUSINESS_DATABASE_URL", "CONTENT_DATABASE_URL"].includes(key)
        ? databaseUrl
        : "",
    platformOperations: { emit() {} },
  });
  const allowedHosts = {
    "itacare.test.invalid": ["itacare"],
    "morro.test.invalid": ["morro-de-sao-paulo"],
    "shared.test.invalid": ["morro-de-sao-paulo", "itacare"],
  };
  const server = createServer(async (req, res) => {
    const deny = () => {
      res.statusCode = 404;
      res.setHeader("cache-control", "no-store");
      res.end(JSON.stringify({ error: "PLACE_NOT_FOUND" }));
    };
    try {
      const url = new URL(req.url, "http://127.0.0.1");
      const resolved = resolveTrustedPlaceDestinationScope({
        host: req.headers.host,
        pathname: url.pathname,
        allowedHosts,
      });
      if (resolved.status !== 200) return deny();
      url.pathname = resolved.pathname;
      if (
        publicDestinationApiHostGate({
          host: req.headers.host,
          pathname: url.pathname,
          query: url.searchParams,
          allowedHosts,
          trustedDestinationScope: resolved.scope,
        })
      )
        return deny();
      if (!(await runtime.handlePublic(req, res, url, resolved.scope))) deny();
    } catch {
      res.statusCode = 500;
      res.end("PROOF_HANDLER_FAILED");
    }
  });
  const probe = (path, host = "itacare.test.invalid", headers = {}) =>
    new Promise((resolve, reject) => {
      const req = request(
        {
          host: "127.0.0.1",
          port: server.address().port,
          path,
          headers: { Host: host, ...headers },
          timeout: 5000,
        },
        (res) => {
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () =>
            resolve({
              status: res.statusCode,
              body: Buffer.concat(chunks).length
                ? JSON.parse(Buffer.concat(chunks).toString())
                : null,
              headers: res.headers,
            }),
          );
        },
      );
      req.on("timeout", () => req.destroy(new Error("PROOF_HTTP_TIMEOUT")));
      req.on("error", reject);
      req.end();
    });
  const detail = (id, host, headers) =>
    probe(`/api/places/v1/${id}`, host, headers);
  const map = (destination = "itacare", host, extra = "") =>
    probe(
      `/api/places/v1/map?destinationId=${destination}&bbox=-40,-15,-38,-13&zoom=14${extra}`,
      host,
    );
  const records = {};
  async function seed(label, destinationId = "itacare", state = "published") {
    const businessId = `${prefix}-${label}`,
      placeId = `place-${businessId}`;
    await runtime.createDraft(actor, {
      businessId,
      placeId,
      destinationId,
      categoryId: "attractions",
      name: `PUBLIC ${label}`,
      shortDescription: "Controlled SQL fixture",
    });
    await runtime.updateProfile(actor, businessId, {
      description: "Public owner-persisted description",
    });
    const located = await runtime.updateLocation(actor, businessId, {
      latitude: destinationId === "itacare" ? -14.278 : -13.3833,
      longitude: destinationId === "itacare" ? -39 : -38.9167,
      address: "Disposable fixture",
      source: "manual",
    });
    if (state !== "draft")
      await runtime.transitionPublication(
        actor,
        businessId,
        "review",
        located.editableRevision.revision,
      );
    if (!["draft", "review"].includes(state))
      await runtime.transitionPublication(
        actor,
        businessId,
        "publish",
        located.editableRevision.revision,
      );
    if (state === "suspended")
      await runtime.transitionPublication(
        actor,
        businessId,
        "suspend",
        located.editableRevision.revision,
      );
    // Archive is a stored-state exclusion proof; the runtime exposes no archive command.
    if (state === "archived")
      await pool.execute(
        "UPDATE business_places SET publication_state = 'archived' WHERE place_id = ? AND destination_id = ?",
        [placeId, destinationId],
      );
    records[label] = {
      businessId,
      placeId,
      revision: located.editableRevision.revision,
    };
    return records[label];
  }
  try {
    await applyContentM156Schema(pool);
    assert.equal(
      await runtime.start(),
      true,
      JSON.stringify(runtime.readinessCheck()),
    );
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    for (const state of [
      "published",
      "draft",
      "review",
      "suspended",
      "archived",
    ])
      await seed(state, "itacare", state);
    await seed("foreign", "morro-de-sao-paulo");
    const own = await detail(records.published.placeId);
    assert.equal(own.status, 200);
    assert.equal(own.body.profile.destinationId, "itacare");
    assert.equal(own.body.revision.number, records.published.revision);
    const foreignPublic = await detail(
      records.foreign.placeId,
      "morro.test.invalid",
    );
    assert.equal(foreignPublic.status, 200);
    assert.ok(foreignPublic.headers.etag);
    const foreign = await detail(records.foreign.placeId, undefined, {
      "If-None-Match": foreignPublic.headers.etag,
    });
    const missing = await detail(`${prefix}-missing`);
    assert.equal(foreign.status, 404);
    assert.deepEqual(foreign.body, missing.body);
    assert.equal(foreign.headers.etag, undefined);
    assert.equal(foreign.headers["cache-control"], "no-store");
    assert.equal(
      foreign.headers["cache-control"],
      missing.headers["cache-control"],
    );
    assert.equal(missing.headers.etag, undefined);
    assert.equal(
      (await detail(records.foreign.placeId, "morro.test.invalid")).status,
      200,
    );
    assert.equal(
      (await detail(records.published.placeId, "morro.test.invalid")).status,
      404,
    );
    for (const state of ["draft", "review", "suspended", "archived"])
      assert.equal((await detail(records[state].placeId)).status, 404, state);
    const page = await map();
    assert.equal(page.status, 200);
    const ids = page.body.items.map((x) => x.id);
    assert.ok(ids.includes(records.published.placeId));
    for (const state of ["draft", "review", "suspended", "archived", "foreign"])
      assert.ok(!ids.includes(records[state].placeId), state);
    assert.equal((await map("morro-de-sao-paulo")).status, 404);
    const cursorPage = await map(
      "itacare",
      undefined,
      `&cursor=${records.foreign.placeId}`,
    );
    assert.equal(cursorPage.status, 200);
    assert.ok(
      !cursorPage.body.items.some((x) => x.id === records.foreign.placeId),
    );
    const mapPath =
      "/api/places/v1/map?destinationId=itacare&bbox=-40,-15,-38,-13&zoom=14";
    assert.equal(
      (await probe(mapPath, undefined, { "If-None-Match": page.headers.etag }))
        .status,
      304,
    );
    const spoofed = await probe(
      "/d/itacare/api/places/v1/map?destinationId=morro-de-sao-paulo&bbox=-40,-15,-38,-13",
      "shared.test.invalid",
      { "If-None-Match": page.headers.etag },
    );
    assert.equal(spoofed.status, 404);
    assert.equal(spoofed.headers.etag, undefined);

    assert.equal(
      (
        await probe(
          `/d/itacare/api/places/v1/${records.published.placeId}`,
          "shared.test.invalid",
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await probe(
          `/d/morro-de-sao-paulo/api/places/v1/${records.foreign.placeId}`,
        )
      ).status,
      404,
    );
    assert.equal(
      (await detail(records.published.placeId, "unknown.test.invalid")).status,
      404,
    );
    const edited = await runtime.updateProfile(
      actor,
      records.published.businessId,
      { name: "PRIVATE EDIT DO NOT EXPOSE" },
    );
    assert.equal(
      (await detail(records.published.placeId)).body.profile.name,
      "PUBLIC published",
    );
    assert.equal(
      (await map()).body.items.find((x) => x.id === records.published.placeId)
        .name,
      "PUBLIC published",
    );
    await runtime.transitionPublication(
      actor,
      records.published.businessId,
      "review",
      edited.editableRevision.revision,
    );
    assert.equal(
      (await detail(records.published.placeId)).body.revision.number,
      records.published.revision,
    );
    await runtime.transitionPublication(
      actor,
      records.published.businessId,
      "publish",
      edited.editableRevision.revision,
    );
    assert.equal(
      (await detail(records.published.placeId)).body.profile.name,
      "PRIVATE EDIT DO NOT EXPOSE",
    );
    const conditional = await detail(records.published.placeId);
    const notModified = await new Promise((resolve, reject) => {
      const req = request(
        {
          host: "127.0.0.1",
          port: server.address().port,
          path: `/api/places/v1/${records.published.placeId}`,
          headers: {
            Host: "itacare.test.invalid",
            "If-None-Match": conditional.headers.etag,
          },
        },
        (res) => {
          res.resume();
          res.on("end", () => resolve(res.statusCode));
        },
      );
      req.on("error", reject);
      req.end();
    });
    assert.equal(notModified, 304);
    for (const path of [
      "/media/private.jpg",
      "/api/crm/leads",
      "/private.html",
      "/contracts/view/private",
    ])
      assert.equal((await probe(path)).status, 404);
    const [rows] = await pool.execute(
      "SELECT place_id,destination_id,publication_state,published_revision FROM business_places WHERE place_id = ?",
      [records.published.placeId],
    );
    assert.equal(rows[0].destination_id, "itacare");
    assert.equal(rows[0].published_revision, edited.editableRevision.revision);
    const [versions] = await pool.query("SELECT VERSION() AS version");
    const sourceHashes = Object.fromEntries(
      [
        "./place-platform-runtime.mjs",
        "./destination-api-host-gate.mjs",
        "./itacare-place-destination-http.mysql.mjs",
      ].map((path) => [
        path,
        createHash("sha256")
          .update(readFileSync(new URL(path, import.meta.url)))
          .digest("hex"),
      ]),
    );
    console.log(
      JSON.stringify({
        sourceHashes,
        mysqlVersion: versions[0].version,
        worktreeClean:
          execFileSync("git", ["status", "--porcelain"], {
            encoding: "utf8",
          }).trim() === "",
        status: "SCOPED_PLACE_SQL_SOCKET_HTTP_PROVEN",
        productHead: execFileSync("git", ["rev-parse", "HEAD"], {
          encoding: "utf8",
        }).trim(),
        database: "loopback itacare_disposable",
        publishedOnly: true,
        foreignAndMissingIdentical404: true,
        privateEditSnapshotFrozen: true,
        privateFieldsChanged: ["name"],
        archiveStateFixture: true,
        archiveOwnerCommandProven: false,
        suspendedArchivedHidden: true,
        hostPrefixScoped: true,
        scopeBeforePorts: "UNIT_PROOF_SEPARATE",
        runtime: "real node:http + canonical Place runtime + MySQL",
        devServerActivation: false,
        browserInterception: false,
        fixtures: "OWNER_WRITTEN_DISPOSABLE_SQL_ROWS",
      }),
    );
  } finally {
    if (server.listening) await new Promise((resolve) => server.close(resolve));
    await runtime.stop();
    await pool.end();
  }
});
