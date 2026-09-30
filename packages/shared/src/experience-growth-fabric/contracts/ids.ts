const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const SHA_256 = /^[a-f0-9]{64}$/;
const OPAQUE_REFERENCE = /^[A-Za-z0-9_-]{8,180}$/;

export type DestinationId = string & { readonly __brand: "DestinationId" };
export type TenantId = string & { readonly __brand: "TenantId" };
export type SubjectId = string & { readonly __brand: "SubjectId" };
export type UserId = string & { readonly __brand: "UserId" };
export type CorrelationId = string & { readonly __brand: "CorrelationId" };
export type EventId = string & { readonly __brand: "EventId" };

export function isUtcTimestamp(value: string): boolean {
  return UTC_TIMESTAMP.test(value) && Number.isFinite(Date.parse(value));
}

export function isSha256(value: string): boolean {
  return SHA_256.test(value);
}

export function isOpaqueReference(value: string): boolean {
  return OPAQUE_REFERENCE.test(value);
}

export function isNonNegativeMinorUnits(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export function isSignedMinorUnits(value: number): boolean {
  return Number.isSafeInteger(value);
}
