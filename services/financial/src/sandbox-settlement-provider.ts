import {
  createFinancialSettlementProviderCommand,
  normalizeFinancialSettlementProviderReceipt,
  normalizeFinancialSettlementProviderSnapshot,
  type FinancialSettlementProviderCommand,
  type FinancialSettlementProviderPort,
  type FinancialSettlementProviderSnapshot,
} from "@touristic/financial/settlement";

import {
  ProviderRequestUnavailableError,
  createProviderRetryPolicyFromEnvironment,
  executeBoundedProviderRequest,
} from "./provider-retry.js";

export interface SandboxSettlementEnvironment {
  readonly NODE_ENV?: string;
  readonly PAYMENTS_PROVIDER_MODE?: string;
  readonly PAYMENTS_SANDBOX_PROVIDER_BASE_URL?: string;
  readonly PAYMENTS_SANDBOX_PROVIDER_API_TOKEN?: string;
  readonly PAYMENTS_PROVIDER_TIMEOUT_MS?: string;
  readonly PAYMENTS_PROVIDER_MAX_ATTEMPTS?: string;
  readonly PAYMENTS_PROVIDER_RETRY_BASE_MS?: string;
}

export class SandboxSettlementProviderError extends Error {
  constructor(
    readonly code:
      | "SANDBOX_SETTLEMENT_INVALID_REQUEST"
      | "SANDBOX_SETTLEMENT_REJECTED"
      | "SANDBOX_SETTLEMENT_UNAVAILABLE"
      | "SANDBOX_SETTLEMENT_INVALID_RESPONSE",
  ) {
    super(code);
    this.name = "SandboxSettlementProviderError";
  }
}

const maxResponseBytes = 64 * 1024;

function boundedText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : "";
}

function baseUrl(environment: SandboxSettlementEnvironment): URL {
  const raw = boundedText(
    environment.PAYMENTS_SANDBOX_PROVIDER_BASE_URL,
    2_048,
  );
  if (!raw) throw new Error("PAYMENTS_SANDBOX_PROVIDER_BASE_URL is required");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("PAYMENTS_SANDBOX_PROVIDER_BASE_URL is invalid");
  }
  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    (environment.NODE_ENV === "production" && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error("PAYMENTS_SANDBOX_PROVIDER_BASE_URL is invalid");
  }
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url;
}

function timeoutMs(value: unknown): number {
  const raw = boundedText(value, 10);
  if (!raw) return 8_000;
  if (!/^[0-9]+$/u.test(raw))
    throw new Error("PAYMENTS_PROVIDER_TIMEOUT_MS is invalid");
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 500 || parsed > 15_000) {
    throw new Error("PAYMENTS_PROVIDER_TIMEOUT_MS is invalid");
  }
  return parsed;
}

async function boundedJson(response: Response): Promise<unknown> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxResponseBytes) {
    throw new SandboxSettlementProviderError(
      "SANDBOX_SETTLEMENT_INVALID_RESPONSE",
    );
  }
  if (!response.body) {
    throw new SandboxSettlementProviderError(
      "SANDBOX_SETTLEMENT_INVALID_RESPONSE",
    );
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxResponseBytes) {
        await reader.cancel();
        throw new SandboxSettlementProviderError(
          "SANDBOX_SETTLEMENT_INVALID_RESPONSE",
        );
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new SandboxSettlementProviderError(
      "SANDBOX_SETTLEMENT_INVALID_RESPONSE",
    );
  }
}

export function createSandboxSettlementProviderFromEnvironment(
  environment: SandboxSettlementEnvironment,
  options: { fetch?: typeof fetch } = {},
): FinancialSettlementProviderPort {
  if (environment.PAYMENTS_PROVIDER_MODE !== "sandbox") {
    throw new Error("PAYMENTS_PROVIDER_MODE=sandbox is required");
  }
  const providerBaseUrl = baseUrl(environment);
  const token = boundedText(
    environment.PAYMENTS_SANDBOX_PROVIDER_API_TOKEN,
    1_024,
  );
  if (token.length < 32) {
    throw new Error("PAYMENTS_SANDBOX_PROVIDER_API_TOKEN is required");
  }
  const timeout = timeoutMs(environment.PAYMENTS_PROVIDER_TIMEOUT_MS);
  const retryPolicy = createProviderRetryPolicyFromEnvironment(environment);
  const fetchProvider = options.fetch ?? globalThis.fetch;
  if (typeof fetchProvider !== "function") {
    throw new Error("PAYMENTS_SANDBOX_PROVIDER_FETCH_UNAVAILABLE");
  }

  async function call(
    url: URL,
    init: RequestInit,
  ): Promise<Record<string, unknown>> {
    try {
      const response = await executeBoundedProviderRequest({
        fetch: fetchProvider,
        url,
        init,
        timeoutMs: timeout,
        policy: retryPolicy,
      });
      if (!response.ok) {
        throw new SandboxSettlementProviderError(
          response.status >= 400 && response.status < 500
            ? "SANDBOX_SETTLEMENT_REJECTED"
            : "SANDBOX_SETTLEMENT_UNAVAILABLE",
        );
      }
      const payload = await boundedJson(response);
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new SandboxSettlementProviderError(
          "SANDBOX_SETTLEMENT_INVALID_RESPONSE",
        );
      }
      return payload as Record<string, unknown>;
    } catch (error) {
      if (error instanceof SandboxSettlementProviderError) throw error;
      if (error instanceof ProviderRequestUnavailableError) {
        throw new SandboxSettlementProviderError(
          "SANDBOX_SETTLEMENT_UNAVAILABLE",
        );
      }
      throw new SandboxSettlementProviderError(
        "SANDBOX_SETTLEMENT_UNAVAILABLE",
      );
    }
  }

  return Object.freeze({
    async requestTransfer(input: FinancialSettlementProviderCommand) {
      const command = createFinancialSettlementProviderCommand(input);
      if (!command) {
        throw new SandboxSettlementProviderError(
          "SANDBOX_SETTLEMENT_INVALID_REQUEST",
        );
      }
      const payload = await call(new URL("v1/transfers", providerBaseUrl), {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Idempotency-Key": command.idempotencyKey,
          "X-Touristic-Provider-Mode": "sandbox",
        },
        body: JSON.stringify({
          version: 1,
          settlementId: command.settlementId,
          paymentId: command.paymentId,
          payableId: command.payableId,
          beneficiaryReference: command.beneficiaryReference,
          amount: command.amount,
        }),
      });
      const receipt =
        payload.version === 1 && payload.settlementId === command.settlementId
          ? normalizeFinancialSettlementProviderReceipt({
              accepted: payload.accepted,
              providerTransferReference: payload.transferReference,
            })
          : null;
      if (!receipt) {
        throw new SandboxSettlementProviderError(
          "SANDBOX_SETTLEMENT_INVALID_RESPONSE",
        );
      }
      return receipt;
    },

    async readTransfer(input: {
      readonly settlementId: FinancialSettlementProviderCommand["settlementId"];
      readonly providerTransferReference: string;
    }): Promise<FinancialSettlementProviderSnapshot | null> {
      const reference = boundedText(input.providerTransferReference, 160);
      if (!reference) {
        throw new SandboxSettlementProviderError(
          "SANDBOX_SETTLEMENT_INVALID_REQUEST",
        );
      }
      const payload = await call(
        new URL(
          `v1/transfers/${encodeURIComponent(reference)}`,
          providerBaseUrl,
        ),
        {
          method: "GET",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
            "X-Touristic-Provider-Mode": "sandbox",
          },
        },
      );
      const snapshot =
        payload.version === 1 &&
        payload.settlementId === input.settlementId &&
        payload.transferReference === reference
          ? normalizeFinancialSettlementProviderSnapshot({
              settlementId: payload.settlementId,
              providerTransferReference: payload.transferReference,
              status: payload.status,
              amount: payload.amount,
              observedAt: payload.observedAt,
            })
          : null;
      if (!snapshot) {
        throw new SandboxSettlementProviderError(
          "SANDBOX_SETTLEMENT_INVALID_RESPONSE",
        );
      }
      return snapshot;
    },
  });
}
