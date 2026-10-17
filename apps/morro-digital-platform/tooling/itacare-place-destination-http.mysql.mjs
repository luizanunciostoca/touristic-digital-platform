// Real disposable SQL + socket HTTP proof. No browser interception or live providers.
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID, createHash } from "node:crypto";
import {
  readFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  symlinkSync,
  realpathSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, request } from "node:http";
import { execFileSync, spawn } from "node:child_process";
const proofArgs = process.argv.slice(2);
const mode =
  proofArgs[0] === "--mode=dev-server" ? "dev-server" : "runtime-http";
if (
  proofArgs.length > 1 ||
  (proofArgs.length &&
    !["--mode=dev-server", "--mode=runtime-http"].includes(proofArgs[0]))
)
  throw new Error("ITACARE_PROOF_MODE_INVALID");
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

const productRoot = fileURLToPath(new URL("../../../", import.meta.url));
const entry = join(
  productRoot,
  "apps/morro-digital-platform/tooling/dev-server.mjs",
);
const template = {
  id: "itacare",
  name: "Itacaré",
  countryCode: "BR",
  timezone: "America/Bahia",
  currency: "BRL",
  center: { latitude: -14.278, longitude: -39 },
  radiusMeters: 35000,
  modules: { map: true, payments: false, booking: false, assistant: false },
};
function childEnvironment(hosts) {
  return {
    PATH: process.env.PATH,
    NODE_ENV: "test",
    HOST: "127.0.0.1",
    PORT: "0",
    MORRO_DISPOSABLE_PROOF: "1",
    BUSINESS_DATABASE_URL: databaseUrl,
    CONTENT_DATABASE_URL: databaseUrl,
    DESTINATIONS_DATABASE_URL: databaseUrl,
    PUBLIC_DESTINATION_HOSTS_JSON: JSON.stringify(hosts),
    PUBLIC_DESTINATION_TEMPLATES_JSON: JSON.stringify({
      itacare: template,
      other: { ...template, id: "other", name: "Other" },
    }),
  };
}
const childStates = new WeakMap();
function spawnOwned(args, options, command = process.execPath) {
  const child = spawn(command, args, options);
  const state = { closed: false, error: null };
  childStates.set(child, state);
  child.on("error", (error) => {
    state.error = error;
  });
  state.close = new Promise((resolve) =>
    child.once("close", (code, signal) => {
      state.closed = true;
      state.code = code;
      state.signal = signal;
      resolve(state);
    }),
  );
  return child;
}
async function waitForClose(child, milliseconds) {
  const state = childStates.get(child);
  if (state.closed) return state;
  let timer;
  try {
    return await Promise.race([
      state.close,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(Error("OWNED_CHILD_CLOSE_TIMEOUT")),
          milliseconds,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
async function stopChild(child, graceMs = 10000, killMs = 5000) {
  if (!child) return { started: false };
  const state = childStates.get(child);
  let forced = false;
  if (!state.closed) {
    if (child.exitCode === null && child.signalCode === null)
      child.kill("SIGTERM");
    try {
      await waitForClose(child, graceMs);
    } catch (error) {
      if (error.message !== "OWNED_CHILD_CLOSE_TIMEOUT") throw error;
      forced = true;
      child.kill("SIGKILL");
      await waitForClose(child, killMs);
    }
  }
  assert.equal(state.closed, true);
  return {
    started: true,
    exitCode: state.code,
    signal: state.signal,
    forced,
    gracefulLimitMs: graceMs,
    killLimitMs: killMs,
    closeObserved: true,
    errorCode: state.error?.code ?? null,
  };
}
async function waitForStartup(child) {
  const state = childStates.get(child);
  if (state.error) throw state.error;
  if (state.closed)
    throw Error("DEV_SERVER_EARLY_EXIT:" + state.code + ":" + state.signal);
  let timer,
    output = "",
    data,
    onError,
    onClose;
  try {
    return await new Promise((resolve, reject) => {
      timer = setTimeout(
        () => reject(Error("DEV_SERVER_START_TIMEOUT:" + output)),
        15000,
      );
      data = (x) => {
        output = (output + x).slice(-6000);
        const match =
          /Morro Digital disponível em http:\/\/127\.0\.0\.1:(\d+)/u.exec(
            output,
          );
        if (match) resolve(Number(match[1]));
      };
      onError = reject;
      onClose = (code, signal) =>
        reject(
          Error("DEV_SERVER_EARLY_EXIT:" + code + ":" + signal + ":" + output),
        );
      child.stdout.on("data", data);
      child.stderr.on("data", data);
      child.once("error", onError);
      child.once("close", onClose);
    });
  } finally {
    clearTimeout(timer);
    child.stdout.off("data", data);
    child.stderr.off("data", data);
    child.off("error", onError);
    child.off("close", onClose);
    child.stdout.resume();
    child.stderr.resume();
  }
}
async function guardNegatives() {
  const fixture = mkdtempSync(join(tmpdir(), "itacare-guard-"));
  const parent = join(fixture, "apps/morro-digital-platform");
  mkdirSync(parent, { recursive: true });
  symlinkSync(
    join(productRoot, "apps/morro-digital-platform/tooling"),
    join(parent, "tooling"),
    "dir",
  );
  const fixtureEntry = join(parent, "tooling/dev-server.mjs");
  assert.equal(realpathSync(fixtureEntry), realpathSync(entry));
  const fixtureEnv = join(fixture, ".env");
  const receipts = [];
  try {
    for (const race of [false, true]) {
      if (existsSync(fixtureEnv)) rmSync(fixtureEnv);
      const args = ["--preserve-symlinks-main"];
      if (race) {
        const preload = join(fixture, "before-loader.mjs");
        writeFileSync(
          preload,
          `import {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(fixtureEnv)},'SYNTHETIC_FIXTURE=true');`,
        );
        args.push("--import", preload);
      } else writeFileSync(fixtureEnv, "SYNTHETIC_FIXTURE=true");
      args.push(fixtureEntry);
      const c = spawnOwned(args, {
        cwd: fixture,
        env: childEnvironment({ "itacare.test.invalid": ["itacare"] }),
        stdio: ["ignore", "pipe", "pipe"],
      });
      let out = "";
      c.stdout.on("data", (x) => (out = (out + x).slice(-6000)));
      c.stderr.on("data", (x) => (out = (out + x).slice(-6000)));
      let result;
      try {
        result = await waitForClose(c, 10000);
      } finally {
        await stopChild(c);
      }
      assert.notEqual(result.code, 0);
      assert.equal(childStates.get(c).closed, true);
      assert.equal(existsSync(fixtureEnv), true);
      assert.match(out, /Error: DISPOSABLE_PROOF_DOTENV_DENIED/);
      assert.doesNotMatch(out, /MODULE_NOT_FOUND/);
      receipts.push({
        kind: race ? "appeared-before-loader" : "existing-dotenv",
        entry: fixtureEntry,
        realpath: realpathSync(fixtureEntry),
        cwd: fixture,
        envPath: fixtureEnv,
        flags: args.slice(0, -1),
        error: "DISPOSABLE_PROOF_DOTENV_DENIED",
        httpProof: false,
      });
    }
    return receipts;
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}
if (mode === "dev-server")
  test("real loader dotenv guards in explicit OPS fixture", async () => {
    assert.equal(existsSync(join(productRoot, ".env")), false);
    console.log(
      JSON.stringify({
        status: "GUARD_FIXTURE_PROVEN",
        sourceHash: createHash("sha256")
          .update(readFileSync(entry))
          .digest("hex"),
        cases: await guardNegatives(),
        raceCoverage: "appearance before loader; no fencing claim after check",
        productDotenvTouched: false,
      }),
    );
  });

if (mode === "dev-server")
  test("owned child cleanup observes signaled exit, spawn error and timeout before fixture removal", async () => {
    const options = {
      stdio: ["ignore", "pipe", "pipe"],
      env: { PATH: process.env.PATH },
    };
    const signaled = spawnOwned(["-e", "setInterval(()=>{},1000)"], options);
    await new Promise((resolve, reject) => {
      signaled.once("spawn", resolve);
      signaled.once("error", reject);
    });
    signaled.kill("SIGTERM");
    await waitForClose(signaled, 3000);
    const signaledReceipt = await stopChild(signaled);
    assert.equal(signaledReceipt.signal, "SIGTERM");
    assert.equal(signaledReceipt.forced, false);
    const failed = spawnOwned([], options, "/itacare-proof-no-such-executable");
    await assert.rejects(waitForStartup(failed), /ENOENT/);
    await waitForClose(failed, 3000);
    const failedReceipt = await stopChild(failed);
    assert.equal(failedReceipt.errorCode, "ENOENT");
    await assert.rejects(
      waitForStartup(failed),
      /DEV_SERVER_START_TIMEOUT|DEV_SERVER_EARLY_EXIT|ENOENT/,
    );
    const fixture = mkdtempSync(join(tmpdir(), "itacare-cleanup-"));
    const hanging = spawnOwned(
      [
        "-e",
        "process.on('SIGTERM',()=>{});process.stdout.write('ready');setInterval(()=>{},1000)",
      ],
      options,
    );
    let timeoutReceipt;
    try {
      await new Promise((resolve, reject) => {
        hanging.stdout.once("data", resolve);
        hanging.once("error", reject);
      });
      await assert.rejects(
        waitForClose(hanging, 20),
        /OWNED_CHILD_CLOSE_TIMEOUT/,
      );
      assert.equal(existsSync(fixture), true);
      timeoutReceipt = await stopChild(hanging, 20, 3000);
      assert.equal(timeoutReceipt.forced, true);
      assert.equal(timeoutReceipt.signal, "SIGKILL");
      assert.equal(childStates.get(hanging).closed, true);
    } finally {
      await stopChild(hanging, 20, 3000);
      rmSync(fixture, { recursive: true, force: true });
    }
    console.log(
      JSON.stringify({
        status: "OWNED_CHILD_CLEANUP_REGRESSIONS_PROVEN",
        signaled: signaledReceipt,
        spawnError: failedReceipt,
        timeout: timeoutReceipt,
        fixtureRemovedAfterClose: !existsSync(fixture),
      }),
    );
  });

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
    "itacare-morro.test.invalid": ["itacare", "morro-de-sao-paulo"],
    "itacare-other.test.invalid": ["itacare", "other"],
    "other.test.invalid": ["other"],
  };
  let child, actualPort;
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
  const probe = (
    path,
    host = "itacare.test.invalid",
    headers = {},
    method = "GET",
  ) =>
    new Promise((resolve, reject) => {
      const req = request(
        {
          host: "127.0.0.1",
          port: mode === "dev-server" ? actualPort : server.address().port,
          path,
          headers: { Host: host, ...headers },
          method,
          timeout: 5000,
        },
        (res) => {
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () =>
            resolve({
              status: res.statusCode,
              body: Buffer.concat(chunks).length
                ? (() => {
                    const raw = Buffer.concat(chunks).toString();
                    try {
                      return JSON.parse(raw);
                    } catch {
                      return raw;
                    }
                  })()
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
    if (mode === "runtime-http")
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
    if (mode === "dev-server") {
      assert.equal(existsSync(join(productRoot, ".env")), false);
      const destinations = await import("@touristic/destinations-server");
      const dp = destinations.createDestinationsMySqlPool(databaseUrl);
      try {
        await destinations.applyDestinationsSchema(dp);
        const service = destinations.createDestinationAdminService(dp);
        for (const id of ["itacare", "morro-de-sao-paulo"]) {
          const result = await service.create({
            id,
            status: "active",
            locale: "pt-BR",
            timezone: "America/Bahia",
            currency: "BRL",
            branding: {
              name: id,
              shortName: id,
              tagline: "Disposable API proof",
            },
            center: { lat: -14.278, lng: -39, zoom: 12 },
            modules: ["map"],
            featureFlags: {
              map: true,
              payments: false,
              booking: false,
              assistant: false,
            },
          });
          assert.ok(["created", "conflict"].includes(result.status));
          assert.equal((await service.read(id)).data.status, "active");
        }
      } finally {
        await dp.end();
      }
      const previousCanary = process.env.ITACARE_PROVIDER_CANARY;
      process.env.ITACARE_PROVIDER_CANARY = "SYNTHETIC_NON_SECRET";
      const env = childEnvironment(allowedHosts);
      assert.equal(Object.hasOwn(env, "ITACARE_PROVIDER_CANARY"), false);
      if (previousCanary === undefined)
        delete process.env.ITACARE_PROVIDER_CANARY;
      else process.env.ITACARE_PROVIDER_CANARY = previousCanary;
      assert.equal(
        Object.keys(env).some((key) =>
          /(?:MERCADO|PAYMENT|PROVIDER|SMTP|STRIPE|PRODUCTION)/u.test(key),
        ),
        false,
      );
      child = spawnOwned([entry], {
        cwd: productRoot,
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });
      actualPort = await waitForStartup(child);
      assert.ok(actualPort > 0);
      const legacyRoot = await probe("/", "morro.test.invalid");
      assert.equal(legacyRoot.status, 200);
      assert.match(legacyRoot.headers["content-type"], /text\/html/);
      assert.equal(
        (await probe("/runtime-config.js", "shared.test.invalid")).status,
        200,
      );
      assert.equal(
        (await probe("/", "itacare.test.invalid", {}, "HEAD")).status,
        404,
      );
      assert.equal(
        (await probe("/api/runtime/destination", "other.test.invalid")).status,
        503,
      );
      const identity = await probe("/api/runtime/destination");
      assert.equal(identity.status, 200);
      assert.equal(identity.body.destination.id, "itacare");
      for (const path of [
        "/",
        "/d/itacare/",
        "/index.html",
        "/runtime-config.js",
        "/apps/morro-digital-platform/public/index.html",
      ]) {
        const denied = await probe(path);
        assert.equal(denied.status, 404, path);
        assert.doesNotMatch(
          JSON.stringify(denied.body),
          /Morro de São Paulo|browser-entry/,
        );
      }
      assert.equal(
        (await probe("/d/itacare/", "shared.test.invalid")).status,
        404,
      );
      assert.equal(
        (await probe("/api/runtime/destination", "unknown.test.invalid"))
          .status,
        404,
      );
      assert.equal(
        (
          await probe("/api/runtime/destination", "unknown.test.invalid", {
            "X-Forwarded-Host": "itacare.test.invalid",
          })
        ).status,
        404,
      );
      for (const host of [
        "itacare-morro.test.invalid",
        "itacare-other.test.invalid",
      ]) {
        assert.equal(
          (await probe("/api/runtime/destination", host)).body.destination.id,
          "itacare",
        );
        for (const path of [
          "/",
          "/%69ndex.html",
          "/api/weather",
          "/media/morro.jpg",
        ])
          assert.equal((await probe(path, host)).status, 404, path);
      }
      assert.equal(
        (await probe("/api/runtime/destination", "shared.test.invalid")).body
          .destination.id,
        "morro-de-sao-paulo",
      );
    }
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
          port: mode === "dev-server" ? actualPort : server.address().port,
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
        "./dev-server.mjs",
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
        status:
          mode === "dev-server"
            ? "REAL_DEV_SERVER_API_PROVEN"
            : "SCOPED_PLACE_SQL_SOCKET_HTTP_PROVEN",
        mode,
        actualEntry: mode === "dev-server" ? entry : null,
        actualCwd: mode === "dev-server" ? productRoot : null,
        actualArgs: mode === "dev-server" ? [entry] : [],
        fixtureFlagsOnPositive: false,
        productTree: execFileSync("git", ["rev-parse", "HEAD^{tree}"], {
          cwd: productRoot,
          encoding: "utf8",
        }).trim(),
        actualPort: mode === "dev-server" ? actualPort : server.address().port,
        uiUnavailable: mode === "dev-server",
        providerEnvironmentInherited: false,
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
        runtime:
          mode === "dev-server"
            ? "canonical dev-server + scoped Place + MySQL"
            : "real node:http + canonical Place runtime + MySQL",
        devServerActivation: mode === "dev-server",
        browserInterception: false,
        fixtures: "OWNER_WRITTEN_DISPOSABLE_SQL_ROWS",
      }),
    );
  } finally {
    const cleanup = await stopChild(child);
    if (child)
      console.log(
        JSON.stringify({
          status: "OWNED_DEV_SERVER_CLEANUP",
          ...cleanup,
          productionShutdownUnchanged: true,
        }),
      );
    if (server.listening) await new Promise((resolve) => server.close(resolve));
    await runtime.stop();
    await pool.end();
  }
});
