import { readFileSync } from "node:fs";
import * as crypto from "node:crypto";
import { Buffer } from "node:buffer";
import { URL } from "node:url";
import ts from "typescript";
import { runInNewContext } from "node:vm";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { authorizeCrmAccess } from "@touristic/crm/authorization";

import {
  canonicalAuthRole,
  normalizeAuthSessionIdentity,
} from "@touristic/auth";
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

describe("CRM-A canonical capability and CRM boundaries", () => {
  // Auth normalization, CRM capability policy, domain boundaries and transports
  // are real. The authentication/security port explicitly supplies successful
  // session and CSRF/origin preconditions; it does not prove those mechanisms.
  // Repository, audit and provider ports are controlled infrastructure doubles.
  /** @typedef {import("@touristic/auth").AuthRole} CapabilityRole */
  /** @typedef {import("@touristic/auth").AuthSessionIdentity} CapabilitySession */
  /** @typedef {import("@touristic/crm-server").CrmTransportAuthPort} CapabilityAuthPort */
  /** @typedef {import("@touristic/crm-server").CrmHttpRequest} CapabilityRequest */
  /** @typedef {import("@touristic/crm-server").CrmHttpResponse} CapabilityResult */
  /** @typedef {ConstructorParameters<typeof Lead>[0] & ConstructorParameters<typeof LeadDetail>[0] & ConstructorParameters<typeof Meeting>[0] & ConstructorParameters<typeof Proposal>[0] & ConstructorParameters<typeof Contract>[0] & ConstructorParameters<typeof FollowUp>[0] & ConstructorParameters<typeof Trial>[0] & ConstructorParameters<typeof Referral>[0] & ConstructorParameters<typeof Metrics>[0] & ConstructorParameters<typeof AiContent>[0]} CapabilityRepository */
  /** @typedef {{repository: CapabilityRepository, calls: {method: string, args: unknown[]}[], auditEvents: unknown[], audit: {record(event: unknown): Promise<void>}}} CapabilityPorts */
  /** @typedef {(ports: CapabilityPorts, auth: CapabilityAuthPort) => {handle(request: CapabilityRequest): Promise<CapabilityResult>}} CapabilityFactory */

  /** @param {CapabilityRole} role @returns {CapabilitySession} */
  function capabilityIdentity(role) {
    const now = Math.floor(Date.now() / 1000);
    const session = normalizeAuthSessionIdentity({
      subject: `crm-${role}`,
      email: `${role.toLowerCase()}@example.com`,
      role,
      businessIds: ["crm-fixture"],
      issuedAt: now - 60,
      expiresAt: now + 3600,
      sessionId: `crm-capability-unit-${role}`,
    });
    if (!session) throw Error("NORMALIZED_AUTH_IDENTITY_REQUIRED");
    expect(session.role).toBe(role);
    return session;
  }

  /** @param {CapabilitySession} session @returns {CapabilityAuthPort} */
  function successfulSecurityPreconditions(session) {
    return {
      resolveSession: () => Promise.resolve(session),
      authorizeMutation: () => Promise.resolve({ allowed: true }),
    };
  }

  /** @param {Record<string, (...args: unknown[]) => unknown>} [allowed] @returns {CapabilityPorts} */
  function capabilityInfrastructure(allowed = {}) {
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
      repository: /** @type {CapabilityRepository} */ (
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

  function unexpectedCapabilityToken() {
    throw Error("UNEXPECTED_PRIVATE_TOKEN_CREATION");
  }

  /** @type {Record<string, CapabilityFactory>} */
  const capabilityFamilies = {
    leads: (p, a) => new LeadHttp(new Lead(p.repository, p.audit), a),
    "lead-detail": (p, a) =>
      new LeadDetailHttp(new LeadDetail(p.repository, p.audit), a),
    meetings: (p, a) => new MeetingHttp(new Meeting(p.repository, p.audit), a),
    proposals: (p, a) =>
      new ProposalHttp(
        new Proposal(p.repository, p.audit, unexpectedCapabilityToken),
        a,
      ),
    contracts: (p, a) =>
      new ContractHttp(
        new Contract(p.repository, p.audit, unexpectedCapabilityToken),
        a,
      ),
    "follow-ups": (p, a) =>
      new FollowUpHttp(new FollowUp(p.repository, p.audit), a),
    trials: (p, a) => new TrialHttp(new Trial(p.repository, p.audit), a),
    referrals: (p, a) =>
      new ReferralHttp(new Referral(p.repository, p.audit), a),
    metrics: (p, a) => new MetricsHttp(new Metrics(p.repository, p.audit), a),
  };
  const capabilityBody = {
    companyName: "Protected CRM fixture",
    leadId: 1,
    title: "Protected fixture",
    content: "Private content",
    type: "note",
  };
  const capabilityReadLeads = { method: "GET", pathname: "/api/crm/leads" };
  const capabilityWriteLead = {
    method: "POST",
    pathname: "/api/crm/leads",
    body: capabilityBody,
  };

  for (const [name, make] of Object.entries(capabilityFamilies)) {
    const pathname =
      name === "lead-detail"
        ? "/api/crm/leads/1/detail"
        : name === "metrics"
          ? "/api/crm/metrics/funnel"
          : `/api/crm/${name}`;
    for (const method of name === "metrics" ? ["GET"] : ["GET", "POST"]) {
      it(`denies AFFILIATE ${method} ${name} before business I/O`, async () => {
        const session = capabilityIdentity("AFFILIATE");
        const ports = capabilityInfrastructure();
        const result = await make(
          ports,
          successfulSecurityPreconditions(session),
        ).handle({
          method,
          pathname:
            method === "POST"
              ? pathname.replace(/\/detail$/u, "/interactions")
              : pathname,
          query: { leadId: 1 },
          body: capabilityBody,
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

  /** @type {CapabilityRole[]} */
  const capabilityReadOnlyRoles = [
    "SUPPORT",
    "AUDITOR",
    "BUSINESS_VIEWER",
    "viewer",
  ];
  for (const role of capabilityReadOnlyRoles) {
    it(`allows ${role} reads and audits readonly mutations`, async () => {
      const session = capabilityIdentity(role);
      expect(canonicalAuthRole(session.role)).toBe(
        role === "viewer" ? "BUSINESS_VIEWER" : role,
      );
      const ports = capabilityInfrastructure({
        list: () => Promise.resolve([]),
      });
      const transport = new LeadHttp(
        new Lead(ports.repository, ports.audit),
        successfulSecurityPreconditions(session),
      );
      expect(await transport.handle(capabilityReadLeads)).toEqual({
        status: 200,
        body: { data: [] },
      });
      expect(await transport.handle(capabilityWriteLead)).toMatchObject({
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

  it("allows an owner mutation after security preconditions", async () => {
    const session = capabilityIdentity("owner");
    expect(canonicalAuthRole(session.role)).toBe("BUSINESS_OWNER");
    const ports = capabilityInfrastructure({
      create: (value) =>
        Promise.resolve({
          .../** @type {Record<string, unknown>} */ (value),
          id: 1,
        }),
      initializeChecklist: () => Promise.resolve(),
      appendInteraction: () => Promise.resolve(),
    });
    const transport = new LeadHttp(
      new Lead(ports.repository, ports.audit),
      successfulSecurityPreconditions(session),
    );
    expect(await transport.handle(capabilityWriteLead)).toMatchObject({
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

  for (const role of /** @type {CapabilityRole[]} */ ([
    "AFFILIATE",
    "viewer",
  ])) {
    it(`denies ${role} AI content before repository and provider calls`, async () => {
      const session = capabilityIdentity(role);
      const ports = capabilityInfrastructure();
      let providerCalls = 0;
      const assistant = {
        generate() {
          providerCalls++;
          throw Error("UNEXPECTED_AI_PROVIDER_CALL");
        },
      };
      const boundary = new AiContent(ports.repository, assistant, ports.audit);
      const reason =
        role === "AFFILIATE" ? "capability_denied" : "read_only_role";
      expect(
        await boundary.generate(session, {
          leadId: 1,
          kind: "follow_up_message",
        }),
      ).toMatchObject({ ok: false, reason });
      expect(ports.calls).toEqual([]);
      expect(providerCalls).toBe(0);
      expect(ports.auditEvents).toEqual([
        expect.objectContaining({
          operation: "crm.ai_content.generate",
          allowed: false,
          reason,
          actorSubject: `crm-${role}`,
        }),
      ]);
    });
  }
});
