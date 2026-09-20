import { describe, expect, it, vi } from "vitest";

import {
  createBusinessAdminAdapter,
  createCrmAdminAdapter,
  createTicketingAdminAdapter,
} from "./admin-domain-adapters.mjs";

function responseRecorder() {
  return {
    statusCode: 0,
    headers: new Map(),
    body: "",
    setHeader(name, value) {
      this.headers.set(String(name).toLowerCase(), value);
    },
    end(value = "") {
      this.body = String(value);
    },
  };
}

function delegationBoundary() {
  const calls = [];
  return {
    calls,
    authApi: {
      async withDelegatedSession(request, effectiveUserId, operation) {
        calls.push({ request, effectiveUserId });
        return operation();
      },
    },
  };
}

describe("Control Center domain support delegation", () => {
  it("delegates Business owner-contract execution only when effectiveUser exists", async () => {
    const request = { method: "GET" };
    const response = responseRecorder();
    const handle = vi.fn(async (_request, targetResponse, pathname) => {
      targetResponse.statusCode = 200;
      targetResponse.end(JSON.stringify({ pathname }));
    });
    const { authApi, calls } = delegationBoundary();
    const adapter = createBusinessAdminAdapter({ handle }, authApi);

    await adapter.handle({
      request,
      response,
      requestUrl: new URL(
        "http://localhost/api/admin/v1/businesses/toca-do-morcego/profile",
      ),
      effectiveUser: { id: "business-owner" },
    });

    expect(calls).toEqual([{ request, effectiveUserId: "business-owner" }]);
    expect(handle).toHaveBeenCalledWith(
      request,
      response,
      "/api/business/toca-do-morcego/profile",
    );

    calls.length = 0;
    handle.mockClear();
    await adapter.handle({
      request,
      response,
      requestUrl: new URL(
        "http://localhost/api/admin/v1/businesses/toca-do-morcego/profile",
      ),
      effectiveUser: null,
    });
    expect(calls).toEqual([]);
    expect(handle).toHaveBeenCalledTimes(1);
  });

  it("delegates CRM and Ticketing through the same Auth boundary", async () => {
    const request = { method: "GET" };
    const response = responseRecorder();
    const { authApi, calls } = delegationBoundary();
    const crmHandle = vi.fn(async () => undefined);
    const ticketingHandle = vi.fn(async () => undefined);
    const crm = createCrmAdminAdapter({ handle: crmHandle }, authApi);
    const ticketing = createTicketingAdminAdapter(
      { handle: ticketingHandle },
      authApi,
    );

    await crm.handle({
      request,
      response,
      requestUrl: new URL("http://localhost/api/admin/v1/crm/leads"),
      effectiveUser: { id: "business-owner" },
    });
    await ticketing.handle({
      request,
      response,
      requestUrl: new URL("http://localhost/api/admin/v1/ticketing/inventory"),
      effectiveUser: { id: "business-owner" },
    });

    expect(calls.map((entry) => entry.effectiveUserId)).toEqual([
      "business-owner",
      "business-owner",
    ]);
    expect(crmHandle).toHaveBeenCalledTimes(1);
    expect(ticketingHandle).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the internal Auth delegation boundary is absent", () => {
    expect(() =>
      createBusinessAdminAdapter({ handle: async () => undefined }),
    ).toThrow("ADMIN_SUPPORT_DELEGATION_BOUNDARY_REQUIRED");
  });
});
