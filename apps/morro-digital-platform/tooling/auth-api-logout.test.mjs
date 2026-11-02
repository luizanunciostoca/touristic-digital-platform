import { createHash, randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { canonicalAuthRoles } from "@touristic/auth";
import * as authServer from "@touristic/auth-server";
import { createCrmMySqlPoolFromEnvironment } from "@touristic/crm-server";
import { createAuthApi } from "./auth-api.mjs";

const prefix = "/api/dashboard/auth";
const password = "D01 isolated logout fixture";
const passwordHash = authServer.hashPassword(password, Buffer.alloc(16, 21));
const readOnlyRoles = ["SUPPORT", "AUDITOR", "BUSINESS_VIEWER"];
const roles = [...canonicalAuthRoles, "admin", "owner", "manager", "viewer"];
const users = roles.map((role) => ({
  id: `d01-${role.toLowerCase()}`,
  email: `d01-${role.toLowerCase()}@example.invalid`,
  role,
  businessIds: ["tenant-a"],
  passwordHash,
}));
const databaseUrl = process.env.MORRO_TEST_AUTH_DATABASE_URL || "";
if (databaseUrl) {
  let url;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error("D01_REQUIRES_DISPOSABLE_LOCAL_AUTH_DATABASE");
  }
  if (
    url.protocol !== "mysql:" ||
    url.hostname !== "127.0.0.1" ||
    url.port !== "33385" ||
    url.pathname !== "/auth_826_d01" ||
    url.search ||
    url.hash
  ) {
    throw new Error("D01_REQUIRES_DISPOSABLE_LOCAL_AUTH_DATABASE");
  }
}

function request(path, { method = "GET", headers = {}, body } = {}) {
  return {
    url: path,
    method,
    headers: { host: "localhost", origin: "http://localhost", ...headers },
    socket: { remoteAddress: `d01-fixture-${randomUUID()}` },
    async *[Symbol.asyncIterator]() {
      if (body !== undefined) yield Buffer.from(JSON.stringify(body));
    },
  };
}

function recorder() {
  return {
    statusCode: 0,
    headers: new Map(),
    body: "",
    setHeader(name, value) {
      this.headers.set(name.toLowerCase(), value);
    },
    end(value = "") {
      this.body = String(value);
    },
  };
}

async function call(api, route, options) {
  const response = recorder();
  await api.handle(
    request(`${prefix}/${route}`, options),
    response,
    `${prefix}/${route}`,
  );
  return { ...response, data: JSON.parse(response.body || "{}") };
}

async function fixture(url = "") {
  const events = [];
  const environment = {
    DASHBOARD_AUTH_SECRET: "d01-logout-test-secret-0000000000000000000000",
    DASHBOARD_USERS_JSON: JSON.stringify(users),
    DASHBOARD_AUTH_ORIGIN: "http://localhost",
    NODE_ENV: "development",
    MORRO_DATABASE_SCHEMA_MODE: "apply",
    AUTH_DATABASE_URL: url,
  };
  const api = createAuthApi({
    getEnvironmentValue: (key) => environment[key] || "",
    audit: (_request, event) => events.push(event),
  });
  await api.start();
  try {
    expect(api.readinessCheck()).toMatchObject({
      status: "pass",
      detail: url ? "shared-durable" : "process-local-development",
    });
  } catch (error) {
    await api.stop();
    throw error;
  }
  return { api, events };
}

async function login(api, role) {
  const response = await call(api, "login", {
    method: "POST",
    body: { email: `d01-${role.toLowerCase()}@example.invalid`, password },
  });
  expect(response.statusCode).toBe(200);
  return {
    cookie: String(response.headers.get("set-cookie")).split(";", 1)[0],
    "x-csrf-token": response.data.csrfToken,
  };
}

function expectLoggedOut(response, events) {
  expect(response.statusCode).toBe(200);
  expect(response.data).toEqual({ success: true });
  expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  expect(events).toContainEqual({
    action: "dashboard.logout",
    result: "success",
  });
}

afterEach(() => vi.restoreAllMocks());

it.each(roles)(
  "D01 memory %s: self-logout revokes only the current session",
  async (role) => {
    const { api, events } = await fixture();
    try {
      const headers = await login(api, role);
      const otherSession = await login(api, role);
      expectLoggedOut(
        await call(api, "logout", { method: "POST", headers }),
        events,
      );
      expect((await call(api, "session", { headers })).statusCode).toBe(401);
      expect(
        (await call(api, "session", { headers: otherSession })).statusCode,
      ).toBe(200);
    } finally {
      await api.stop();
    }
  },
);

it.each([
  ["anonymous", { cookie: undefined }, 401, "AUTH_REQUIRED"],
  [
    "forged session",
    { cookie: `${authServer.sessionCookieName}=invalid` },
    401,
    "AUTH_REQUIRED",
  ],
  [
    "foreign origin",
    { origin: "https://untrusted.invalid" },
    403,
    "ORIGIN_DENIED",
  ],
  ["missing CSRF", { "x-csrf-token": undefined }, 403, "INVALID_CSRF"],
  ["invalid CSRF", { "x-csrf-token": "invalid" }, 403, "INVALID_CSRF"],
])(
  "D01 rejects %s without revocation or cookie clearing",
  async (_label, override, status, error) => {
    const { api, events } = await fixture();
    try {
      const headers = await login(api, "SUPPORT");
      const response = await call(api, "logout", {
        method: "POST",
        headers: { ...headers, ...override },
      });
      expect(response.statusCode).toBe(status);
      expect(response.data.error).toBe(error);
      expect(response.headers.has("set-cookie")).toBe(false);
      expect(
        events.some(
          (event) =>
            event.action === "dashboard.logout" && event.result === "success",
        ),
      ).toBe(false);
      expect((await call(api, "session", { headers })).statusCode).toBe(200);
    } finally {
      await api.stop();
    }
  },
);

it.each([...readOnlyRoles, "viewer"])(
  "D01 %s business mutations remain denied",
  async (role) => {
    const { api } = await fixture();
    try {
      const headers = await login(api, role);
      const response = recorder();
      await api.authorizeBusinessRequest(
        request("/api/business", { method: "POST", headers }),
        response,
        "tenant-a",
        { mutation: true },
      );
      expect(response.statusCode).toBe(403);
      expect(JSON.parse(response.body).error).toBe("READ_ONLY_ROLE");
    } finally {
      await api.stop();
    }
  },
);

it.each([false, true])(
  "D01 awaits revocation and fails closed (storage rejects: %s)",
  async (reject) => {
    const state = authServer.createInMemoryAuthSecurityState();
    const entered = Promise.withResolvers();
    const gate = Promise.withResolvers();
    vi.spyOn(authServer, "createInMemoryAuthSecurityState").mockReturnValueOnce(
      {
        ...state,
        async revoke(session) {
          entered.resolve();
          await gate.promise;
          return state.revoke(session);
        },
      },
    );
    const { api, events } = await fixture();
    try {
      const headers = await login(api, "SUPPORT");
      const response = recorder();
      const pending = api.handle(
        request(`${prefix}/logout`, { method: "POST", headers }),
        response,
        `${prefix}/logout`,
      );
      await entered.promise;
      expect(response.statusCode).toBe(0);
      expect(response.headers.has("set-cookie")).toBe(false);
      expect(events.some((event) => event.action === "dashboard.logout")).toBe(
        false,
      );
      if (reject) gate.reject(new Error("D01_STORAGE_UNAVAILABLE"));
      else gate.resolve();
      await pending;
      if (reject) {
        expect(response.statusCode).toBe(503);
        expect(response.headers.has("set-cookie")).toBe(false);
        expect(
          events.filter((event) => event.action === "dashboard.logout"),
        ).toEqual([
          {
            action: "dashboard.logout",
            result: "unavailable",
            reason: "D01_STORAGE_UNAVAILABLE",
          },
        ]);
        expect((await call(api, "session", { headers })).statusCode).toBe(200);
      } else {
        expectLoggedOut(
          { ...response, data: JSON.parse(response.body) },
          events,
        );
      }
    } finally {
      gate.resolve();
      await api.stop();
    }
  },
);

it.skipIf(!databaseUrl).each(readOnlyRoles)(
  "D01 SQL %s: self-logout revokes durably",
  async (role) => {
    const { api, events } = await fixture(databaseUrl);
    const observer = createCrmMySqlPoolFromEnvironment({
      CRM_DATABASE_URL: databaseUrl,
    });
    try {
      const headers = await login(api, role);
      const active = await api.resolveSession(
        request(`${prefix}/session`, { headers }),
      );
      expect(Boolean(active)).toBe(true);
      const handle = createHash("sha256")
        .update(`session:${active.sessionId}`)
        .digest("hex");
      const read = async (table) => {
        const [rows] = await observer.execute(
          `SELECT revoked_at FROM ${table} WHERE session_key = ?`,
          [handle],
        );
        return rows;
      };
      expect(await read("auth_session_registry")).toEqual([
        { revoked_at: null },
      ]);
      expect(await read("auth_session_revocations")).toHaveLength(0);
      expectLoggedOut(
        await call(api, "logout", { method: "POST", headers }),
        events,
      );
      const revocations = await read("auth_session_revocations");
      expect(revocations).toHaveLength(1);
      expect(Number(revocations[0].revoked_at)).toBeGreaterThan(0);
      expect(await read("auth_session_registry")).toEqual(revocations);
      expect((await call(api, "session", { headers })).statusCode).toBe(401);
      await api.stop();
      const cold = await fixture(databaseUrl);
      try {
        expect((await call(cold.api, "session", { headers })).statusCode).toBe(
          401,
        );
      } finally {
        await cold.api.stop();
      }
    } finally {
      await api.stop();
      await observer.end();
    }
  },
);
