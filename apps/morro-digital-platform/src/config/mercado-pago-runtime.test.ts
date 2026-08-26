import { describe, expect, it } from "vitest";

import { loadMorroMercadoPagoRuntimeConfig } from "./mercado-pago-runtime.js";

const testPublicKey = "TEST-public-key-fixture_12345678";
const productionPublicKey = "APP_USR-public-key-fixture_12345678";

describe("loadMorroMercadoPagoRuntimeConfig", () => {
  it("loads and freezes a TEST browser-safe public key", () => {
    const config = loadMorroMercadoPagoRuntimeConfig({
      VITE_MERCADO_PAGO_PUBLIC_KEY: testPublicKey,
    });

    expect(config).toEqual({
      publicKey: testPublicKey,
      credentialMode: "test",
    });
    expect(Object.isFrozen(config)).toBe(true);
  });

  it("classifies an APP_USR public key as production without exposing server credentials", () => {
    expect(
      loadMorroMercadoPagoRuntimeConfig({
        VITE_MERCADO_PAGO_PUBLIC_KEY: productionPublicKey,
      }),
    ).toEqual({
      publicKey: productionPublicKey,
      credentialMode: "production",
    });
  });

  it("rejects a missing public key without leaking values", () => {
    expect(() => loadMorroMercadoPagoRuntimeConfig({})).toThrow(
      "Required environment variable is missing: VITE_MERCADO_PAGO_PUBLIC_KEY.",
    );
  });

  it.each(["PUBLIC-12345678", "TEST-short", "APP_USR-contains space"])(
    "rejects malformed public key %s",
    (publicKey) => {
      expect(() =>
        loadMorroMercadoPagoRuntimeConfig({
          VITE_MERCADO_PAGO_PUBLIC_KEY: publicKey,
        }),
      ).toThrow(
        "VITE_MERCADO_PAGO_PUBLIC_KEY has an invalid public-key format.",
      );
    },
  );

  it.each([
    "VITE_MERCADO_PAGO_ACCESS_TOKEN",
    "VITE_MERCADO_PAGO_WEBHOOK_SECRET",
    "VITE_PAYMENTS_STATUS_TOKEN_SECRET",
    "VITE_PAYMENTS_HANDOFF_SECRET",
  ] as const)(
    "fails closed when server-only credential %s is browser-exposed",
    (key) => {
      expect(() =>
        loadMorroMercadoPagoRuntimeConfig({
          VITE_MERCADO_PAGO_PUBLIC_KEY: testPublicKey,
          [key]: "server-secret-fixture",
        }),
      ).toThrow(
        `Server-only Mercado Pago credential must not be exposed to the browser: ${key}.`,
      );
    },
  );
});
