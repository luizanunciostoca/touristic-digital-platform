import { createHmac, timingSafeEqual } from "node:crypto";

import { normalizeFinancialTimestamp } from "@touristic/financial";

const DEVICE_ID = /^tdv_[A-Za-z0-9_-]{8,116}$/u;
const DESTINATION_ID = /^[A-Za-z0-9:_-]{2,120}$/u;
const TOKEN = /^tdc\.v1\.([A-Za-z0-9_-]+)\.([a-f0-9]{64})$/u;
const MAX_TTL_MS = 24 * 60 * 60 * 1000;

export interface TicketOfflineDeviceCredentialClaims {
  readonly version: "tdc.v1";
  readonly deviceId: string;
  readonly destinationId: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
}

export interface ProvisionedTicketOfflineDeviceCredential {
  readonly token: string;
  readonly claims: TicketOfflineDeviceCredentialClaims;
  readonly envelopeSigningSecret: string;
}

function secret(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length >= 32 && normalized.length <= 512 ? normalized : null;
}

function timestamp(value: unknown): string | null {
  const normalized = normalizeFinancialTimestamp(value);
  return normalized ? new Date(normalized).toISOString() : null;
}

function canonicalClaims(input: {
  readonly deviceId: unknown;
  readonly destinationId: unknown;
  readonly issuedAt: unknown;
  readonly expiresAt: unknown;
}): TicketOfflineDeviceCredentialClaims | null {
  const deviceId = typeof input.deviceId === "string" ? input.deviceId.trim() : "";
  const destinationId =
    typeof input.destinationId === "string" ? input.destinationId.trim() : "";
  const issuedAt = timestamp(input.issuedAt);
  const expiresAt = timestamp(input.expiresAt);
  if (
    !DEVICE_ID.test(deviceId) ||
    !DESTINATION_ID.test(destinationId) ||
    !issuedAt ||
    !expiresAt
  ) {
    return null;
  }
  const ttl = Date.parse(expiresAt) - Date.parse(issuedAt);
  if (ttl <= 0 || ttl > MAX_TTL_MS) return null;
  return Object.freeze({
    version: "tdc.v1" as const,
    deviceId,
    destinationId,
    issuedAt,
    expiresAt,
  });
}

function encodeClaims(claims: TicketOfflineDeviceCredentialClaims): string {
  return Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
}

function signPayload(payload: string, masterSecret: string): string {
  return createHmac("sha256", masterSecret)
    .update(`ticket-offline-credential:v1:${payload}`)
    .digest("hex");
}

function deriveEnvelopeSecret(
  claims: TicketOfflineDeviceCredentialClaims,
  masterSecret: string,
): string {
  return createHmac("sha256", masterSecret)
    .update(
      `ticket-offline-device-key:v1:${claims.deviceId}:${claims.destinationId}:${claims.expiresAt}`,
    )
    .digest("hex");
}

function secureEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function provisionTicketOfflineDeviceCredential(
  input: {
    readonly deviceId: unknown;
    readonly destinationId: unknown;
    readonly issuedAt: unknown;
    readonly expiresAt: unknown;
  },
  masterSecretInput: unknown,
): ProvisionedTicketOfflineDeviceCredential | null {
  const claims = canonicalClaims(input);
  const masterSecret = secret(masterSecretInput);
  if (!claims || !masterSecret) return null;
  const payload = encodeClaims(claims);
  const signature = signPayload(payload, masterSecret);
  return Object.freeze({
    token: `tdc.v1.${payload}.${signature}`,
    claims,
    envelopeSigningSecret: deriveEnvelopeSecret(claims, masterSecret),
  });
}

export function verifyTicketOfflineDeviceCredential(
  tokenInput: unknown,
  masterSecretInput: unknown,
  observedAtInput: unknown,
): ProvisionedTicketOfflineDeviceCredential | null {
  if (typeof tokenInput !== "string") return null;
  const token = tokenInput.trim();
  const masterSecret = secret(masterSecretInput);
  const observedAt = timestamp(observedAtInput);
  const match = TOKEN.exec(token);
  if (!masterSecret || !observedAt || !match?.[1] || !match[2]) return null;
  const expected = signPayload(match[1], masterSecret);
  if (!secureEqual(match[2], expected)) return null;

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(match[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (decoded === null || typeof decoded !== "object" || Array.isArray(decoded)) {
    return null;
  }
  const input = decoded as Record<string, unknown>;
  if (input.version !== "tdc.v1") return null;
  const claims = canonicalClaims({
    deviceId: input.deviceId,
    destinationId: input.destinationId,
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
  });
  if (!claims || encodeClaims(claims) !== match[1]) return null;
  if (Date.parse(observedAt) < Date.parse(claims.issuedAt)) return null;
  if (Date.parse(observedAt) >= Date.parse(claims.expiresAt)) return null;

  return Object.freeze({
    token,
    claims,
    envelopeSigningSecret: deriveEnvelopeSecret(claims, masterSecret),
  });
}
