// Explicit real SQL/socket modes and a separately labeled built-UI synthetic-browser mode.
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
if (
  proofArgs.length > 1 ||
  (proofArgs.length &&
    !["--mode=dev-server", "--mode=runtime-http", "--mode=browser"].includes(
      proofArgs[0],
    ))
) {
  throw new Error("ITACARE_PROOF_MODE_INVALID");
}
const mode =
  proofArgs[0] === "--mode=dev-server"
    ? "dev-server"
    : proofArgs[0] === "--mode=browser"
      ? "browser"
      : "runtime-http";
// Dispatch before DSN parsing, environment writes, runtime imports or SQL test registration.
if (mode === "browser") {
  await runSyntheticBrowserProof();
} else {
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
            Error(
              "DEV_SERVER_EARLY_EXIT:" + code + ":" + signal + ":" + output,
            ),
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
          raceCoverage:
            "appearance before loader; no fencing claim after check",
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
      const failed = spawnOwned(
        [],
        options,
        "/itacare-proof-no-such-executable",
      );
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
    let child, actualPort, destinationPool, destinationService;
    let ownerReadRevocation = null;
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
        if (!(await runtime.handlePublic(req, res, url, resolved.scope)))
          deny();
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
        await seed("owner-missing", "other");
        assert.equal(existsSync(join(productRoot, ".env")), false);
        const destinations = await import("@touristic/destinations-server");
        destinationPool = destinations.createDestinationsMySqlPool(databaseUrl);
        {
          await destinations.applyDestinationsSchema(destinationPool);
          destinationService =
            destinations.createDestinationAdminService(destinationPool);
          for (const id of ["itacare", "morro-de-sao-paulo"]) {
            const result = await destinationService.create({
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
            const persisted = await destinationService.read(id);
            assert.equal(persisted.status, "found");
            assert.equal(persisted.data.status, "active");
            assert.equal(
              (await destinationService.create(persisted.data)).status,
              "conflict",
            );
          }
          assert.equal(
            (await destinationService.read("../bad")).status,
            "invalid",
          );
          const validOwner = (await destinationService.read("itacare")).data;
          assert.equal(
            (await destinationService.create({ ...validOwner, id: "../bad" }))
              .status,
            "invalid",
          );
          assert.equal(
            (await destinationService.read("other")).status,
            "not_found",
          );
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
          200,
        );
        assert.equal(
          (await probe("/api/runtime/destination", "other.test.invalid"))
            .status,
          503,
        );
        const identity = await probe("/api/runtime/destination");
        assert.equal(identity.status, 200);
        assert.equal(identity.body.destination.id, "itacare");
        assert.equal(identity.body.source, "destination-owner");
        for (const [host, path] of [
          ["itacare.test.invalid", "/"],
          ["itacare.test.invalid", "/d/itacare/"],
          ["shared.test.invalid", "/d/itacare/"],
          ["itacare-morro.test.invalid", "/"],
          ["itacare-other.test.invalid", "/"],
        ]) {
          const page = await probe(path, host);
          assert.equal(page.status, 200, `${host}${path}`);
          assert.match(page.headers["content-type"], /text\/html/);
          assert.equal(page.headers["cache-control"], "private, no-store");
          assert.match(
            page.body,
            /destinations\/destination-browser-entry\.js/,
          );
          assert.match(page.body, /\/d\/itacare\/runtime-config\.js/);
          assert.doesNotMatch(
            page.body,
            /__DESTINATION_SCOPED_RUNTIME_CONFIG__|Morro de São Paulo|dist\/browser-entry\.js/,
          );
        }
        for (const [host, path] of [
          ["itacare.test.invalid", "/runtime-config.js"],
          ["itacare.test.invalid", "/d/itacare/runtime-config.js"],
          ["shared.test.invalid", "/d/itacare/runtime-config.js"],
        ]) {
          const config = await probe(path, host);
          assert.equal(config.status, 200, `${host}${path}`);
          assert.equal(config.headers["cache-control"], "private, no-store");
          assert.match(config.body, /destination-map/);
          assert.doesNotMatch(config.body, /MERCADO|PAYMENT|STRIPE|SMTP/);
        }
        for (const path of [
          "/api/weather",
          "/media/morro-test-file.jpg",
          "/index.html",
          "/apps/admin-crm/public/index.html",
          "/apps/morro-digital-platform/public/index.html",
          "/apps/morro-digital-platform/public/destination.html",
        ]) {
          const denied = await probe(path);
          assert.equal(denied.status, 404, path);
          assert.doesNotMatch(
            JSON.stringify(denied.body),
            /Morro de São Paulo|browser-entry/,
          );
        }
        assert.equal((await probe("/d/morro-de-sao-paulo/")).status, 404);
        assert.equal(
          (await probe("/d/itacare/", "morro.test.invalid")).status,
          404,
        );
        assert.equal((await probe("/", "unknown.test.invalid")).status, 404);
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
      for (const state of [
        "draft",
        "review",
        "suspended",
        "archived",
        "foreign",
      ])
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
        (
          await probe(mapPath, undefined, {
            "If-None-Match": page.headers.etag,
          })
        ).status,
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
        (await detail(records.published.placeId, "unknown.test.invalid"))
          .status,
        404,
      );
      const outside = await probe(
        "/api/places/v1/map?destinationId=itacare&bbox=-38,-12,-37,-11&zoom=14",
      );
      assert.equal(outside.status, 200);
      assert.ok(
        !outside.body.items.some((x) => x.id === records.published.placeId),
      );
      const invalidBbox = await probe(
        "/api/places/v1/map?destinationId=itacare&bbox=invalid&zoom=14",
      );
      assert.equal(invalidBbox.status, 400);
      assert.equal(invalidBbox.headers["cache-control"], "no-store");
      assert.equal(invalidBbox.headers.etag, undefined);

      if (mode === "dev-server") {
        const ownPath = `/api/places/v1/${records.published.placeId}`;
        const routes = [
          ["itacare.test.invalid", ownPath],
          ["itacare.test.invalid", mapPath],
          ["shared.test.invalid", `/d/itacare${ownPath}`],
          ["shared.test.invalid", `/d/itacare${mapPath}`],
          [
            "shared.test.invalid",
            `/d/itacare/api/places/v1/%70${records.published.placeId.slice(1)}`,
          ],
          [
            "shared.test.invalid",
            "/d/itacare/api/places/v1/map?destinationId=morro-de-sao-paulo&destinationId=itacare&bbox=-40,-15,-38,-13&zoom=14",
          ],
        ];
        const ownerFailure = (result, label) => {
          assert.equal(result.status, 503, label);
          assert.deepEqual(result.body, {
            error: "DESTINATION_OWNER_UNAVAILABLE",
          });
          assert.equal(result.headers["cache-control"], "no-store", label);
          assert.equal(result.headers.etag, undefined, label);
        };
        const boundaryRoutes = [
          ["unknown.test.invalid", ownPath],
          ["itacare.test.invalid", `/d/morro-de-sao-paulo${ownPath}`],
          [
            "shared.test.invalid",
            "/d/itacare/api/places/v1/map?destinationId=morro-de-sao-paulo&bbox=-40,-15,-38,-13",
          ],
          [
            "shared.test.invalid",
            "/d/itacare/api/places/v1/map?destinationId=itacare&destinationId=morro-de-sao-paulo&bbox=-40,-15,-38,-13",
          ],
          ["shared.test.invalid", mapPath],
          [
            "itacare-other.test.invalid",
            "/d/other/api/places/v1/map?destinationId=itacare&bbox=-40,-15,-38,-13",
          ],
          ["shared.test.invalid", `/d/itacare${ownPath}/nested`],
          [
            "shared.test.invalid",
            "/d/itacare/api/places/v1/%3Cinvalid%3E",
            400,
          ],
          ["shared.test.invalid", `/d/itacare${ownPath}`, 404, "HEAD"],
          ["shared.test.invalid", `/d/itacare${ownPath}`, 404, "POST"],
        ];
        const boundarySnapshot = async () =>
          Promise.all(
            boundaryRoutes.map(
              async ([host, path, status = 404, method = "GET"]) => {
                const result = await probe(
                  path,
                  host,
                  {
                    "If-None-Match": page.headers.etag,
                    "X-Forwarded-Host": "itacare.test.invalid",
                  },
                  method,
                );
                assert.equal(result.status, status, `${method} ${host}${path}`);
                assert.equal(result.headers["cache-control"], "no-store");
                assert.equal(result.headers.etag, undefined);
                return { status: result.status, body: result.body };
              },
            ),
          );
        const activeBoundaries = await boundarySnapshot();
        const activeRoutes = [];
        for (const [host, path] of routes) {
          const result = await probe(path, host);
          assert.equal(result.status, 200, `${host}${path}`);
          assert.ok(result.headers.etag);
          if (path.includes("/map?"))
            assert.ok(
              result.body.items.some((x) => x.id === records.published.placeId),
            );
          else assert.equal(result.body.profile.destinationId, "itacare");
          assert.equal(
            (await probe(path, host, { "If-None-Match": result.headers.etag }))
              .status,
            304,
          );
          activeRoutes.push({ host, path, etag: result.headers.etag });
        }
        const assertOwnerUnavailable = async () => {
          for (const { host, path, etag } of activeRoutes) {
            ownerFailure(await probe(path, host), `${host}${path}:fresh`);
            ownerFailure(
              await probe(path, host, { "If-None-Match": etag }),
              `${host}${path}:old-etag`,
            );
          }
          for (const [host, path] of [
            ["itacare.test.invalid", "/"],
            ["itacare.test.invalid", "/runtime-config.js"],
            ["itacare.test.invalid", "/api/runtime/destination"],
            ["shared.test.invalid", "/d/itacare/"],
            ["shared.test.invalid", "/d/itacare/runtime-config.js"],
            ["shared.test.invalid", "/d/itacare/api/runtime/destination"],
          ])
            ownerFailure(await probe(path, host), `${host}${path}`);
          assert.deepEqual(await boundarySnapshot(), activeBoundaries);
        };
        const assertLegacyAndProbes = async () => {
          assert.equal((await probe("/", "morro.test.invalid")).status, 200);
          const context = await probe(
            "/api/runtime/destination",
            "morro.test.invalid",
          );
          assert.equal(context.status, 200);
          assert.equal(context.body.destination.id, "morro-de-sao-paulo");
          const legacy = await detail(
            records.foreign.placeId,
            "morro.test.invalid",
          );
          assert.equal(legacy.status, 200);
          assert.equal(legacy.body.profile.destinationId, "morro-de-sao-paulo");
          assert.equal(
            (await probe("/healthz", "unknown.test.invalid")).status,
            200,
          );
          const readiness = await probe("/readyz", "unknown.test.invalid");
          assert.ok([200, 503].includes(readiness.status));
          assert.equal(readiness.headers["cache-control"], "no-store");
          assert.ok(Array.isArray(readiness.body.checks));
        };
        const readPublishedRow = async () => {
          const [rows] = await pool.execute(
            "SELECT publication_state,published_revision,published_place_json FROM business_places WHERE place_id = ?",
            [records.published.placeId],
          );
          assert.equal(rows.length, 1);
          return rows[0];
        };
        const activePlaceRow = await readPublishedRow();
        assert.equal(activePlaceRow.publication_state, "published");
        await assertLegacyAndProbes();
        try {
          assert.equal(
            (await destinationService.setStatus("itacare", "suspended")).status,
            "updated",
          );
          assert.equal(
            (await destinationService.read("itacare")).data.status,
            "suspended",
          );
          await assertOwnerUnavailable();
          await assertLegacyAndProbes();
          assert.deepEqual(await readPublishedRow(), activePlaceRow);
        } finally {
          assert.equal(
            (await destinationService.setStatus("itacare", "active")).status,
            "updated",
          );
        }
        const assertRestored = async () => {
          assert.equal(
            (await destinationService.read("itacare")).data.status,
            "active",
          );
          for (const { host, path, etag } of activeRoutes) {
            const result = await probe(path, host);
            assert.equal(result.status, 200, `${host}${path}`);
            assert.equal(result.headers.etag, etag);
            assert.equal(
              (await probe(path, host, { "If-None-Match": etag })).status,
              304,
            );
          }
          assert.deepEqual(await readPublishedRow(), activePlaceRow);
        };
        await assertRestored();
        const missingOwnPath = `/api/places/v1/${records["owner-missing"].placeId}`;
        const missingMapPath = mapPath.replace(
          "destinationId=itacare",
          "destinationId=other",
        );
        for (const [host, path] of [
          ["other.test.invalid", missingOwnPath],
          ["other.test.invalid", missingMapPath],
          ["itacare-other.test.invalid", `/d/other${missingOwnPath}`],
          ["itacare-other.test.invalid", `/d/other${missingMapPath}`],
        ]) {
          ownerFailure(await probe(path, host), `${host}${path}:missing-owner`);
          ownerFailure(
            await probe(path, host, { "If-None-Match": own.headers.etag }),
            `${host}${path}:missing-owner-conditional`,
          );
        }
        // Disposable SQL fault, not a live activation or owner UI mutation.
        // The owner service has no outage command. Preserve all data and restore
        // the table in finally; the Place tables stay readable throughout.
        const offlineTable = `itacare_owner_offline_${prefix.replaceAll("-", "_")}`;
        assert.match(offlineTable, /^[a-z0-9_]+$/u);
        await destinationPool.query(
          `RENAME TABLE destinations TO \`${offlineTable}\``,
        );
        try {
          await assert.rejects(destinationService.read("itacare"), {
            code: "ER_NO_SUCH_TABLE",
          });
          await assertOwnerUnavailable();
          await assertLegacyAndProbes();
          assert.deepEqual(await readPublishedRow(), activePlaceRow);
        } finally {
          await destinationPool.query(
            `RENAME TABLE \`${offlineTable}\` TO destinations`,
          );
        }
        await assertRestored();
        ownerReadRevocation = {
          destination: "itacare",
          routes: activeRoutes.map(({ host, path }) => ({ host, path })),
          ownerStatusApi: "DestinationAdminService.setStatus",
          suspendedFreshAndOldEtagDenied: true,
          ownerOnlyMutationPlaceSnapshotUnchanged: true,
          missingOwnerWithPublishedOwnPlaceDenied: true,
          outageFixture: "DISPOSABLE_DESTINATIONS_TABLE_RENAME_AND_RESTORE",
          ownerReadSqlError: "ER_NO_SUCH_TABLE",
          outageFreshAndOldEtagDenied: true,
          boundary404EquivalentBeforeOwner: true,
          reactivationAndOutageRecoveryRestored: true,
          morroLegacyAndProbeRoutesPreserved: true,
          revocationScope: "FUTURE_SERVER_READS_ONLY",
          externalCacheOrDownloadedDataRevocation: false,
        };
      }
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
      assert.equal(
        rows[0].published_revision,
        edited.editableRevision.revision,
      );
      const [versions] = await pool.query("SELECT VERSION() AS version");
      const sourceHashes = Object.fromEntries(
        [
          "./dev-server.mjs",
          "./place-platform-runtime.mjs",
          "./destination-api-host-gate.mjs",
          "./destination-public-projection.mjs",
          "./destination-admin-runtime.mjs",
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
          actualPort:
            mode === "dev-server" ? actualPort : server.address().port,
          uiAvailable: mode === "dev-server",
          uiAvailabilityEvidence:
            mode === "dev-server" ? "ACTUAL_HTTP_HTML_AND_SCOPED_CONFIG" : null,
          ownerReadRevocation,
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
          devServerProof: mode === "dev-server",
          liveDestinationActivation: false,
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
      if (server.listening)
        await new Promise((resolve) => server.close(resolve));
      if (destinationPool) await destinationPool.end();
      await runtime.stop();
      await pool.end();
    }
  });
}

// Proposed checked-harness fragment. It is not product acceptance until run
// against the claimed, built candidate. No SQL/runtime imports in this branch.
export async function runSyntheticBrowserProof() {
  const assert = (await import("node:assert/strict")).default;
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { fileURLToPath, pathToFileURL } = await import("node:url");
  const { createHash } = await import("node:crypto");
  const { execFileSync } = await import("node:child_process");
  const { createServer } = await import("node:http");
  const root = fs.realpathSync(
    process.env.ITACARE_BROWSER_PRODUCT_ROOT || process.cwd(),
  );
  const app = path.join(root, "apps/morro-digital-platform");
  const evidence = process.env.ITACARE_BROWSER_EVIDENCE_DIR;
  assert.ok(
    evidence && path.isAbsolute(evidence),
    "BROWSER_EVIDENCE_DIRECTORY_REQUIRED",
  );
  assert.equal(
    fs.existsSync(evidence),
    false,
    "FRESH_BROWSER_EVIDENCE_REQUIRED",
  );
  fs.mkdirSync(evidence, { recursive: true });
  const modulePath = process.env.ITACARE_PLAYWRIGHT_MODULE;
  assert.ok(
    modulePath && path.isAbsolute(modulePath),
    "EXISTING_PLAYWRIGHT_MODULE_REQUIRED",
  );
  const packagePath = path.join(path.dirname(modulePath), "package.json");
  assert.equal(
    JSON.parse(fs.readFileSync(packagePath, "utf8")).version,
    "1.54.2",
  );
  const playwrightModule = await import(
    pathToFileURL(fs.realpathSync(modulePath)).href
  );
  const { chromium } = playwrightModule.default ?? playwrightModule;
  assert.equal(
    typeof chromium?.launch,
    "function",
    "PLAYWRIGHT_CHROMIUM_EXPORT_REQUIRED",
  );
  const rewritePath = path.join(app, "tooling/workspace-browser-modules.mjs");
  const { rewriteWorkspaceModuleSpecifiers } = await import(
    pathToFileURL(rewritePath).href
  );
  const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
  const dependencyTreeHash = (directory) => {
    const records = [];
    const walk = (current, relative = "") => {
      for (const name of fs.readdirSync(current).sort()) {
        const full = path.join(current, name),
          key = path.posix.join(relative, name),
          stat = fs.lstatSync(full);
        if (stat.isDirectory()) walk(full, key);
        else if (stat.isFile())
          records.push([key, hash(fs.readFileSync(full))]);
        else if (stat.isSymbolicLink())
          records.push([key, "SYMLINK:" + fs.readlinkSync(full)]);
        else throw Error("UNEXPECTED_DEPENDENCY_FILE_TYPE");
      }
    };
    walk(directory);
    return hash(JSON.stringify(records));
  };
  const dependencyRoots = {
    playwright: fs.realpathSync(path.dirname(modulePath)),
    playwrightCore: fs.realpathSync(
      path.join(path.dirname(modulePath), "../playwright-core"),
    ),
  };
  const dependencyTreeSha256 = Object.fromEntries(
    Object.entries(dependencyRoots).map(([name, directory]) => [
      name,
      dependencyTreeHash(directory),
    ]),
  );
  const git = (...args) =>
    execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
  const identity = {
    headSha: git("rev-parse", "HEAD"),
    treeSha: git("rev-parse", "HEAD^{tree}"),
    clean: git("status", "--porcelain") === "",
  };
  const inputFiles = [
    "apps/morro-digital-platform/public/destination.html",
    "apps/morro-digital-platform/public/destination.css",
    "apps/morro-digital-platform/public/design-system-v2.css",
    "apps/morro-digital-platform/src/destinations/destination-browser-entry.ts",
    "apps/morro-digital-platform/src/bootstrap/geospatial.ts",
    "apps/morro-digital-platform/src/runtime/public-destination.ts",
    "apps/morro-digital-platform/tooling/workspace-browser-modules.mjs",
  ];
  const inputs = Object.fromEntries(
    inputFiles.map((file) => [
      file,
      hash(fs.readFileSync(path.join(root, file))),
    ]),
  );
  const harnessSha256 = hash(fs.readFileSync(fileURLToPath(import.meta.url)));
  const servedModules = new Map();
  const failures = [],
    cases = [],
    screenshots = [],
    externalRequests = [],
    pageErrors = [];
  let scenario, browser, activeContext;
  const places = ["place-a", "place-b"].map((id, i) => ({
    id,
    name: i ? "Published B" : "Published A",
    category: "beach",
    lat: -14.2784 + i * 0.001,
    lng: -38.9955,
    presentation: { markerKey: "beach", priority: 1 },
  }));
  const destination = {
    id: "itacare",
    name: "Itacaré",
    countryCode: "BR",
    timezone: "America/Bahia",
    currency: "BRL",
    center: { latitude: -14.2784, longitude: -38.9955 },
    radiusMeters: 2500,
    modules: { map: true, assistant: false, booking: false, payments: false },
  };
  const detail = (id, foreign = false) => ({
    profile: {
      id,
      destinationId: foreign ? "morro-de-sao-paulo" : "itacare",
      name: id === "place-a" ? "Published A" : "Published B",
      categoryId: "beach",
      location: { latitude: -14.2784, longitude: -38.9955 },
    },
    actions: {
      placeId: id,
      destinationId: foreign ? "morro-de-sao-paulo" : "itacare",
      secondaryActions: [],
    },
    partial: {},
    revision: { id: "synthetic-revision-" + id, number: 1 },
  });
  const send = (res, status, value, mime = "application/json") => {
    res.writeHead(status, {
      "Content-Type": mime,
      "Cache-Control": "no-store",
    });
    res.end(mime === "application/json" ? JSON.stringify(value) : value);
  };
  const pendingResponses = new Set();
  const server = createServer((req, res) => {
    try {
      if (req.method !== "GET" || !scenario) return send(res, 404, {});
      if (req.url.split("?")[0].split("/").includes(".."))
        return send(res, 404, {});
      const url = new URL(req.url, "http://127.0.0.1");
      if (/[%\\]/u.test(url.pathname) || url.pathname.split("/").includes(".."))
        return send(res, 404, {});
      if (url.pathname === "/d/itacare/") {
        const html = fs.readFileSync(
          path.join(app, "public/destination.html"),
          "utf8",
        );
        assert.equal(
          (html.match(/__DESTINATION_SCOPED_RUNTIME_CONFIG__/gu) || []).length,
          1,
        );
        return send(
          res,
          200,
          html.replace(
            "__DESTINATION_SCOPED_RUNTIME_CONFIG__",
            "/d/itacare/runtime-config.js",
          ),
          "text/html",
        );
      }
      if (url.pathname === "/d/itacare/runtime-config.js") {
        return send(
          res,
          200,
          "window.__MORRO_RUNTIME_ENV__=" +
            JSON.stringify({
              VITE_MAPBOX_ACCESS_TOKEN:
                scenario.token === false
                  ? ""
                  : "pk.synthetic_fixture_not_a_credential",
            }) +
            ";",
          "text/javascript",
        );
      }
      if (url.pathname === "/d/itacare/api/runtime/destination") {
        if (scenario.ownerFailed)
          return send(res, 503, { error: "SYNTHETIC_OWNER_UNAVAILABLE" });
        return send(res, 200, {
          source: "destination-owner",
          destination: {
            ...destination,
            modules: {
              ...destination.modules,
              map: scenario.mapEnabled !== false,
            },
          },
        });
      }
      if (url.pathname === "/d/itacare/api/places/v1/map") {
        assert.equal(url.searchParams.get("destinationId"), "itacare");
        scenario.mapRequests++;
        if (scenario.listFailed)
          return send(res, 503, { error: "SYNTHETIC_LIST_UNAVAILABLE" });
        if (scenario.holdList) {
          pendingResponses.add(res);
          scenario.releaseList = () => {
            pendingResponses.delete(res);
            send(res, 200, { items: places, nextCursor: null });
          };
          return;
        }
        return send(res, 200, {
          items: scenario.empty ? [] : places,
          nextCursor: null,
        });
      }
      const match = /^\/d\/itacare\/api\/places\/v1\/(place-[ab])$/u.exec(
        url.pathname,
      );
      if (match) {
        const id = match[1];
        scenario.detailRequests.push({
          id,
          locale: url.searchParams.get("locale"),
        });
        const release = (status = 200, foreign = false) => {
          pendingResponses.delete(res);
          send(
            res,
            status,
            status === 200
              ? detail(id, foreign)
              : { error: "SYNTHETIC_DETAIL_UNAVAILABLE" },
          );
        };
        if (scenario.hold.has(id)) {
          pendingResponses.add(res);
          scenario.pending.set(id, release);
        } else
          release(scenario.detailStatus?.[id] || 200, scenario.foreign === id);
        return;
      }
      let relative;
      if (
        url.pathname.startsWith("/assets/brand/") &&
        /^[a-z0-9-]+\.svg$/u.test(url.pathname.slice(14))
      ) {
        relative = "apps/morro-digital-platform/public" + url.pathname;
      } else if (
        [
          "/apps/morro-digital-platform/public/design-system-v2.css",
          "/apps/morro-digital-platform/public/destination.css",
        ].includes(url.pathname)
      )
        relative = url.pathname.slice(1);
      else if (
        /^\/apps\/morro-digital-platform\/dist\/[a-zA-Z0-9_./-]+\.js$/u.test(
          url.pathname,
        ) ||
        /^\/packages\/[a-z0-9-]+\/dist\/[a-zA-Z0-9_./-]+\.js$/u.test(
          url.pathname,
        )
      )
        relative = url.pathname.slice(1);
      else return send(res, 404, {});
      const target = path.resolve(root, relative);
      if (
        !target.startsWith(root + path.sep) ||
        !fs.existsSync(target) ||
        !fs.realpathSync(target).startsWith(root + path.sep) ||
        !fs.statSync(target).isFile()
      )
        return send(res, 404, {});
      const raw = fs.readFileSync(target);
      if (relative.endsWith(".js")) {
        servedModules.set(relative, hash(raw));
        return send(
          res,
          200,
          rewriteWorkspaceModuleSpecifiers(raw.toString("utf8")),
          "text/javascript",
        );
      }
      return send(
        res,
        200,
        raw,
        relative.endsWith(".css") ? "text/css" : "image/svg+xml",
      );
    } catch (error) {
      send(res, 500, { error: "SYNTHETIC_FIXTURE_SERVER_ERROR" });
      pageErrors.push("server:" + error.message);
    }
  });
  const copy = {
    "pt-BR": {
      ready: "Mapa carregado.",
      unavailable:
        "Mapa indisponível. Os lugares publicados continuam acessíveis na lista.",
      detail: "Informações indisponíveis.",
      loading: "Carregando informações...",
      link: "Ver no mapa externo",
      empty: "Ainda não existem lugares publicados neste destino.",
      failed: "Não foi possível carregar o conteúdo deste destino.",
    },
    en: {
      ready: "Map loaded.",
      unavailable: "Map unavailable. Published places remain accessible below.",
      detail: "Information unavailable.",
      loading: "Loading information...",
      link: "View on external map",
      empty: "No places have been published for this destination yet.",
      failed: "Destination content could not be loaded.",
    },
    es: {
      ready: "Mapa cargado.",
      unavailable:
        "Mapa no disponible. Los lugares publicados siguen accesibles en la lista.",
      detail: "Información no disponible.",
      loading: "Cargando información...",
      link: "Ver en mapa externo",
      empty: "Todavía no hay lugares publicados para este destino.",
      failed: "No se pudo cargar el contenido del destino.",
    },
    he: {
      ready: "המפה נטענה.",
      unavailable: "המפה אינה זמינה. הרשימה עדיין נגישה.",
      detail: "המידע אינו זמין.",
      loading: "טוען מידע...",
      link: "הצגה במפה חיצונית",
      empty: "אין עדיין מקומות שפורסמו ליעד זה.",
      failed: "לא ניתן לטעון את תוכן היעד.",
    },
  };
  const labels = {
    "pt-BR": {
      skip: "Ir para o conteúdo",
      language: "Idioma",
      select: "Selecionar idioma",
      map: "Mapa do destino",
      interactive: "Mapa interativo do destino",
      places: "Lugares publicados",
      footer:
        "Informações e serviços sujeitos à publicação e disponibilidade local.",
      loadingMap: "Carregando mapa...",
      searching: "Carregando lugares publicados...",
    },
    en: {
      skip: "Skip to content",
      language: "Language",
      select: "Select language",
      map: "Destination map",
      interactive: "Interactive destination map",
      places: "Published places",
      footer:
        "Information and services are subject to publication and local availability.",
      loadingMap: "Loading map...",
      searching: "Loading published places...",
    },
    es: {
      skip: "Ir al contenido",
      language: "Idioma",
      select: "Seleccionar idioma",
      map: "Mapa del destino",
      interactive: "Mapa interactivo del destino",
      places: "Lugares publicados",
      footer:
        "La información y los servicios están sujetos a publicación y disponibilidad local.",
      loadingMap: "Cargando mapa...",
      searching: "Cargando lugares publicados...",
    },
    he: {
      skip: "דילוג לתוכן",
      language: "שפה",
      select: "בחירת שפה",
      map: "מפת היעד",
      interactive: "מפה אינטראקטיבית של היעד",
      places: "מקומות שפורסמו",
      footer: "המידע והשירותים כפופים לפרסום ולזמינות מקומית.",
      loadingMap: "טוען מפה...",
      searching: "טוען מקומות...",
    },
  };
  const check = async (name, fn) => {
    try {
      await fn();
      cases.push({ name, result: "PASS" });
    } catch (error) {
      cases.push({ name, result: "FAIL" });
      failures.push({ name, message: error.message.slice(0, 800) });
    }
  };
  const settle = (page) =>
    page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
  const waitPending = async (id) => {
    const end = Date.now() + 5000;
    while (!scenario.pending.has(id)) {
      if (Date.now() >= end) throw Error("FIXTURE_REQUEST_NOT_OBSERVED:" + id);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  };
  async function closeContext() {
    for (const response of pendingResponses) response.destroy();
    pendingResponses.clear();
    if (activeContext) {
      await activeContext.close();
      activeContext = null;
    }
  }
  async function open(options = {}) {
    await closeContext();
    scenario = {
      mapRequests: 0,
      detailRequests: [],
      pending: new Map(),
      hold: new Set(),
      ...options,
    };
    activeContext = await browser.newContext({
      viewport: options.viewport || { width: 390, height: 844 },
      locale: options.locale || "en",
      serviceWorkers: "block",
    });
    activeContext.on("request", (req) => {
      if (!req.url().startsWith(origin + "/"))
        externalRequests.push({
          method: req.method(),
          url: req.url().split("?")[0],
        });
    });
    await activeContext.route("**/*", (route) =>
      route
        .request()
        .url()
        .startsWith(origin + "/")
        ? route.continue()
        : route.abort("blockedbyclient"),
    );
    await activeContext.addInitScript(() => {
      const fixture = (window.__ITACARE_FAKE_MAP__ = {
        maps: [],
        markers: [],
        removed: 0,
      });
      class Map {
        constructor(options) {
          this.options = options;
          this.listeners = new globalThis.Map();
          this.loaded = false;
          fixture.maps.push(this);
        }
        on(event, callback) {
          const list = this.listeners.get(event) || new Set();
          list.add(callback);
          this.listeners.set(event, list);
        }
        off(event, callback) {
          this.listeners.get(event)?.delete(callback);
        }
        once(event, callback) {
          const once = () => {
            this.off(event, once);
            callback();
          };
          this.on(event, once);
        }
        emit(event) {
          if (event === "load") this.loaded = true;
          for (const callback of [...(this.listeners.get(event) || [])])
            callback();
        }
        isStyleLoaded() {
          return this.loaded;
        }
        setCenter(center) {
          this.center = center;
        }
        remove() {
          fixture.removed++;
          this.listeners.clear();
        }
      }
      class Marker {
        setLngLat(coordinates) {
          this.coordinates = coordinates;
          return this;
        }
        setPopup(popup) {
          this.popup = popup;
          return this;
        }
        addTo(map) {
          this.map = map;
          fixture.markers.push(this);
          return this;
        }
        remove() {
          this.removed = true;
        }
      }
      class Popup {
        setText(value) {
          this.text = value;
          return this;
        }
      }
      window.mapboxgl = {
        accessToken: "",
        version: "SYNTHETIC_MAP_SDK",
        Map,
        Marker,
        Popup,
      };
    });
    const page = await activeContext.newPage();
    page.on("pageerror", (error) => pageErrors.push(error.message));
    if (options.clock) await page.clock.install();
    await page.goto(origin + "/d/itacare/", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () =>
        document
          .getElementById("destination-main")
          ?.getAttribute("aria-busy") === "false",
    );
    if (
      !options.ownerFailed &&
      !options.empty &&
      !options.listFailed &&
      !options.holdList
    )
      await page.locator("[data-place-id='place-b']").waitFor();
    if (
      options.token !== false &&
      options.mapEnabled !== false &&
      !options.ownerFailed
    )
      await page.waitForFunction(
        () => window.__ITACARE_FAKE_MAP__?.maps.length === 1,
      );
    return page;
  }
  async function screenshot(page, name, locale) {
    const file = path.join(evidence, name + ".png");
    await page.screenshot({ path: file, fullPage: true });
    const bytes = fs.readFileSync(file);
    assert.ok(bytes.length > 100);
    assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    screenshots.push({
      path: path.basename(file),
      bytes: bytes.length,
      sha256: hash(bytes),
      viewport: page.viewportSize(),
      locale,
    });
  }
  let origin;
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    origin = "http://127.0.0.1:" + server.address().port;
    browser = await chromium.launch({
      headless: true,
      ...(process.env.ITACARE_CHROMIUM_EXECUTABLE
        ? { executablePath: process.env.ITACARE_CHROMIUM_EXECUTABLE }
        : {}),
      args: ["--no-sandbox"],
    });
    let page = await open();
    // Fixture startup is not a product regression: fail immediately if real modules did not mount.
    assert.equal(
      await page.locator("#destination-name").textContent(),
      "Itacaré",
    );
    assert.deepEqual(pageErrors, [], "BROWSER_SETUP_ERRORS");
    await check("native-constructor-does-not-mean-ready", async () =>
      assert.equal(
        await page.locator("#destination-map-status").textContent(),
        labels.en.loadingMap,
      ),
    );
    await check("itacare-attribution-enabled", async () =>
      assert.equal(
        await page.evaluate(
          () => window.__ITACARE_FAKE_MAP__.maps[0].options.attributionControl,
        ),
        true,
      ),
    );
    await page.evaluate(() => window.__ITACARE_FAKE_MAP__.maps[0].emit("load"));
    await settle(page);
    await check("native-load-means-ready", async () =>
      assert.equal(
        await page.locator("#destination-map-status").textContent(),
        copy.en.ready,
      ),
    );
    for (const locale of ["pt-BR", "en", "es", "he"]) {
      await page.selectOption("#destination-language", locale);
      await check("ready-map-relocalizes-" + locale, async () =>
        assert.equal(
          await page.locator("#destination-map-status").textContent(),
          copy[locale].ready,
        ),
      );
    }
    await page.selectOption("#destination-language", "en");
    await page.evaluate(() =>
      window.__ITACARE_FAKE_MAP__.maps[0].emit("error"),
    );
    await settle(page);
    await check("native-error-invalidates-ready", async () =>
      assert.equal(
        await page.locator("#destination-map-status").textContent(),
        copy.en.unavailable,
      ),
    );
    await page.evaluate(() => window.__ITACARE_FAKE_MAP__.maps[0].emit("load"));
    await settle(page);
    await check("late-load-cannot-revive-failed-map", async () =>
      assert.equal(
        await page.locator("#destination-map-status").textContent(),
        copy.en.unavailable,
      ),
    );
    await page.locator("[data-place-id='place-b']").click();
    await page.locator("#destination-place-detail h3").waitFor();
    await check("manual-detail-survives-map-failure", async () =>
      assert.equal(
        await page.locator("#destination-place-detail h3").textContent(),
        "Published B",
      ),
    );

    for (const aStatus of [200, 503]) {
      page = await open({ token: false, hold: new Set(["place-a"]) });
      await page.locator("[data-place-id='place-a']").click();
      await waitPending("place-a");
      await page.locator("[data-place-id='place-b']").click();
      await page.waitForFunction(
        () =>
          document.querySelector("#destination-place-detail h3")
            ?.textContent === "Published B",
      );
      const response = page.waitForResponse((r) =>
        r.url().includes("/api/places/v1/place-a?"),
      );
      scenario.pending.get("place-a")(aStatus);
      await response;
      await settle(page);
      await check("latest-selection-survives-stale-a-" + aStatus, async () => {
        assert.equal(
          await page.locator("#destination-place-detail h3").textContent(),
          "Published B",
        );
        assert.equal(
          await page.locator("#destination-place-detail a").count(),
          1,
        );
      });
    }
    page = await open({
      token: false,
      hold: new Set(["place-a"]),
      detailStatus: { "place-b": 503 },
    });
    await page.locator("[data-place-id='place-a']").click();
    await waitPending("place-a");
    await page.locator("[data-place-id='place-b']").click();
    await page.waitForFunction(
      (expected) =>
        document.getElementById("destination-place-detail")?.textContent ===
        expected,
      copy.en.detail,
    );
    const staleResponse = page.waitForResponse((r) =>
      r.url().includes("/api/places/v1/place-a?"),
    );
    scenario.pending.get("place-a")();
    await staleResponse;
    await settle(page);
    await check("latest-failure-survives-stale-success", async () => {
      assert.equal(
        await page.locator("#destination-place-detail").textContent(),
        copy.en.detail,
      );
      assert.equal(
        await page.locator("#destination-place-detail a").count(),
        0,
      );
    });
    page = await open({ token: false, foreign: "place-a" });
    await page.locator("[data-place-id='place-a']").click();
    await page.waitForFunction(
      (expected) =>
        document.getElementById("destination-place-detail")?.textContent ===
        expected,
      copy.en.detail,
    );
    await check("foreign-detail-fails-closed", async () =>
      assert.equal(
        await page.locator("#destination-place-detail a").count(),
        0,
      ),
    );
    for (const locale of ["pt-BR", "en", "es", "he"]) {
      await page.selectOption("#destination-language", locale);
      await check("unavailable-detail-relocalizes-" + locale, async () =>
        assert.equal(
          await page.locator("#destination-place-detail").textContent(),
          copy[locale].detail,
        ),
      );
    }

    for (const locale of ["pt-BR", "en", "es", "he"]) {
      page = await open({ token: false, hold: new Set(["place-a"]) });
      await page.locator("[data-place-id='place-a']").click();
      await waitPending("place-a");
      await page.selectOption("#destination-language", locale);
      await check("pending-detail-locale-" + locale, async () =>
        assert.equal(
          await page.locator("#destination-place-detail").textContent(),
          copy[locale].loading,
        ),
      );
      await check("unavailable-map-locale-" + locale, async () =>
        assert.equal(
          await page.locator("#destination-map-status").textContent(),
          copy[locale].unavailable,
        ),
      );
      const released = page.waitForResponse((r) =>
        r.url().includes("/api/places/v1/place-a?"),
      );
      scenario.pending.get("place-a")();
      await released;
      await page.locator("#destination-place-detail a").waitFor();
      await check("completed-detail-current-locale-" + locale, async () => {
        assert.equal(
          await page.locator("#destination-place-detail a").textContent(),
          copy[locale].link,
        );
        assert.equal(
          await page.locator("#destination-place-detail h3").textContent(),
          "Published A",
        );
      });
      const nextLocale = locale === "en" ? "he" : "en";
      await page.selectOption("#destination-language", nextLocale);
      await check("existing-detail-relocalizes-" + locale, async () =>
        assert.equal(
          await page.locator("#destination-place-detail a").textContent(),
          copy[nextLocale].link,
        ),
      );
      await page.selectOption("#destination-language", locale);
      await check("locale-direction-and-overflow-" + locale, async () => {
        assert.equal(await page.locator("html").getAttribute("lang"), locale);
        assert.equal(
          await page.locator("html").getAttribute("dir"),
          locale === "he" ? "rtl" : "ltr",
        );
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
          true,
        );
      });
      await check("accessible-labels-and-footer-" + locale, async () => {
        const actual = await page.evaluate(() => ({
          skip: document.getElementById("destination-skip")?.textContent,
          language: document.getElementById("destination-language-label")
            ?.textContent,
          select: document
            .getElementById("destination-language")
            ?.getAttribute("aria-label"),
          map: document
            .getElementById("destination-map-region")
            ?.getAttribute("aria-label"),
          interactive: document
            .getElementById("destination-map")
            ?.getAttribute("aria-label"),
          places: document
            .getElementById("destination-places-region")
            ?.getAttribute("aria-label"),
          footer: document.getElementById("destination-footer-note")
            ?.textContent,
        }));
        const { loadingMap, searching, ...expected } = labels[locale];
        assert.deepEqual(actual, expected);
      });
      await check("touch-targets-" + locale, async () => {
        const bounds = await page
          .locator("[data-place-id='place-a']")
          .boundingBox();
        assert.ok(bounds && bounds.width >= 44 && bounds.height >= 44);
      });
      await screenshot(page, "mobile-" + locale, locale);
    }
    page = await open({ token: false, viewport: { width: 1280, height: 900 } });
    await page.locator("[data-place-id='place-b']").focus();
    await page.keyboard.press("Enter");
    await page.locator("#destination-place-detail h3").waitFor();
    await check("keyboard-selection-canonical-id", async () =>
      assert.equal(
        await page.locator("#destination-place-detail h3").textContent(),
        "Published B",
      ),
    );
    await screenshot(page, "desktop-en", "en");
    for (const kind of ["empty", "listFailed"]) {
      page = await open({ token: false, [kind]: true });
      for (const locale of ["pt-BR", "en", "es", "he"]) {
        await page.selectOption("#destination-language", locale);
        await check(kind + "-relocalizes-" + locale, async () =>
          assert.equal(
            await page.locator("#destination-places-status").textContent(),
            copy[locale][kind === "empty" ? "empty" : "failed"],
          ),
        );
      }
    }
    page = await open({ token: false, holdList: true });
    for (const locale of ["pt-BR", "en", "es", "he"]) {
      await page.selectOption("#destination-language", locale);
      await check("pending-list-relocalizes-" + locale, async () =>
        assert.equal(
          await page.locator("#destination-places-status").textContent(),
          labels[locale].searching,
        ),
      );
    }
    assert.equal(typeof scenario.releaseList, "function");
    scenario.releaseList();
    await page.locator("[data-place-id='place-b']").waitFor();
    page = await open({ ownerFailed: true });
    for (const locale of ["pt-BR", "en", "es", "he"]) {
      await page.selectOption("#destination-language", locale);
      await check("failed-owner-remains-localizable-" + locale, async () => {
        assert.equal(
          await page.locator("#destination-status").textContent(),
          copy[locale].failed,
        );
        assert.equal(await page.locator("html").getAttribute("lang"), locale);
      });
    }
    for (const options of [{ token: false }, { mapEnabled: false }]) {
      page = await open(options);
      await check("no-map-with-" + Object.keys(options)[0], async () =>
        assert.equal(
          await page.evaluate(() => window.__ITACARE_FAKE_MAP__.maps.length),
          0,
        ),
      );
    }
    page = await open({ clock: true });
    await page.clock.fastForward(60_000);
    await check("map-load-timeout-fails-closed", async () =>
      assert.equal(
        await page.locator("#destination-map-status").textContent(),
        copy.en.unavailable,
      ),
    );
    await page.evaluate(() => window.__ITACARE_FAKE_MAP__.maps[0].emit("load"));
    await check("load-after-timeout-remains-unavailable", async () =>
      assert.equal(
        await page.locator("#destination-map-status").textContent(),
        copy.en.unavailable,
      ),
    );
    await page.evaluate(() =>
      window.dispatchEvent(new PageTransitionEvent("pagehide")),
    );
    await check("pagehide-removes-map-and-listeners", async () => {
      const state = await page.evaluate(() => ({
        removed: window.__ITACARE_FAKE_MAP__.removed,
        listeners: [
          ...window.__ITACARE_FAKE_MAP__.maps[0].listeners.values(),
        ].reduce((n, x) => n + x.size, 0),
      }));
      assert.equal(state.removed, 1);
      assert.equal(state.listeners, 0);
    });
    // Exercise pagehide on its own live map, not the already-destroyed timeout map.
    for (const beforeHide of ["loading", "ready"]) {
      page = await open();
      if (beforeHide === "ready") {
        await page.evaluate(() =>
          window.__ITACARE_FAKE_MAP__.maps[0].emit("load"),
        );
        await settle(page);
      }
      await check("pagehide-live-precondition-" + beforeHide, async () => {
        const state = await page.evaluate(() => ({
          removed: window.__ITACARE_FAKE_MAP__.removed,
          listeners: [
            ...window.__ITACARE_FAKE_MAP__.maps[0].listeners.values(),
          ].reduce((n, x) => n + x.size, 0),
        }));
        assert.equal(state.removed, 0);
        assert.ok(state.listeners > 0);
        assert.equal(
          await page.locator("#destination-map-status").textContent(),
          beforeHide === "ready" ? copy.en.ready : labels.en.loadingMap,
        );
      });
      await page.evaluate(() =>
        window.dispatchEvent(
          new PageTransitionEvent("pagehide", { persisted: true }),
        ),
      );
      await settle(page);
      const hiddenStatus = await page
        .locator("#destination-map-status")
        .textContent();
      await check("pagehide-cleans-live-map-" + beforeHide, async () => {
        const state = await page.evaluate(() => ({
          removed: window.__ITACARE_FAKE_MAP__.removed,
          listeners: [
            ...window.__ITACARE_FAKE_MAP__.maps[0].listeners.values(),
          ].reduce((n, x) => n + x.size, 0),
        }));
        assert.equal(state.removed, 1);
        assert.equal(state.listeners, 0);
      });
      await page.evaluate(() => {
        const map = window.__ITACARE_FAKE_MAP__.maps[0];
        map.emit("load");
        map.emit("error");
      });
      await settle(page);
      await check(
        "pagehide-late-events-cannot-revive-" + beforeHide,
        async () => {
          assert.equal(
            await page.locator("#destination-map-status").textContent(),
            hiddenStatus,
          );
          assert.equal(
            await page.evaluate(() => window.__ITACARE_FAKE_MAP__.maps.length),
            1,
          );
        },
      );
      await page.evaluate(() =>
        window.dispatchEvent(
          new PageTransitionEvent("pageshow", { persisted: true }),
        ),
      );
      await page.waitForFunction(
        () => window.__ITACARE_FAKE_MAP__.maps.length === 2,
      );
      await check(
        "persisted-pageshow-waits-for-new-map-load-" + beforeHide,
        async () => {
          assert.equal(
            await page.locator("#destination-map-status").textContent(),
            labels.en.loadingMap,
          );
          assert.equal(
            await page.evaluate(() => window.__ITACARE_FAKE_MAP__.removed),
            1,
          );
        },
      );
      await page.evaluate(() => {
        const map = window.__ITACARE_FAKE_MAP__.maps[0];
        map.emit("load");
        map.emit("error");
      });
      await settle(page);
      await check(
        "persisted-pageshow-ignores-old-map-events-" + beforeHide,
        async () =>
          assert.equal(
            await page.locator("#destination-map-status").textContent(),
            labels.en.loadingMap,
          ),
      );
      await page.evaluate(() =>
        window.__ITACARE_FAKE_MAP__.maps[1].emit("load"),
      );
      await settle(page);
      await check("persisted-pageshow-new-map-ready-" + beforeHide, async () =>
        assert.equal(
          await page.locator("#destination-map-status").textContent(),
          copy.en.ready,
        ),
      );
    }
    await check("zero-external-request-attempts", async () =>
      assert.deepEqual(externalRequests, []),
    );
    await check("zero-unhandled-browser-errors", async () =>
      assert.deepEqual(pageErrors, []),
    );
    for (const [file, digest] of Object.entries(inputs))
      assert.equal(
        hash(fs.readFileSync(path.join(root, file))),
        digest,
        "INPUT_MUTATED:" + file,
      );
    for (const [file, digest] of servedModules)
      assert.equal(
        hash(fs.readFileSync(path.join(root, file))),
        digest,
        "MODULE_MUTATED:" + file,
      );
    for (const [name, directory] of Object.entries(dependencyRoots))
      assert.equal(
        dependencyTreeHash(directory),
        dependencyTreeSha256[name],
        "SHARED_DEPENDENCY_CHANGED:" + name,
      );
    assert.equal(git("rev-parse", "HEAD"), identity.headSha);
    assert.equal(git("rev-parse", "HEAD^{tree}"), identity.treeSha);
    const report = {
      status: failures.length
        ? "ITACARE_SYNTHETIC_BROWSER_FAILED"
        : "ITACARE_SYNTHETIC_BROWSER_PROVEN",
      ...identity,
      harnessSha256,
      inputs,
      servedModuleSha256: Object.fromEntries([...servedModules].sort()),
      browserVersion: browser.version(),
      chromiumExecutable: fs.realpathSync(
        process.env.ITACARE_CHROMIUM_EXECUTABLE || chromium.executablePath(),
      ),
      playwrightVersion: "1.54.2",
      dependencyRoots,
      dependencyTreeSha256,
      playwrightModuleSha256: hash(fs.readFileSync(modulePath)),
      origin,
      fixtures: {
        server: "SYNTHETIC_LOOPBACK_STATIC",
        ownerAndPlaces: "EXPLICIT_SYNTHETIC_API",
        map: "SYNTHETIC_MAP_SDK",
      },
      sqlAcceptance: "NOT_RUN",
      providerAcceptance: "NOT_RUN",
      cases,
      failures,
      externalRequests,
      pageErrors,
      screenshots,
    };
    fs.writeFileSync(
      path.join(evidence, "browser-report.json"),
      JSON.stringify(report, null, 2) + "\n",
      { flag: "wx" },
    );
    fs.writeFileSync(
      path.join(evidence, "screenshot-manifest.json"),
      JSON.stringify(
        { headSha: identity.headSha, treeSha: identity.treeSha, screenshots },
        null,
        2,
      ) + "\n",
      { flag: "wx" },
    );
    console.log(JSON.stringify(report));
    assert.equal(failures.length, 0, "SYNTHETIC_BROWSER_REGRESSIONS_FAILED");
  } finally {
    await closeContext();
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
