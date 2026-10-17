import { readFileSync } from "node:fs";
import * as crypto from "node:crypto";
import { Buffer } from "node:buffer";
import { URL } from "node:url";
import ts from "typescript";
import { runInNewContext } from "node:vm";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../..");
/** @typedef {Record<string, unknown>} Exports */
/** @typedef {(name: string) => unknown} Dependency */
/** @typedef {{subject: string} | null} Session */
/** @typedef {{allowed: boolean, reason?: string}} MutationDecision */
/** @typedef {{method: string, headers: Record<string, string>, socket: object, [Symbol.asyncIterator](): AsyncGenerator<Buffer>}} Input */
/** @typedef {{statusCode: number | null, body?: unknown, setHeader(): void, end(body: string): void}} Response */
/** @typedef {{handle(request: Input, response: Response, url: URL): Promise<void>, start(): Promise<void>, stop(): Promise<void>}} Host */
/** @typedef {{authApi: {resolveSession(): Promise<Session>, authorizeMutation(): MutationDecision}, getEnvironmentValue(key: string): string | undefined}} HostOptions */
/** @typedef {(options: HostOptions) => Host} CreateHost */

// Execute the actual host, public transports and private lead transport.
// Infrastructure and boundaries are explicit doubles, not MySQL acceptance.
/** @param {{session?: Session, schemaFailure?: boolean, configured?: boolean, mutationDecision?: MutationDecision}} [options] */
function harness({
  session = null,
  schemaFailure = false,
  configured = true,
  mutationDecision = { allowed: true },
} = {}) {
  /** @type {string[][]} */
  const calls = [];
  class Empty {}
  class PublicBoundary {
    /** @param {string} token */
    view(token) {
      calls.push(["public.view", token]);
      return Promise.resolve({ ok: false, reason: "not_found" });
    }
    sign() {
      calls.push(["public.sign"]);
      return Promise.resolve({ ok: false, reason: "invalid_token" });
    }
    respond() {
      calls.push(["public.respond"]);
      return Promise.resolve({ ok: false, reason: "expired" });
    }
  }
  class PrivateTransport {
    matches() {
      return false;
    }
    handle() {
      calls.push(["private.handle"]);
      return Promise.resolve({ status: 200, body: { synthetic: true } });
    }
  }
  class LeadBoundary {
    list() {
      calls.push(["private.handle"]);
      return Promise.resolve({ ok: true, value: { synthetic: true } });
    }
    create() {
      calls.push(["private.create"]);
      return Promise.resolve({ ok: true, value: { synthetic: true } });
    }
  }
  /** @param {string} file @returns {Exports} */
  function load(file) {
    /** @type {{exports: Exports}} */
    const module = { exports: {} };
    const code = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: {
        allowJs: true,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    /** @type {Dependency} */
    function dependency(name) {
      if (name === "node:crypto") return crypto;
      if (name === "./database-schema-mode.mjs")
        return { shouldApplyRuntimeSchema: () => true };
      if (name === "@touristic/crm/leads-boundary")
        return { CrmLeadServerBoundary: LeadBoundary };
      if (name.startsWith("@touristic/crm/"))
        return new Proxy({}, { get: () => PublicBoundary });
      if (name === "@touristic/crm-server")
        return new Proxy(
          {},
          {
            get(_target, key) {
              if (key === "createCrmMySqlPoolFromEnvironment")
                return () => ({
                  end() {
                    calls.push(["pool.end"]);
                    return Promise.resolve();
                  },
                });
              if (key === "createCrmTrialSchedulerHost")
                return () => ({
                  start() {
                    calls.push(["scheduler.start"]);
                  },
                  stop() {
                    return Promise.resolve();
                  },
                });
              if (key === "applyCrmM99Schema")
                return () => {
                  calls.push(["schema"]);
                  if (schemaFailure)
                    return Promise.reject(Error("SCHEMA_FAILURE"));
                  return Promise.resolve();
                };
              if (key === "applyCrmCommerceSchema")
                return () => Promise.resolve(calls.push(["commerce.schema"]));
              if (key === "CrmLeadHttpTransport")
                return load(
                  resolve(root, "services/crm/src/leads-http-transport.ts"),
                )[key];
              if (key === "CrmContractPublicHttpTransport")
                return load(
                  resolve(
                    root,
                    "services/crm/src/contracts-public-http-transport.ts",
                  ),
                )[key];
              if (key === "CrmProposalPublicHttpTransport")
                return load(
                  resolve(
                    root,
                    "services/crm/src/proposals-public-http-transport.ts",
                  ),
                )[key];
              return String(key).endsWith("HttpTransport")
                ? PrivateTransport
                : Empty;
            },
          },
        );
      if (name.startsWith("."))
        return load(resolve(dirname(file), name.replace(/\.js$/, ".ts")));
      throw Error(`UNSUPPORTED_IMPORT:${name}`);
    }
    runInNewContext(code, {
      require: dependency,
      module,
      exports: module.exports,
      Buffer,
      URL,
    });
    return module.exports;
  }
  const { createCrmApi } = load(
    resolve(root, "apps/morro-digital-platform/tooling/crm-api.mjs"),
  );
  if (typeof createCrmApi !== "function") throw Error("HOST_EXPORT_INVALID");
  const createHost = /** @type {CreateHost} */ (createCrmApi);
  const api = createHost({
    authApi: {
      resolveSession() {
        calls.push(["auth"]);
        return Promise.resolve(session);
      },
      authorizeMutation() {
        calls.push(["mutation"]);
        return mutationDecision;
      },
    },
    getEnvironmentValue: (key) =>
      configured && key === "CRM_DATABASE_URL"
        ? "mysql://synthetic.invalid/db"
        : undefined,
  });
  /** @param {string} path @param {string} [method] */
  async function request(path, method = "GET") {
    /** @type {Response} */
    const response = {
      statusCode: null,
      setHeader() {},
      end(body) {
        this.body = /** @type {unknown} */ (JSON.parse(body));
      },
    };
    const input = {
      method,
      headers: {},
      socket: {},
      async *[Symbol.asyncIterator]() {
        calls.push(["body"]);
        yield await Promise.resolve(Buffer.from("{}"));
      },
    };
    await api.handle(input, response, new URL(`http://localhost${path}`));
    return response;
  }
  return { api, calls, request };
}

describe("CRM configured host private admission before request effects", () => {
  it.each([
    ["invalid_csrf", "INVALID_CSRF"],
    ["cross_origin_request", "ORIGIN_DENIED"],
  ])(
    "retains real private transport denial %s before boundary effects",
    async (reason, error) => {
      const h = harness({
        session: { subject: "synthetic" },
        mutationDecision: { allowed: false, reason },
      });
      expect(await h.request("/api/crm/leads", "POST")).toMatchObject({
        statusCode: 403,
        body: { error, reason },
      });
      expect(h.calls).toEqual([
        ["auth"],
        ["schema"],
        ["commerce.schema"],
        ["body"],
        ["mutation"],
      ]);
    },
  );
  it.each([
    ["contracts", "sign", 400],
    ["proposals", "respond", 409],
  ])(
    "keeps public %s token authority despite denied session mutation",
    async (family, action, status) => {
      const h = harness({
        session: { subject: "synthetic" },
        mutationDecision: { allowed: false, reason: "invalid_csrf" },
      });
      expect(
        (await h.request(`/api/crm/public/${family}/token/${action}`, "POST"))
          .statusCode,
      ).toBe(status);
      expect(h.calls).toContainEqual([`public.${action}`]);
      expect(h.calls.some(([name]) => name.startsWith("private."))).toBe(false);
    },
  );
  it.each([
    "contracts",
    "follow-ups",
    "leads",
    "meetings",
    "metrics",
    "proposals",
    "referrals",
    "trials",
  ])("denies unauthenticated %s before failing schema", async (family) => {
    const h = harness({ schemaFailure: true });
    expect(await h.request(`/api/crm/${family}`)).toMatchObject({
      statusCode: 401,
      body: { error: "AUTH_REQUIRED", reason: "authentication_required" },
    });
    expect(h.calls).toEqual([["auth"]]);
  });
  it.each(["POST", "HEAD"])(
    "denies %s before body/mutation/schema",
    async (method) => {
      const h = harness({ schemaFailure: true });
      expect((await h.request("/api/crm/leads", method)).statusCode).toBe(401);
      expect(h.calls).toEqual([["auth"]]);
    },
  );
  it.each(["contracts", "proposals"])(
    "preserves public %s token GET without session",
    async (family) => {
      const h = harness();
      expect(
        (await h.request(`/api/crm/public/${family}/token`)).statusCode,
      ).toBe(404);
      expect(h.calls).toEqual([
        ["auth"],
        ["schema"],
        ["commerce.schema"],
        ["public.view", "token"],
      ]);
    },
  );
  it.each([
    ["contracts", "sign", 400],
    ["proposals", "respond", 409],
  ])("preserves public %s action", async (family, action, status) => {
    const h = harness();
    expect(
      (await h.request(`/api/crm/public/${family}/token/${action}`, "POST"))
        .statusCode,
    ).toBe(status);
    expect(h.calls.some(([name]) => name === `public.${action}`)).toBe(true);
  });
  it.each([
    "/api/crm/public/contracts",
    "/api/crm/public/proposals/token/wrong",
    "/api/crm/public/contracts-extra/token",
  ])("does not exempt lookalike %s", async (path) => {
    const h = harness({ schemaFailure: true });
    expect((await h.request(path)).statusCode).toBe(401);
    expect(h.calls).toEqual([["auth"]]);
  });
  it("retains admitted private dispatch and deduplicates schema", async () => {
    const h = harness({ session: { subject: "synthetic" } });
    await Promise.all([
      h.request("/api/crm/leads"),
      h.request("/api/crm/leads"),
    ]);
    expect(h.calls.filter(([name]) => name === "auth")).toHaveLength(2);
    expect(h.calls.filter(([name]) => name === "schema")).toHaveLength(1);
    expect(h.calls.filter(([name]) => name === "private.handle")).toHaveLength(
      2,
    );
  });
  it("propagates admitted schema failure", async () => {
    const h = harness({
      session: { subject: "synthetic" },
      schemaFailure: true,
    });
    await expect(h.request("/api/crm/leads")).rejects.toThrow("SCHEMA_FAILURE");
    expect(h.calls).toEqual([["auth"], ["schema"]]);
  });
  it("preserves explicit startup schema/scheduler lifecycle", async () => {
    const h = harness();
    await h.api.start();
    await h.api.start();
    await h.api.stop();
    expect(h.calls).toEqual([
      ["schema"],
      ["commerce.schema"],
      ["scheduler.start"],
      ["pool.end"],
    ]);
  });
  it("preserves missing-database unavailable 503", async () => {
    const h = harness({ configured: false });
    expect((await h.request("/api/crm/leads")).statusCode).toBe(503);
    expect(h.calls).toEqual([]);
  });
});
