import { describe, expect, it } from "vitest";

import {
  createDatabaseEnvironmentResolver,
  databaseSchemas,
} from "./database-environment.mjs";

describe("database environment resolver", () => {
  it("preserves an explicit database URL", () => {
    const resolveEnvironment = createDatabaseEnvironmentResolver({
      processEnvironment: {
        AUTH_DATABASE_URL: "mysql://explicit.example/auth",
        MORRO_DB_HOST: "fallback.example",
        MORRO_DB_USER: "fallback",
        MORRO_DB_PASSWORD: "fallback-secret",
      },
    });

    expect(resolveEnvironment("AUTH_DATABASE_URL")).toBe(
      "mysql://explicit.example/auth",
    );
  });

  it("synthesizes isolated database URLs from component secrets", () => {
    const resolveEnvironment = createDatabaseEnvironmentResolver({
      processEnvironment: {
        MORRO_DB_HOST: "mysql.example",
        MORRO_DB_PORT: "3307",
        MORRO_DB_USER: "morro_app",
        MORRO_DB_PASSWORD: "secret with symbols:/?#[]@!",
      },
    });

    for (const [key, schema] of Object.entries(databaseSchemas)) {
      const url = new URL(resolveEnvironment(key));
      expect(url.protocol).toBe("mysql:");
      expect(url.hostname).toBe("mysql.example");
      expect(url.port).toBe("3307");
      expect(url.username).toBe("morro_app");
      expect(url.password).toBe("secret%20with%20symbols%3A%2F%3F%23%5B%5D%40!");
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
