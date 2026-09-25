import { describe, expect, it } from "vitest";
import type { DashboardSessionResponse } from "@touristic/auth-browser";
import {
  createBusinessContextController,
  normalizedBusinessScopes,
  resolveBusinessContext,
  resolveMorroProModuleAccess,
} from "./morro-pro-business-management.js";

function session(
  role: DashboardSessionResponse["user"]["role"],
  businessIds: readonly string[],
  capabilities?: readonly string[],
): DashboardSessionResponse {
  return {
    authenticated: true,
    csrfToken: "csrf",
    user: {
      id: "user-1",
      email: "owner@example.com",
      role,
      businessIds,
      ...(capabilities ? { capabilities } : {}),
    },
  };
}

describe("Morro Pro business context", () => {
  it("normalizes and deduplicates explicit business scopes", () => {
    expect(
      normalizedBusinessScopes(
        session("BUSINESS_OWNER", ["business-a", "business-a", "Business-B"]),
      ),
    ).toEqual(["business-a", "business-b"]);
  });

  it("rejects an explicitly requested foreign business instead of falling back", () => {
    expect(() =>
      resolveBusinessContext(
        session("BUSINESS_OWNER", ["business-a"]),
        "business-b",
      ),
    ).toThrow("BUSINESS_ACCESS_DENIED");
  });

  it("supports multiple businesses and explicit switching", () => {
    const controller = createBusinessContextController(
      session("BUSINESS_OWNER", ["business-a", "business-b"]),
      "business-a",
    );
    expect(controller.current()).toBe("business-a");
    expect(controller.switchTo("business-b").businessId).toBe("business-b");
    expect(controller.current()).toBe("business-b");
  });

  it("invalidates stale requests when business context changes", () => {
    const controller = createBusinessContextController(
      session("BUSINESS_OWNER", ["business-a", "business-b"]),
      "business-a",
    );
    const stale = controller.request();
    const fresh = controller.switchTo("business-b");
    expect(stale.signal.aborted).toBe(true);
    expect(controller.isCurrent(stale)).toBe(false);
    expect(controller.isCurrent(fresh)).toBe(true);
  });

  it("rejects platform roles from the Morro Pro tenant portal", () => {
    expect(() =>
      resolveBusinessContext(
        session("PLATFORM_ADMIN", ["business-a"]),
        "business-a",
      ),
    ).toThrow("MORRO_PRO_ROLE_DENIED");

    const access = resolveMorroProModuleAccess("PLATFORM_ADMIN", undefined, []);
    expect(access.every((item) => !item.visible && !item.mutable)).toBe(true);
  });

  it("rejects cross-business switching", () => {
    const controller = createBusinessContextController(
      session("BUSINESS_MANAGER", ["business-a"]),
      "business-a",
    );
    expect(() => controller.switchTo("business-b")).toThrow(
      "BUSINESS_ACCESS_DENIED",
    );
  });
});

describe("Morro Pro role and module policy", () => {
  it("keeps viewer read-only", () => {
    const access = resolveMorroProModuleAccess(
      "BUSINESS_VIEWER",
      undefined,
      [],
    );
    expect(access.find((item) => item.id === "profile")).toMatchObject({
      visible: true,
      mutable: false,
    });
    expect(access.find((item) => item.id === "financial")).toMatchObject({
      visible: true,
      mutable: false,
    });
  });

  it("allows manager mutations only where its capabilities permit", () => {
    const access = resolveMorroProModuleAccess(
      "BUSINESS_MANAGER",
      undefined,
      [],
    );
    expect(access.find((item) => item.id === "profile")?.mutable).toBe(true);
    expect(access.find((item) => item.id === "offers")?.mutable).toBe(true);
    expect(access.find((item) => item.id === "content")?.mutable).toBe(false);
    expect(access.find((item) => item.id === "team")?.visible).toBe(false);
  });

  it("allows owner-governed modules without granting platform capabilities", () => {
    const access = resolveMorroProModuleAccess("BUSINESS_OWNER", undefined, []);
    expect(access.find((item) => item.id === "team")).toMatchObject({
      visible: true,
      mutable: true,
    });
    expect(access.find((item) => item.id === "financial")).toMatchObject({
      visible: true,
      mutable: false,
    });
  });

  it("treats explicit session capabilities as an authoritative narrowing", () => {
    const access = resolveMorroProModuleAccess(
      "BUSINESS_OWNER",
      ["business.read", "financial.read"],
      [],
    );
    expect(access.find((item) => item.id === "profile")).toMatchObject({
      visible: true,
      mutable: false,
    });
    expect(access.find((item) => item.id === "offers")).toMatchObject({
      visible: true,
      mutable: false,
    });
    expect(access.find((item) => item.id === "content")?.visible).toBe(false);
    expect(access.find((item) => item.id === "financial")).toMatchObject({
      visible: true,
      mutable: false,
    });
  });

  it("keeps Catalog Offers on Business authority and Ticketing separate", () => {
    const access = resolveMorroProModuleAccess(
      "BUSINESS_OWNER",
      ["business.read", "business.update", "ticketing.read"],
      [],
    );
    expect(access.find((item) => item.id === "offers")).toMatchObject({
      visible: true,
      mutable: true,
    });
    expect(access.find((item) => item.id === "ticketing")).toMatchObject({
      visible: true,
      mutable: false,
    });
  });

  it("filters capability-specific modules when Place capabilities are known", () => {
    const access = resolveMorroProModuleAccess("BUSINESS_OWNER", undefined, [
      "directions",
      "photos",
      "offers",
    ]);
    expect(access.find((item) => item.id === "photos")?.visible).toBe(true);
    expect(access.find((item) => item.id === "offers")?.visible).toBe(true);
    expect(access.find((item) => item.id === "menu")?.visible).toBe(false);
    expect(access.find((item) => item.id === "ticketing")?.visible).toBe(false);
  });
});
