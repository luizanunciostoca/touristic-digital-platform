import { readFileSync } from "node:fs";
import * as crypto from "node:crypto";
import { Buffer } from "node:buffer";
import { URL } from "node:url";
import ts from "typescript";
import { runInNewContext } from "node:vm";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { authorizeCrmAccess } from "@touristic/crm/authorization";

import { beforeEach, afterEach } from "vitest";
import { createAuthApi as createCompositionAuthApi } from "../../../apps/morro-digital-platform/tooling/auth-api.mjs";
import { hashPassword, createSessionToken } from "../../auth/src/index.ts";
import { CrmLeadServerBoundary as Lead } from "@touristic/crm/leads-boundary";
import { CrmLeadDetailServerBoundary as LeadDetail } from "@touristic/crm/lead-detail-boundary";
import { CrmMeetingServerBoundary as Meeting } from "@touristic/crm/meetings-boundary";
import { CrmProposalServerBoundary as Proposal } from "@touristic/crm/proposals-boundary";
import { CrmContractServerBoundary as Contract } from "@touristic/crm/contracts-boundary";
import { CrmFollowUpServerBoundary as FollowUp } from "@touristic/crm/followups-boundary";
import { CrmTrialServerBoundary as Trial } from "@touristic/crm/trials-boundary";
import { CrmReferralServerBoundary as Referral } from "@touristic/crm/referrals-boundary";
import { CrmMetricsServerBoundary as Metrics } from "@touristic/crm/metrics-boundary";
import { CrmAiContentBoundary as AiContent } from "@touristic/crm/ai-content-contract";
import {
  CrmLeadHttpTransport as LeadHttp,
  CrmLeadDetailHttpTransport as LeadDetailHttp,
  CrmMeetingHttpTransport as MeetingHttp,
  CrmProposalHttpTransport as ProposalHttp,
  CrmContractHttpTransport as ContractHttp,
  CrmFollowUpHttpTransport as FollowUpHttp,
  CrmTrialHttpTransport as TrialHttp,
  CrmReferralHttpTransport as ReferralHttp,
  CrmMetricsHttpTransport as MetricsHttp,
} from "@touristic/crm-server";

const root = resolve(import.meta.dirname, "../../..");
/** @typedef {Record<string, unknown>} Exports */
/** @typedef {(name: string) => unknown} Dependency */
/** @typedef {import("@touristic/auth").AuthSessionIdentity | null} Session */
/** @typedef {{allowed: boolean, reason?: string}} MutationDecision */
/** @typedef {{method: string, headers: Record<string, string>, socket: object, [Symbol.asyncIterator](): AsyncGenerator<Buffer>}} Input */
/** @typedef {{statusCode: number | null, body?: unknown, setHeader(): void, end(body: string): void}} Response */
/** @typedef {{handle(request: Input, response: Response, url: URL): Promise<void>, start(): Promise<void>, stop(): Promise<void>}} Host */
/** @typedef {{authApi: {resolveSession(): Promise<Session>, authorizeMutation(): MutationDecision}, getEnvironmentValue(key: string): string | undefined}} HostOptions */
/** @typedef {(options: HostOptions) => Host} CreateHost */

/** @param {import("@touristic/auth").AuthRole} [role] */
function identity(role = "BUSINESS_OWNER") {
  const now = Math.floor(Date.now() / 1000);
  return {
    subject: `order-${role}`,
    email: `${role}@example.com`,
    role,
    businessIds: ["crm-fixture"],
    issuedAt: now - 60,
    expiresAt: now + 3600,
    sessionId: `order-session-${role}`,
  };
}

// Execute the actual host, canonical policy, public and private lead transports.
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
      if (name === "@touristic/crm/authorization")
        return { authorizeCrmAccess };
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
        session: identity(),
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
        session: identity("AFFILIATE"),
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
  it.each(["GET", "HEAD", "POST", "PATCH", "DELETE"])(
    "denies AFFILIATE %s before schema, body and mutation checks",
    async (method) => {
      const h = harness({
        session: identity("AFFILIATE"),
        schemaFailure: true,
      });
      expect(await h.request("/api/crm/leads", method)).toMatchObject({
        statusCode: 403,
        body: { error: "ACCESS_DENIED", reason: "capability_denied" },
      });
      expect(h.calls).toEqual([["auth"]]);
    },
  );
  it("denies an expired identity before schema or body", async () => {
    const h = harness({
      session: { ...identity(), expiresAt: 1 },
      schemaFailure: true,
    });
    expect(await h.request("/api/crm/leads", "POST")).toMatchObject({
      statusCode: 401,
      body: { error: "AUTH_REQUIRED", reason: "session_expired" },
    });
    expect(h.calls).toEqual([["auth"]]);
  });
  it.each(
    /** @type {const} */ (["SUPPORT", "AUDITOR", "BUSINESS_VIEWER", "viewer"]),
  )("retains mutation security for readonly %s with crm.read", async (role) => {
    const h = harness({
      session: identity(role),
      mutationDecision: { allowed: false, reason: "invalid_csrf" },
    });
    expect(await h.request("/api/crm/leads", "POST")).toMatchObject({
      statusCode: 403,
      body: { error: "INVALID_CSRF", reason: "invalid_csrf" },
    });
    expect(h.calls).toEqual([
      ["auth"],
      ["schema"],
      ["commerce.schema"],
      ["body"],
      ["mutation"],
    ]);
  });
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
  it.each([
    "/api/crm/public/contracts",
    "/api/crm/public/proposals/token/wrong",
    "/api/crm/public/contracts-extra/token",
  ])("does not exempt AFFILIATE on lookalike %s", async (path) => {
    const h = harness({ session: identity("AFFILIATE"), schemaFailure: true });
    expect((await h.request(path, "POST")).statusCode).toBe(403);
    expect(h.calls).toEqual([["auth"]]);
  });
  it("retains admitted private dispatch and deduplicates schema", async () => {
    const h = harness({ session: identity() });
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
      session: identity(),
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

describe("CRM-A real Auth and CRM composition", () => {
  // Real Auth API/security state, domain boundaries and transports. Only repository
  // and audit ports are in-memory infrastructure; SQL acceptance belongs to CI.
  /** @typedef {import("@touristic/auth").AuthRole} CompositionRole */
  /** @typedef {import("@touristic/auth").AuthSessionIdentity} CompositionSession */
  /** @typedef {import("@touristic/crm-server").CrmTransportAuthPort} CompositionPort */
  /** @typedef {import("@touristic/crm-server").CrmHttpRequest} CompositionRequest */
  /** @typedef {import("@touristic/crm-server").CrmHttpResponse} CompositionResult */
  /** @typedef {ConstructorParameters<typeof Lead>[0] & ConstructorParameters<typeof LeadDetail>[0] & ConstructorParameters<typeof Meeting>[0] & ConstructorParameters<typeof Proposal>[0] & ConstructorParameters<typeof Contract>[0] & ConstructorParameters<typeof FollowUp>[0] & ConstructorParameters<typeof Trial>[0] & ConstructorParameters<typeof Referral>[0] & ConstructorParameters<typeof Metrics>[0] & ConstructorParameters<typeof AiContent>[0]} CompositionRepository */
  /** @typedef {{method: string, headers: Record<string, string>, socket: {remoteAddress: string}, [Symbol.asyncIterator](): AsyncGenerator<Buffer>}} CompositionInput */
  /** @typedef {{statusCode: number, headers: Record<string, string>, body: Record<string, unknown>, setHeader(name: string, value: string): void, end(value: string): void}} CompositionOutput */
  /** @typedef {{start(): Promise<void>, stop(): Promise<void>, resolveSession(request: CompositionInput): Promise<CompositionSession|null>, authorizeMutation(request: CompositionInput, session: CompositionSession): {allowed: true}|{allowed: false, reason: "invalid_csrf"|"cross_origin_request"}, handle(request: CompositionInput, response: CompositionOutput, path: string): Promise<void>}} CompositionAuth */
  /** @typedef {{getEnvironmentValue(key: string): string|undefined, audit(request: unknown, event: unknown): void}} CompositionAuthOptions */
  /** @typedef {{repository: CompositionRepository, calls: {method: string, args: unknown[]}[], auditEvents: unknown[], audit: {record(event: unknown): Promise<void>}}} CompositionPorts */
  /** @typedef {(ports: CompositionPorts, auth: CompositionPort) => {handle(request: CompositionRequest): Promise<CompositionResult>}} CompositionFactory */

  const origin = "http://crm-composition.test";
  const secret = "crm-composition-fixture-secret-000000000000";
  const password = "composition fixture password";
  const passwordHash = hashPassword(password, Buffer.alloc(16, 9));
  /** @type {CompositionRole[]} */
  const readOnlyRoles = ["SUPPORT", "AUDITOR", "BUSINESS_VIEWER", "viewer"];
  const users = ["owner", "AFFILIATE", ...readOnlyRoles].map((role) => ({
    id: `crm-${role}`,
    email: `${role.toLowerCase()}@example.com`,
    role,
    businessIds: ["crm-fixture"],
    passwordHash,
  }));
  /** @type {CompositionAuth} */
  let auth;
  /** @type {unknown[]} */
  let authAudit;

  /** @param {string} method @param {unknown} [body] @param {Record<string, string>} [headers] @returns {CompositionInput} */
  function input(method, body = {}, headers = {}) {
    return {
      method,
      headers: { host: "crm-composition.test", origin, ...headers },
      socket: { remoteAddress: "127.0.0.1" },
      async *[Symbol.asyncIterator]() {
        yield await Promise.resolve(Buffer.from(JSON.stringify(body)));
      },
    };
  }
  /** @returns {CompositionOutput} */
  function output() {
    return {
      statusCode: 0,
      headers: {},
      body: {},
      setHeader(name, value) {
        this.headers[name.toLowerCase()] = value;
      },
      end(value) {
        const parsed = /** @type {unknown} */ (JSON.parse(value));
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
          throw Error("AUTH_RESPONSE_OBJECT_REQUIRED");
        this.body = /** @type {Record<string, unknown>} */ (parsed);
      },
    };
  }
  beforeEach(async () => {
    authAudit = [];
    /** @type {Record<string, string>} */
    const environment = {
      NODE_ENV: "test",
      DASHBOARD_AUTH_ORIGIN: origin,
      DASHBOARD_AUTH_SECRET: secret,
      DASHBOARD_USERS_JSON: JSON.stringify(users),
    };
    const create =
      /** @type {(options: CompositionAuthOptions) => CompositionAuth} */ (
        createCompositionAuthApi
      );
    auth = create({
      getEnvironmentValue: (key) => environment[key],
      audit: (_request, event) => {
        authAudit.push(event);
      },
    });
    await auth.start();
  });
  afterEach(async () => {
    await auth.stop();
  });

  /** @param {CompositionRole} role @returns {Promise<Record<string, string>>} */
  async function login(role) {
    const response = output();
    await auth.handle(
      input("POST", { email: `${role.toLowerCase()}@example.com`, password }),
      response,
      "/api/dashboard/auth/login",
    );
    expect(response.statusCode).toBe(200);
    expect(typeof response.body.csrfToken).toBe("string");
    const cookie = response.headers["set-cookie"]?.split(";")[0] ?? "";
    expect(cookie.startsWith("md_dashboard_session=")).toBe(true);
    const headers = {
      cookie,
      "x-csrf-token": String(response.body.csrfToken),
    };
    const active = await auth.resolveSession(input("POST", {}, headers));
    expect(active?.role).toBe(role);
    if (!active) throw Error("REAL_AUTH_SESSION_REQUIRED");
    expect(auth.authorizeMutation(input("POST", {}, headers), active)).toEqual({
      allowed: true,
    });
    return headers;
  }
  /** @param {Record<string, string>} headers @returns {CompositionPort} */
  function authPort(headers) {
    return {
      resolveSession: (request) =>
        auth.resolveSession(input(request.method, request.body, headers)),
      authorizeMutation: (request, session) =>
        Promise.resolve(
          auth.authorizeMutation(
            input(request.method, request.body, headers),
            session,
          ),
        ),
    };
  }
  /** @param {Record<string, (...args: unknown[]) => unknown>} [allowed] @returns {CompositionPorts} */
  function infrastructure(allowed = {}) {
    /** @type {{method: string, args: unknown[]}[]} */
    const calls = [];
    /** @type {unknown[]} */
    const auditEvents = [];
    const repository = new Proxy(allowed, {
      get(target, key) {
        /** @param {...unknown} args */
        const invoke = (...args) => {
          const method = String(key);
          calls.push({ method, args });
          const operation = Object.hasOwn(target, method)
            ? target[method]
            : undefined;
          if (!operation) throw Error(`UNEXPECTED_BUSINESS_IO:${method}`);
          return operation(...args);
        };
        return invoke;
      },
    });
    return {
      repository: /** @type {CompositionRepository} */ (
        /** @type {unknown} */ (repository)
      ),
      calls,
      auditEvents,
      audit: {
        record(event) {
          auditEvents.push(event);
          return Promise.resolve();
        },
      },
    };
  }
  function unexpectedToken() {
    throw Error("UNEXPECTED_PRIVATE_TOKEN_CREATION");
  }
  /** @type {Record<string, CompositionFactory>} */
  const families = {
    leads: (p, a) => new LeadHttp(new Lead(p.repository, p.audit), a),
    "lead-detail": (p, a) =>
      new LeadDetailHttp(new LeadDetail(p.repository, p.audit), a),
    meetings: (p, a) => new MeetingHttp(new Meeting(p.repository, p.audit), a),
    proposals: (p, a) =>
      new ProposalHttp(new Proposal(p.repository, p.audit, unexpectedToken), a),
    contracts: (p, a) =>
      new ContractHttp(new Contract(p.repository, p.audit, unexpectedToken), a),
    "follow-ups": (p, a) =>
      new FollowUpHttp(new FollowUp(p.repository, p.audit), a),
    trials: (p, a) => new TrialHttp(new Trial(p.repository, p.audit), a),
    referrals: (p, a) =>
      new ReferralHttp(new Referral(p.repository, p.audit), a),
    metrics: (p, a) => new MetricsHttp(new Metrics(p.repository, p.audit), a),
  };
  const body = {
    companyName: "Protected CRM fixture",
    leadId: 1,
    title: "Protected fixture",
    content: "Private content",
    type: "note",
  };
  const readLeads = { method: "GET", pathname: "/api/crm/leads" };
  const writeLead = { method: "POST", pathname: "/api/crm/leads", body };
  for (const [name, make] of Object.entries(families)) {
    const pathname =
      name === "lead-detail"
        ? "/api/crm/leads/1/detail"
        : name === "metrics"
          ? "/api/crm/metrics/funnel"
          : `/api/crm/${name}`;
    for (const method of name === "metrics" ? ["GET"] : ["GET", "POST"]) {
      it(`denies AFFILIATE ${method} ${name} before business I/O`, async () => {
        const headers = await login("AFFILIATE");
        const ports = infrastructure();
        const result = await make(ports, authPort(headers)).handle({
          method,
          pathname:
            method === "POST"
              ? pathname.replace(/\/detail$/u, "/interactions")
              : pathname,
          query: { leadId: 1 },
          body,
        });
        expect(result).toMatchObject({
          status: 403,
          body: { reason: "capability_denied" },
        });
        expect(ports.calls).toEqual([]);
        expect(ports.auditEvents).toEqual([
          expect.objectContaining({
            allowed: false,
            reason: "capability_denied",
            actorSubject: "crm-AFFILIATE",
          }),
        ]);
      });
    }
  }
  /** @param {CompositionPorts} ports @param {Record<string, string>} headers */
  function leads(ports, headers) {
    return new LeadHttp(
      new Lead(ports.repository, ports.audit),
      authPort(headers),
    );
  }
  for (const role of readOnlyRoles) {
    it(`allows ${role} reads and audits readonly mutations`, async () => {
      const headers = await login(role);
      const ports = infrastructure({ list: () => Promise.resolve([]) });
      const transport = leads(ports, headers);
      expect(await transport.handle(readLeads)).toEqual({
        status: 200,
        body: { data: [] },
      });
      expect(await transport.handle(writeLead)).toMatchObject({
        status: 403,
        body: { error: "READ_ONLY_ROLE", reason: "read_only_role" },
      });
      expect(ports.calls.map((call) => call.method)).toEqual(["list"]);
      expect(ports.auditEvents).toEqual([
        expect.objectContaining({
          operation: "lead.create",
          allowed: false,
          reason: "read_only_role",
          actorSubject: `crm-${role}`,
        }),
      ]);
    });
  }
  it("allows an owner mutation with real session and CSRF", async () => {
    const headers = await login("owner");
    const ports = infrastructure({
      create: (value) =>
        Promise.resolve({
          .../** @type {Record<string, unknown>} */ (value),
          id: 1,
        }),
      initializeChecklist: () => Promise.resolve(),
      appendInteraction: () => Promise.resolve(),
    });
    expect(await leads(ports, headers).handle(writeLead)).toMatchObject({
      status: 200,
      body: { data: { id: 1, assignedToSubject: "crm-owner" } },
    });
    expect(ports.calls.map((call) => call.method)).toEqual([
      "create",
      "initializeChecklist",
      "appendInteraction",
    ]);
    expect(ports.auditEvents).toEqual([]);
  });
  /** @type {[CompositionRole, string, Record<string, string>, string][]} */
  const securityCases = [
    ["owner", "invalid CSRF", { "x-csrf-token": "invalid" }, "INVALID_CSRF"],
    [
      "owner",
      "foreign origin",
      { origin: "https://other.example" },
      "ORIGIN_DENIED",
    ],
    ["viewer", "invalid CSRF", { "x-csrf-token": "invalid" }, "INVALID_CSRF"],
    [
      "viewer",
      "foreign origin",
      { origin: "https://other.example" },
      "ORIGIN_DENIED",
    ],
  ];
  for (const [role, label, override, error] of securityCases) {
    it(`rejects ${role} mutation with ${label} before the boundary`, async () => {
      const ports = infrastructure();
      const headers = { ...(await login(role)), ...override };
      expect(await leads(ports, headers).handle(writeLead)).toMatchObject({
        status: 403,
        body: { error },
      });
      expect(ports.calls).toEqual([]);
      expect(ports.auditEvents).toEqual([]);
      expect(authAudit).toContainEqual(
        expect.objectContaining({ result: "denied" }),
      );
    });
  }
  for (const mode of ["missing", "malformed", "expired"]) {
    it(`rejects a ${mode} cookie before CRM business I/O`, async () => {
      const token = createSessionToken(
        {
          subject: "crm-owner",
          email: "owner@example.com",
          role: "owner",
          businessIds: ["crm-fixture"],
        },
        secret,
        {
          nowEpochSeconds: Math.floor(Date.now() / 1000) - 600,
          ttlSeconds: 300,
        },
      );
      expect(token).not.toBeNull();
      const cookie =
        mode === "missing"
          ? ""
          : `md_dashboard_session=${mode === "expired" ? token : "malformed"}`;
      const ports = infrastructure();
      expect(await leads(ports, { cookie }).handle(readLeads)).toMatchObject({
        status: 401,
        body: { reason: "authentication_required" },
      });
      expect(ports.calls).toEqual([]);
    });
  }
  it("rejects a previously valid CRM cookie after real logout", async () => {
    const headers = await login("owner");
    const ports = infrastructure({ list: () => Promise.resolve([]) });
    const transport = leads(ports, headers);
    expect((await transport.handle(readLeads)).status).toBe(200);
    const response = output();
    await auth.handle(
      input("POST", {}, headers),
      response,
      "/api/dashboard/auth/logout",
    );
    expect(response.statusCode).toBe(200);
    expect(await transport.handle(readLeads)).toMatchObject({ status: 401 });
    expect(ports.calls.map((call) => call.method)).toEqual(["list"]);
  });
  for (const role of /** @type {CompositionRole[]} */ ([
    "AFFILIATE",
    "viewer",
  ])) {
    it(`denies ${role} AI content before repository and provider calls`, async () => {
      const headers = await login(role);
      const ports = infrastructure();
      let providerCalls = 0;
      const assistant = {
        generate() {
          providerCalls++;
          throw Error("UNEXPECTED_AI_PROVIDER_CALL");
        },
      };
      const boundary = new AiContent(ports.repository, assistant, ports.audit);
      expect(
        await boundary.generate(
          await auth.resolveSession(input("GET", {}, headers)),
          { leadId: 1, kind: "follow_up_message" },
        ),
      ).toMatchObject({
        ok: false,
        reason: role === "AFFILIATE" ? "capability_denied" : "read_only_role",
      });
      expect(ports.calls).toEqual([]);
      expect(providerCalls).toBe(0);
      expect(ports.auditEvents).toHaveLength(1);
    });
  }
});
