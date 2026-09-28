import { describe, expect, it } from "vitest";

import {
  createDatabaseEnvironmentResolver,
  databaseSchemas,
} from "./database-environment.mjs";

const canonicalSchemas = Object.freeze({
  AUTH_DATABASE_URL: "morro_auth",
  CONTROL_CENTER_AUDIT_DATABASE_URL: "morro_audit",
  DESTINATIONS_DATABASE_URL: "morro_destinations",
  CONTENT_DATABASE_URL: "morro_content",
  BUSINESS_DATABASE_URL: "morro_business",
  ORDERING_DATABASE_URL: "morro_ordering",
  FINANCIAL_DATABASE_URL: "morro_financial",
  TICKETING_DATABASE_URL: "morro_ticketing",
  NOTIFICATIONS_DATABASE_URL: "morro_notifications",
  AFFILIATES_DATABASE_URL: "morro_affiliates",
  ANALYTICS_DATABASE_URL: "morro_analytics",
  CRM_DATABASE_URL: "morro_crm",
  COMMERCE_DATABASE_URL: "morro_commerce",
});

describe("database environment resolver", () => {
  it("covers the complete thirteen-domain production topology", () => {
    expect(databaseSchemas).toEqual(canonicalSchemas);
  });

  it("preserves an explicit database URL", () => {
    const resolveEnvironment = createDatabaseEnvironmentResolver({
      processEnvironment: {
        CRM_DATABASE_URL: "mysql://crm:secret@crm.internal:3306/morro_crm",
        MORRO_DB_HOST: "fallback.example",
        MORRO_DB_USER: "fallback",
        MORRO_DB_PASSWORD: "fallback-secret",
      },
    });

    expect(resolveEnvironment("CRM_DATABASE_URL")).toBe(
      "mysql://crm:secret@crm.internal:3306/morro_crm",
    );
  });

  it("synthesizes isolated schema URLs from shared fallback credentials", () => {
    const resolveEnvironment = createDatabaseEnvironmentResolver({
      processEnvironment: {
        MORRO_DB_HOST: "mysql.example",
        MORRO_DB_PORT: "3307",
        MORRO_DB_USER: "morro_app",
        MORRO_DB_PASSWORD: "secret with symbols:/?#[]@!",
      },
    });

    for (const [key, schema] of Object.entries(canonicalSchemas)) {
      const url = new URL(resolveEnvironment(key));
      expect(url.protocol).toBe("mysql:");
      expect(url.hostname).toBe("mysql.example");
      expect(url.port).toBe("3307");
      expect(url.username).toBe("morro_app");
      expect(url.password).toBe(
        "secret%20with%20symbols%3A%2F%3F%23%5B%5D%40!",
      );
      expect(url.pathname).toBe(`/${schema}`);
    }
  });

  it("fails closed when required component values are incomplete", () => {
    const resolveEnvironment = createDatabaseEnvironmentResolver({
      processEnvironment: {
        MORRO_DB_HOST: "mysql.example",
        MORRO_DB_USER: "morro_app",
      },
    });

    expect(resolveEnvironment("AUTH_DATABASE_URL")).toBe("");
  });
});
