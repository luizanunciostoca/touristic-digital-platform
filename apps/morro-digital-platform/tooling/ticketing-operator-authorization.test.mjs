// Online check-in authorization with real Auth and Ticketing implementations.
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { afterEach, expect, it, vi } from "vitest";
import { canonicalAuthRoles } from "@touristic/auth";
import * as authServer from "@touristic/auth-server";
import {
  createTicket,
  createTicketCode,
  createTicketQrPayload,
  normalizeTicketSigningSecret,
} from "@touristic/ticketing";
import { createAuthApi } from "./auth-api.mjs";
import {
  createTicketingApi,
  createTicketingAuthorizationPort,
  createTicketingOwnershipPorts,
} from "./ticketing-api.mjs";

// Use the production Node exports built by the workspace dependency graph.
// This keeps Ticketing subpath exports independent of the app's source aliases.
const ticketingServer = createRequire(import.meta.url)(
  "@touristic/ticketing-server",
);

const origin = "http://localhost";
const prefix = "/api/ticketing/v1";
const checkInPath = `${prefix}/operator/check-in`;
const authPrefix = "/api/dashboard/auth";
const password = "D02 isolated operator fixture";
const passwordHash = authServer.hashPassword(password, Buffer.alloc(16, 32));
const authSecret = "d02-auth-fixture-secret-00000000000000000000";
const signingSecret = normalizeTicketSigningSecret(
  "d02-ticket-signing-fixture-secret-000000000000",
);
const clock = { now: () => "2026-11-02T12:00:00.000Z" };
const allowedRoles = [
  "PLATFORM_OWNER",
  "PLATFORM_ADMIN",
  "admin",
  "BUSINESS_OWNER",
  "owner",
  "BUSINESS_MANAGER",
  "manager",
];
const deniedRoles = [
  "AFFILIATE",
  "SUPPORT",
  "AUDITOR",
  "BUSINESS_VIEWER",
  "viewer",
];
const roles = [...canonicalAuthRoles, "admin", "owner", "manager", "viewer"];
const users = roles.map((role) => ({
  id: `d02-${role.toLowerCase()}`,
  email: `d02-${role.toLowerCase()}@example.invalid`,
  role,
  businessIds: ["tenant-a"],
  passwordHash,
}));

function request(path, { method = "POST", headers = {}, body, rawBody } = {}) {
  const observed = { bodyReads: 0 };
  return {
    url: path,
    pathname: path,
    method,
    observed,
    headers: {
      host: "localhost",
      origin,
      "content-type": "application/json",
      ...headers,
    },
    socket: { remoteAddress: `d02-fixture-${randomUUID()}` },
    async *[Symbol.asyncIterator]() {
      observed.bodyReads += 1;
      const bytes =
        rawBody ?? (body === undefined ? "{}" : JSON.stringify(body));
      yield Buffer.from(bytes);
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

async function authCall(api, route, options = {}) {
  const response = recorder();
  const path = `${authPrefix}/${route}`;
  await api.handle(request(path, options), response, path);
  return { ...response, data: JSON.parse(response.body || "{}") };
}

async function login(api, role) {
  const response = await authCall(api, "login", {
    body: { email: `d02-${role.toLowerCase()}@example.invalid`, password },
  });
  expect(response.statusCode).toBe(200);
  expect(response.data.authenticated).toBe(true);
  expect(response.data.user).toMatchObject({
    id: `d02-${role.toLowerCase()}`,
    role,
    canonicalRole:
      {
        admin: "PLATFORM_ADMIN",
        owner: "BUSINESS_OWNER",
        manager: "BUSINESS_MANAGER",
        viewer: "BUSINESS_VIEWER",
      }[role] ?? role,
  });
  expect(response.data.user.capabilities.includes("ticketing.manage")).toBe(
    allowedRoles.includes(role),
  );
  return {
    cookie: String(response.headers.get("set-cookie")).split(";", 1)[0],
    "x-csrf-token": response.data.csrfToken,
  };
}

async function authFixture(businessIds = ["tenant-a"]) {
  // Real state implementation; retain its handle to model a current policy
  // update independently of the role embedded in an already issued cookie.
  const state = authServer.createInMemoryAuthSecurityState();
  const factory = vi
    .spyOn(authServer, "createInMemoryAuthSecurityState")
    .mockReturnValueOnce(state);
  const environment = {
    DASHBOARD_AUTH_SECRET: authSecret,
    DASHBOARD_USERS_JSON: JSON.stringify(
      users.map((user) => ({ ...user, businessIds })),
    ),
    DASHBOARD_AUTH_ORIGIN: origin,
    NODE_ENV: "development",
  };
  const audit = [];
  let api;
  try {
    api = createAuthApi({
      getEnvironmentValue: (key) => environment[key] || "",
      audit: (_request, event) => audit.push(event),
    });
  } finally {
    factory.mockRestore();
  }
  await api.start();
  expect(api.readinessCheck()).toMatchObject({
    status: "pass",
    detail: "process-local-development",
  });
  return { api, state, audit };
}

function ticketFixture() {
  const suffix = randomUUID().replaceAll("-", "");
  const ticket = createTicket({
    id: `tck_d02_${suffix}`,
    orderId: `ord_d02_${suffix}`,
    paymentId: `pay_d02_${suffix}`,
    destinationId: "morro-de-sao-paulo",
    product: { kind: "tour", reference: "d02-fixture" },
    holderName: "Operador de Teste",
    quantity: 1,
    amount: { minorUnits: 9900, currency: "BRL" },
    code: createTicketCode(
      createHash("sha256").update(suffix).digest("hex").toUpperCase(),
    ),
    status: "issued",
    issuedAt: "2026-11-02T10:00:00.000Z",
    validUntil: "2026-11-03T02:00:00.000Z",
    updatedAt: "2026-11-02T10:00:00.000Z",
  });
  expect(ticket).not.toBeNull();
  return ticket;
}

function memoryStorage(ticket) {
  const tickets = new Map([[ticket.id, ticket]]);
  const checkIns = [];
  const operations = [];
  return {
    operations,
    tickets: {
      async findById(id) {
        operations.push("tickets.findById");
        return tickets.get(id) ?? null;
      },
      async findByCode(code) {
        operations.push("tickets.findByCode");
        return [...tickets.values()].find((t) => t.code === code) ?? null;
      },
      async save(value) {
        operations.push("tickets.save");
        tickets.set(value.id, value);
        return value;
      },
    },
    checkIns: {
      async listByTicketId(id) {
        operations.push("checkIns.listByTicketId");
        return checkIns.filter((x) => x.ticketId === id);
      },
    },
    transactions: {
      async commitCheckIn({ before, after, checkIn }) {
        operations.push("transactions.commitCheckIn");
        const replay = checkIns.find((x) => x.id === checkIn.id);
        if (replay)
          return {
            ticket: tickets.get(before.id),
            checkIn: replay,
            replayed: true,
          };
        tickets.set(after.id, after);
        checkIns.push(checkIn);
        return { ticket: after, checkIn, replayed: false };
      },
    },
    snapshot: () => ({
      tickets: [...tickets.values()],
      checkIns: [...checkIns],
    }),
  };
}

function ownershipFixture(ticket) {
  const state = {
    businessId: "tenant-a",
    destination: { id: ticket.destinationId, status: "active" },
    ownerAvailable: true,
    bindingPresent: true,
  };
  const reservation = {
    id: "trv_d02_fixture",
    inventoryId: "tin_d02_fixture",
    orderId: ticket.orderId,
    paymentId: ticket.paymentId,
    destinationId: ticket.destinationId,
    product: ticket.product,
    quantity: ticket.quantity,
    unitAmount: ticket.amount,
    pricingVersion: "d02-v1",
    status: "confirmed",
  };
  const operatorAuthorization =
    ticketingServer.createTicketingOperatorAuthorization({
      bindings: {
        findByOrderId: async (id) =>
          id === ticket.orderId && state.bindingPresent
            ? {
                orderId: id,
                reservationReference: reservation.id,
                productReference: `${ticket.product.kind}:${ticket.product.reference}`,
                quantity: ticket.quantity,
                amount: ticket.amount,
                pricingVersion: reservation.pricingVersion,
              }
            : null,
      },
      reservations: {
        findReservationById: async (id) =>
          id === reservation.id ? reservation : null,
        findInventoryById: async (id) =>
          id === reservation.inventoryId
            ? {
                id,
                destinationId: ticket.destinationId,
                product: ticket.product,
              }
            : null,
      },
      businessInventory: {
        findOwnershipByInventoryId: async (inventoryId) => ({
          inventoryId,
          businessId: state.businessId,
        }),
        findAdmissionProfileByInventoryId: async () => null,
        findCatalogBindingByInventoryId: async () => null,
      },
      ...createTicketingOwnershipPorts({
        getPlacePlatformRuntime: () =>
          state.ownerAvailable
            ? {
                findTicketingBusinessOwner: async (
                  businessId,
                  destinationId,
                ) => ({ businessId, destinationId }),
              }
            : null,
        getDestinationService: () => ({
          read: async () =>
            state.destination
              ? { status: "found", data: state.destination }
              : { status: "not_found" },
        }),
      }),
    });
  return { state, operatorAuthorization };
}

function compose(authApi, storage, { enabled = true, ticket } = {}) {
  const unexpected = async () => {
    throw new Error("D02_UNEXPECTED_DOMAIN_OPERATION");
  };
  const ownership = ownershipFixture(ticket);
  const ticketing = ticketingServer.createTicketingApplicationService({
    orders: { findById: unexpected },
    payments: { findById: unexpected },
    tickets: storage.tickets,
    checkIns: storage.checkIns,
    transactions: storage.transactions,
    operatorAuthorization: ownership.operatorAuthorization,
    offline: { findById: unexpected },
    signingSecret,
    clock,
  });
  const dependencies = {
    enabled,
    authorization: createTicketingAuthorizationPort({ authApi }),
    ticketing,
    tickets: storage.tickets,
    reservations: { findInventoryById: async () => null },
    reads: { listInventory: async () => [] },
    holders: {},
    reservationOrders: {},
    checkoutHandoffs: {},
    offlineDevices: { sync: unexpected },
    offlineDeviceRegistry: {},
    audit: { record: async () => undefined },
    qrSigningSecret: signingSecret,
    offlineProvisioningSecret: "d02-device-provisioning-secret-000000000000",
    clock,
    businessInventory: {},
    destinationId: "morro-de-sao-paulo",
  };
  const transport = new ticketingServer.TicketingCommerceHttpTransport(
    dependencies,
  );
  const handle = vi.fn(transport.handle.bind(transport));
  const api = createTicketingApi({
    authApi,
    publicTransport: { handle },
    audit: () => undefined,
  });
  return { api, transport, handle, ownership: ownership.state };
}

async function fixture({ businessId = "tenant-a", businessIds } = {}) {
  const auth = await authFixture(businessIds);
  const ticket = ticketFixture();
  const storage = memoryStorage(ticket);
  const composed = compose(auth.api, storage, { ticket });
  composed.ownership.businessId = businessId;
  return {
    auth,
    ticket,
    storage,
    ...composed,
    async close() {
      await composed.api.stop();
      await auth.api.stop();
    },
  };
}

async function hostCall(api, req) {
  const response = recorder();
  await api.handle(req, response, new URL(req.url, origin));
  return { ...response, data: JSON.parse(response.body || "{}") };
}

function checkIn(f, headers, body = {}) {
  return hostCall(
    f.api,
    request(checkInPath, {
      headers,
      body: {
        qrPayload: createTicketQrPayload(f.ticket.id, signingSecret),
        ...body,
      },
    }),
  );
}

async function expectHostDenied(
  f,
  headers,
  status = 403,
  error = "ADMIN_REQUIRED",
) {
  const before = f.storage.snapshot();
  const operations = f.storage.operations.length;
  const calls = f.handle.mock.calls.length;
  const req = request(checkInPath, { headers, rawBody: "{" });
  const result = await hostCall(f.api, req);
  expect(result.statusCode).toBe(status);
  expect(result.data.error).toBe(error);
  expect(req.observed.bodyReads).toBe(0);
  expect(f.handle.mock.calls.length).toBe(calls);
  expect(f.storage.operations.length).toBe(operations);
  expect(f.storage.snapshot()).toEqual(before);
}

async function expectTransportDenied(
  f,
  headers,
  status = 403,
  error = "ADMIN_REQUIRED",
) {
  const before = f.storage.snapshot();
  const operations = f.storage.operations.length;
  let bodyReads = 0;
  const result = await f.transport.handle({
    method: "POST",
    pathname: checkInPath,
    headers: { host: "localhost", origin, ...headers },
    get body() {
      bodyReads += 1;
      throw new Error("D02_PRIVATE_BODY_READ");
    },
  });
  expect(result.status).toBe(status);
  expect(result.body.error).toBe(error);
  expect(bodyReads).toBe(0);
  expect(f.storage.operations.length).toBe(operations);
  expect(f.storage.snapshot()).toEqual(before);
}

afterEach(() => vi.restoreAllMocks());

it.each(allowedRoles)(
  "D02 real composition %s can check in a valid QR",
  async (role) => {
    const f = await fixture();
    try {
      const headers = await login(f.auth.api, role);
      const result = await hostCall(
        f.api,
        request(checkInPath, {
          headers,
          body: {
            qrPayload: createTicketQrPayload(f.ticket.id, signingSecret),
          },
        }),
      );
      expect(result.statusCode).toBe(200);
      expect(result.data.data).toMatchObject({
        ticket: { id: f.ticket.id, status: "validated" },
        checkIn: {
          ticketId: f.ticket.id,
          operatorReference: `d02-${role.toLowerCase()}`,
        },
        replayed: false,
      });
      expect(f.storage.snapshot().checkIns).toHaveLength(1);
      expect(f.handle).toHaveBeenCalledTimes(1);
      expect(
        f.storage.operations.filter((x) => x === "transactions.commitCheckIn"),
      ).toHaveLength(1);
    } finally {
      await f.close();
    }
  },
);

it.each(deniedRoles)("D02 %s is denied before the host body", async (role) => {
  const f = await fixture();
  try {
    await expectHostDenied(f, await login(f.auth.api, role));
  } finally {
    await f.close();
  }
});

it.each(deniedRoles)(
  "D02 %s is denied before transport body and Ticketing effects",
  async (role) => {
    const f = await fixture();
    try {
      await expectTransportDenied(f, await login(f.auth.api, role));
    } finally {
      await f.close();
    }
  },
);

it.each([
  ["missing CSRF", { "x-csrf-token": undefined }, "INVALID_CSRF"],
  ["invalid CSRF", { "x-csrf-token": "invalid" }, "INVALID_CSRF"],
  [
    "foreign origin",
    { origin: "https://foreign.example.invalid" },
    "ORIGIN_DENIED",
  ],
])(
  "D02 capable principal with %s cannot reach body or Ticketing",
  async (_name, override, error) => {
    const f = await fixture();
    try {
      const headers = {
        ...(await login(f.auth.api, "PLATFORM_ADMIN")),
        ...override,
      };
      await expectHostDenied(f, headers, 403, error);
      await expectTransportDenied(f, headers, 403, error);
    } finally {
      await f.close();
    }
  },
);

it.each(["missing", "forged", "expired", "revoked", "blocked"])(
  "D02 %s authentication fails before body or Ticketing",
  async (kind) => {
    const f = await fixture();
    try {
      let headers = await login(f.auth.api, "BUSINESS_MANAGER");
      if (kind === "missing") headers = {};
      if (kind === "forged")
        headers.cookie = `${authServer.sessionCookieName}=forged`;
      if (kind === "expired") {
        const token = authServer.createSessionToken(
          {
            subject: "d02-business_manager",
            email: "d02-business_manager@example.invalid",
            role: "BUSINESS_MANAGER",
            businessIds: ["tenant-a"],
          },
          authSecret,
          {
            nowEpochSeconds: Math.floor(Date.now() / 1000) - 7200,
            ttlSeconds: 300,
          },
        );
        expect(token).not.toBeNull();
        headers.cookie = `${authServer.sessionCookieName}=${token}`;
      }
      if (kind === "revoked") {
        expect(
          (await authCall(f.auth.api, "logout", { headers })).statusCode,
        ).toBe(200);
      }
      if (kind === "blocked") {
        await f.auth.state.setPrincipalAdminState({
          subject: "d02-business_manager",
          status: "blocked",
          roleOverride: null,
          updatedBy: "d02-platform_owner",
        });
      }
      await expectHostDenied(f, headers, 401, "AUTH_REQUIRED");
      await expectTransportDenied(f, headers, 401, "AUTH_REQUIRED");
    } finally {
      await f.close();
    }
  },
);

it("D02 current principal loses capability after cookie issuance and successful check-in", async () => {
  const f = await fixture();
  try {
    const headers = await login(f.auth.api, "BUSINESS_MANAGER");
    const result = await hostCall(
      f.api,
      request(checkInPath, {
        headers,
        body: { qrPayload: createTicketQrPayload(f.ticket.id, signingSecret) },
      }),
    );
    expect(result.statusCode).toBe(200);
    await f.auth.state.setPrincipalAdminState({
      subject: "d02-business_manager",
      status: "active",
      roleOverride: "AFFILIATE",
      updatedBy: "d02-platform_owner",
    });
    expect(
      await f.auth.api.resolveSession(request(checkInPath, { headers })),
    ).toMatchObject({ role: "AFFILIATE" });
    await expectHostDenied(f, headers);
    await expectTransportDenied(f, headers);
    expect(f.storage.snapshot().checkIns).toHaveLength(1);
  } finally {
    await f.close();
  }
});

it.each([
  ["BUSINESS_MANAGER", ["tenant-a"], 403],
  ["BUSINESS_MANAGER", ["tenant-a", "tenant-b"], 200],
  ["PLATFORM_ADMIN", ["tenant-a"], 200],
])(
  "D02 %s with current businesses %j operates tenant B with status %s",
  async (role, businessIds, status) => {
    const f = await fixture({ businessId: "tenant-b", businessIds });
    try {
      const before = f.storage.snapshot();
      const result = await checkIn(f, await login(f.auth.api, role), {
        operatorReference: "forged-operator",
        operatorAuthority: {
          subject: "forged-operator",
          capabilities: ["ticketing.manage"],
          scope: { kind: "platform" },
        },
      });
      expect(result.statusCode).toBe(status);
      if (status === 403) {
        expect(result.data.error).toBe("TICKETING_OPERATOR_FORBIDDEN");
        expect(f.storage.snapshot()).toEqual(before);
      } else {
        expect(result.data.data.checkIn.operatorReference).toBe(
          `d02-${role.toLowerCase()}`,
        );
        expect(f.storage.snapshot().checkIns).toHaveLength(1);
      }
    } finally {
      await f.close();
    }
  },
);

it.each([
  ["suspended", 409, "TICKETING_DESTINATION_SUSPENDED"],
  ["missing", 404, "TICKETING_OPERATOR_NOT_FOUND"],
  ["foreign", 403, "TICKETING_OPERATOR_FORBIDDEN"],
  ["unavailable", 503, "TICKETING_OPERATOR_UNAVAILABLE"],
])(
  "D02 %s destination or owner denies a new entry without effects",
  async (mode, status, error) => {
    const f = await fixture();
    try {
      if (mode === "suspended") f.ownership.destination.status = "suspended";
      if (mode === "missing") f.ownership.destination = null;
      if (mode === "foreign") f.ownership.destination.id = "itacare";
      if (mode === "unavailable") f.ownership.ownerAvailable = false;
      const before = f.storage.snapshot();
      const result = await checkIn(
        f,
        await login(f.auth.api, "BUSINESS_MANAGER"),
      );
      expect(result.statusCode).toBe(status);
      expect(result.data.error).toBe(error);
      expect(f.storage.snapshot()).toEqual(before);
      expect(f.storage.operations).not.toContain("transactions.commitCheckIn");
    } finally {
      await f.close();
    }
  },
);

it("D02 replaces stale business IDs in a valid cookie with current scope", async () => {
  const f = await fixture({ businessId: "tenant-b" });
  try {
    const token = authServer.createSessionToken(
      {
        subject: "d02-business_manager",
        email: "d02-business_manager@example.invalid",
        role: "BUSINESS_MANAGER",
        businessIds: ["tenant-b"],
      },
      authSecret,
    );
    const session = authServer.verifySessionToken(token, authSecret);
    const headers = {
      cookie: `${authServer.sessionCookieName}=${token}`,
      "x-csrf-token": authServer.csrfTokenForSession(session, authSecret),
    };
    const before = f.storage.snapshot();
    const result = await checkIn(f, headers);
    expect(result.statusCode).toBe(403);
    expect(result.data.error).toBe("TICKETING_OPERATOR_FORBIDDEN");
    expect(f.storage.snapshot()).toEqual(before);
  } finally {
    await f.close();
  }
});

it.each([
  ["suspended", 200],
  ["scope", 403],
  ["missing", 404],
  ["unavailable", 503],
  ["other actor", 409],
])(
  "D02 exact replay after %s revalidates current authority and facts",
  async (mode, status) => {
    const f = await fixture({ businessId: "tenant-b" });
    try {
      let headers = await login(f.auth.api, "PLATFORM_ADMIN");
      expect((await checkIn(f, headers)).statusCode).toBe(200);
      const before = f.storage.snapshot();
      f.storage.operations.length = 0;
      if (mode === "suspended") f.ownership.destination.status = "suspended";
      if (mode === "missing") f.ownership.bindingPresent = false;
      if (mode === "unavailable") f.ownership.ownerAvailable = false;
      if (mode === "other actor")
        headers = await login(f.auth.api, "PLATFORM_OWNER");
      if (mode === "scope")
        await f.auth.state.setPrincipalAdminState({
          subject: "d02-platform_admin",
          status: "active",
          roleOverride: "BUSINESS_MANAGER",
          updatedBy: "d02-platform_owner",
        });
      const result = await checkIn(f, headers);
      expect(result.statusCode).toBe(status);
      if (status === 200) expect(result.data.data.replayed).toBe(true);
      if (mode === "other actor")
        expect(result.data.error).toBe("TICKETING_CHECKIN_REPLAY_CONFLICT");
      expect(f.storage.snapshot()).toEqual(before);
      expect(f.storage.operations).not.toContain("transactions.commitCheckIn");
    } finally {
      await f.close();
    }
  },
);

it("D02 revalidates a session revoked while the host reads the body", async () => {
  const f = await fixture();
  try {
    const headers = await login(f.auth.api, "BUSINESS_MANAGER");
    const req = request(checkInPath, {
      headers,
      body: {
        qrPayload: createTicketQrPayload(f.ticket.id, signingSecret),
      },
    });
    const read = req[Symbol.asyncIterator];
    req[Symbol.asyncIterator] = async function* () {
      expect(
        (await authCall(f.auth.api, "logout", { headers })).statusCode,
      ).toBe(200);
      yield* read.call(this);
    };
    const before = f.storage.snapshot();
    const result = await hostCall(f.api, req);
    expect(result.statusCode).toBe(401);
    expect(result.data.error).toBe("AUTH_REQUIRED");
    expect(req.observed.bodyReads).toBe(1);
    expect(f.storage.snapshot()).toEqual(before);
    expect(f.storage.operations).toEqual([]);
  } finally {
    await f.close();
  }
});

it("D02 denies capability before Content-Type and preserves the consumer session boundary", async () => {
  const f = await fixture();
  try {
    const affiliate = await login(f.auth.api, "AFFILIATE");
    const denied = request(checkInPath, {
      headers: { ...affiliate, "content-type": "text/plain" },
      rawBody: "invalid",
    });
    const response = await hostCall(f.api, denied);
    expect(response.statusCode).toBe(403);
    expect(response.data.error).toBe("ADMIN_REQUIRED");
    expect(denied.observed.bodyReads).toBe(0);
    const consumer = await hostCall(
      f.api,
      request(`${prefix}/consumer-session`, { body: {} }),
    );
    expect(consumer.statusCode).toBe(201);
    const headers = {
      cookie: String(consumer.headers.get("set-cookie")).split(";", 1)[0],
      "x-csrf-token": consumer.data.data.csrfToken,
    };
    await expectHostDenied(f, headers, 401, "AUTH_REQUIRED");
    await expectTransportDenied(f, headers, 401, "AUTH_REQUIRED");
    const quote = await hostCall(
      f.api,
      request(`${prefix}/quote`, {
        headers,
        body: { inventoryId: "tin_d02_missing_fixture", quantity: 1 },
      }),
    );
    expect(quote.statusCode).toBe(401);
    expect(quote.data.error).toBe("AUTH_REQUIRED");
    const inventory = await hostCall(
      f.api,
      request(`${prefix}/inventory`, { method: "GET" }),
    );
    expect(inventory.statusCode).toBe(200);
    expect(inventory.data.data).toEqual([]);
    expect(f.storage.operations).toEqual([]);
  } finally {
    await f.close();
  }
});

it.each([
  ["anonymous", 401, "AUTH_REQUIRED"],
  ["AFFILIATE", 403, "ADMIN_REQUIRED"],
  ["PLATFORM_ADMIN", 503, "TICKETING_FEATURE_DISABLED"],
])(
  "D02 installed disabled runtime keeps host authorization for %s",
  async (role, status, error) => {
    const auth = await authFixture();
    const api = createTicketingApi({
      authApi: auth.api,
      getEnvironmentValue: () => "",
      audit: () => undefined,
    });
    try {
      await api.start();
      const headers = role === "anonymous" ? {} : await login(auth.api, role);
      const req = request(checkInPath, { headers, body: {} });
      const result = await hostCall(api, req);
      expect(result.statusCode).toBe(status);
      expect(result.data.error).toBe(error);
      expect(req.observed.bodyReads).toBe(role === "PLATFORM_ADMIN" ? 1 : 0);
    } finally {
      await api.stop();
      await auth.api.stop();
    }
  },
);

it("D02 absent runtime retains the pre-existing unavailable response", async () => {
  const auth = await authFixture();
  const api = createTicketingApi({ authApi: auth.api, audit: () => undefined });
  try {
    const req = request(checkInPath, { rawBody: "{" });
    const result = await hostCall(api, req);
    expect(result.statusCode).toBe(503);
    expect(result.data.error).toBe("TICKETING_UNAVAILABLE");
    expect(req.observed.bodyReads).toBe(0);
  } finally {
    await api.stop();
    await auth.api.stop();
  }
});

const databaseUrl = process.env.MORRO_TEST_D02_DATABASE_URL || "";
if (databaseUrl) {
  const url = new URL(databaseUrl);
  if (
    url.protocol !== "mysql:" ||
    url.hostname !== "127.0.0.1" ||
    !["33385", "33390"].includes(url.port) ||
    url.pathname !== "/ticketing_d02_capability" ||
    url.search ||
    url.hash
  )
    throw new Error("D02_REQUIRES_DISPOSABLE_LOCAL_TICKETING_DATABASE");
}

function instrumentSql(pool) {
  const probe = { active: false, operations: [] };
  function wrap(target, label) {
    return new Proxy(target, {
      get(current, key) {
        const value = Reflect.get(current, key, current);
        if (typeof value !== "function") return value;
        if (key === "getConnection")
          return async (...args) => {
            if (probe.active) probe.operations.push(`${label}.getConnection`);
            return wrap(await value.apply(current, args), "connection");
          };
        if (
          [
            "query",
            "execute",
            "beginTransaction",
            "commit",
            "rollback",
          ].includes(key)
        )
          return (...args) => {
            if (probe.active) probe.operations.push(`${label}.${key}`);
            return value.apply(current, args);
          };
        return value.bind(current);
      },
    });
  }
  return { pool: wrap(pool, "pool"), probe };
}

it.skipIf(!databaseUrl).each(["allowed", "AFFILIATE", "demoted"])(
  "D02 SQL %s: real Auth and Ticketing preserve the capability boundary",
  async (mode) => {
    const auth = await authFixture();
    const pool = ticketingServer.createTicketingMySqlPoolFromEnvironment({
      TICKETING_DATABASE_URL: databaseUrl,
    });
    const observer = ticketingServer.createTicketingMySqlPoolFromEnvironment({
      TICKETING_DATABASE_URL: databaseUrl,
    });
    let api;
    try {
      await ticketingServer.applyTicketingM147Schema(pool);
      const original = ticketFixture();
      await new ticketingServer.MySqlTicketRepository(pool).save(original);
      const instrumented = instrumentSql(pool);
      const storage = {
        tickets: new ticketingServer.MySqlTicketRepository(instrumented.pool),
        checkIns: new ticketingServer.MySqlTicketCheckInRepository(
          instrumented.pool,
        ),
        transactions: new ticketingServer.MySqlTicketingTransactionalCommand(
          instrumented.pool,
        ),
      };
      ({ api } = compose(auth.api, storage, { ticket: original }));
      const headers = await login(
        auth.api,
        mode === "AFFILIATE" ? "AFFILIATE" : "PLATFORM_ADMIN",
      );
      const readback = async () => ({
        ticket: await new ticketingServer.MySqlTicketRepository(
          observer,
        ).findById(original.id),
        checkIns: await new ticketingServer.MySqlTicketCheckInRepository(
          observer,
        ).listByTicketId(original.id),
      });
      const call = async () => {
        instrumented.probe.operations.length = 0;
        instrumented.probe.active = true;
        try {
          return await hostCall(
            api,
            request(checkInPath, {
              headers,
              body: {
                qrPayload: createTicketQrPayload(original.id, signingSecret),
              },
            }),
          );
        } finally {
          instrumented.probe.active = false;
        }
      };
      if (mode === "demoted") {
        const first = await call();
        expect(first.statusCode).toBe(200);
        expect(instrumented.probe.operations).toContain("connection.commit");
        expect((await readback()).checkIns).toHaveLength(1);
        await auth.state.setPrincipalAdminState({
          subject: "d02-platform_admin",
          status: "active",
          roleOverride: "AFFILIATE",
          updatedBy: "d02-platform_owner",
        });
        expect(
          await auth.api.resolveSession(request(checkInPath, { headers })),
        ).toMatchObject({ role: "AFFILIATE" });
      }
      const before = await readback();
      const response = await call();
      const operations = [...instrumented.probe.operations];
      const after = await readback();
      if (mode === "allowed") {
        expect(response.statusCode).toBe(200);
        expect(response.data.data.replayed).toBe(false);
        expect(after.ticket.status).toBe("validated");
        expect(after.checkIns).toHaveLength(1);
        expect(after.checkIns[0]).toMatchObject({
          ticketId: original.id,
          operatorReference: "d02-platform_admin",
        });
        expect(operations).toContain("pool.getConnection");
        expect(
          operations.filter((x) => x === "connection.commit"),
        ).toHaveLength(1);
      } else {
        expect(response.statusCode).toBe(403);
        expect(response.data.error).toBe("ADMIN_REQUIRED");
        expect(operations).toEqual([]);
        expect(after).toEqual(before);
        expect(after.checkIns).toHaveLength(mode === "demoted" ? 1 : 0);
      }
    } finally {
      await api?.stop();
      await auth.api.stop();
      await pool.end();
      await observer.end();
    }
  },
);
