import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";

import { describe, expect, it } from "vitest";

import {
  createCheckoutProviderRequest,
  createMoney,
  createPaymentIdempotencyKey,
  normalizePaymentId,
  type CheckoutProviderRequest,
} from "../../packages/financial/src/index.js";
import { createSandboxCheckoutProviderFromEnvironment } from "../../services/financial/src/index.js";

async function requestBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function checkoutRequest(): CheckoutProviderRequest {
  const input = createCheckoutProviderRequest({
    paymentId: normalizePaymentId("pay_wire_sandbox_0001"),
    idempotencyKey: createPaymentIdempotencyKey(
      "ord_wire_sandbox_0001",
    ),
    amount: createMoney(49_900, "BRL"),
    description: "Plano Crescimento",
    returnUrl: "http://127.0.0.1/checkout/return",
    webhookUrl: "http://127.0.0.1/api/payments/v1/webhooks/sandbox",
    customer: {
      name: "Cliente Wire",
      email: "wire@example.com",
      phone: null,
      document: null,
    },
    metadata: {
      orderId: "ord_wire_sandbox_0001",
      sessionId: "session_wire_sandbox_0001",
    },
  });
  if (!input) throw new Error("WIRE_FIXTURE_INVALID");
  return input;
}

describe("M140 sandbox provider HTTP wire contract", () => {
  it("reuses the exact durable key and receives one stable sandbox session", async () => {
    const received: Array<{
      readonly authorization: string | undefined;
      readonly contentType: string | undefined;
      readonly idempotencyKey: string | undefined;
      readonly mode: string | undefined;
      readonly body: unknown;
    }> = [];
    const sessions = new Map<string, Readonly<Record<string, unknown>>>();
    let checkoutOrigin = "";

    const server = createServer(async (request, response) => {
      try {
        if (
          request.method !== "POST" ||
          request.url !== "/v1/checkouts"
        ) {
          response.writeHead(404).end();
          return;
        }
        const body = JSON.parse(await requestBody(request)) as unknown;
        const idempotencyKey = request.headers["idempotency-key"];
        const key =
          typeof idempotencyKey === "string" ? idempotencyKey : "";
        received.push({
          authorization: request.headers.authorization,
          contentType: request.headers["content-type"],
          idempotencyKey:
            typeof idempotencyKey === "string"
              ? idempotencyKey
              : undefined,
          mode: request.headers["x-touristic-provider-mode"] as
            | string
            | undefined,
          body,
        });
        if (
          request.headers.authorization !==
            "Bearer local-sandbox-token-with-at-least-thirty-two-characters" ||
          !key
        ) {
          response.writeHead(401).end();
          return;
        }

        const existing = sessions.get(key);
        const session =
          existing ??
          Object.freeze({
            version: 1,
            checkoutId: "chk_wire_sandbox_0001",
            checkoutUrl:
              checkoutOrigin + "/pay/chk_wire_sandbox_0001",
            paymentReference: null,
          });
        sessions.set(key, session);
        response.writeHead(existing ? 200 : 201, {
          "Content-Type": "application/json",
        });
        response.end(JSON.stringify(session));
      } catch {
        response.writeHead(400).end();
      }
    });

    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => reject(error);
      server.once("error", onError);
      server.listen(0, "127.0.0.1", () => {
        server.off("error", onError);
        resolve();
      });
    });

    try {
      const address = server.address() as AddressInfo;
      checkoutOrigin = `http://127.0.0.1:${address.port}`;
      const provider = createSandboxCheckoutProviderFromEnvironment({
        NODE_ENV: "test",
        PAYMENTS_PROVIDER_MODE: "sandbox",
        PAYMENTS_SANDBOX_PROVIDER_BASE_URL: checkoutOrigin,
        PAYMENTS_SANDBOX_PROVIDER_API_TOKEN:
          "local-sandbox-token-with-at-least-thirty-two-characters",
        PAYMENTS_SANDBOX_CHECKOUT_ORIGINS: checkoutOrigin,
        PAYMENTS_PROVIDER_TIMEOUT_MS: "2000",
      });
      const input = checkoutRequest();

      const first = await provider.createCheckout(input);
      const replay = await provider.createCheckout(input);

      expect(first).toEqual({
        providerCheckoutId: "chk_wire_sandbox_0001",
        checkoutUrl:
          checkoutOrigin + "/pay/chk_wire_sandbox_0001",
        providerReference: null,
      });
      expect(replay).toEqual(first);
      expect(sessions.size).toBe(1);
      expect(received).toHaveLength(2);
      expect(received[1]).toEqual(received[0]);
      expect(received[0]).toEqual({
        authorization:
          "Bearer local-sandbox-token-with-at-least-thirty-two-characters",
        contentType: "application/json",
        idempotencyKey: "payment:v1:ord_wire_sandbox_0001",
        mode: "sandbox",
        body: {
          version: 1,
          externalReference: "pay_wire_sandbox_0001",
          amount: { minorUnits: 49_900, currency: "BRL" },
          description: "Plano Crescimento",
          returnUrl: "http://127.0.0.1/checkout/return",
          webhookUrl:
            "http://127.0.0.1/api/payments/v1/webhooks/sandbox",
          customer: {
            name: "Cliente Wire",
            email: "wire@example.com",
            phone: null,
            document: null,
          },
          metadata: {
            orderId: "ord_wire_sandbox_0001",
            sessionId: "session_wire_sandbox_0001",
          },
        },
      });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});
