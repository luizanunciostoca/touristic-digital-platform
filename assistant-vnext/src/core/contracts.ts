export const SUPPORTED_LOCALES = ["pt", "en", "es", "he"] as const;
export type AssistantLocale = (typeof SUPPORTED_LOCALES)[number];

export const USER_TYPES = [
  "anonymous",
  "tourist",
  "resident",
  "authenticated_tourist",
  "authenticated_resident",
  "unknown",
] as const;
export type AssistantUserType = (typeof USER_TYPES)[number];

export const INPUT_SOURCES = ["keyboard", "voice", "option", "event", "programmatic"] as const;
export type AssistantInputSource = (typeof INPUT_SOURCES)[number];

export const TOOL_EFFECTS = ["read", "prepare", "confirm", "execute"] as const;
export type ToolEffect = (typeof TOOL_EFFECTS)[number];

export type FailureCode =
  | "UNAVAILABLE"
  | "INSUFFICIENT_EVIDENCE"
  | "POLICY_DENIED"
  | "VALIDATION_FAILED"
  | "TIMEOUT"
  | "CANCELLED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "EXPIRED"
  | "DUPLICATE"
  | "PROVIDER_ERROR";

export type Result<T, E = AssistantFailure> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: E }>;

export interface AssistantFailure {
  readonly code: FailureCode;
  readonly message: string;
  readonly retryable: boolean;
  readonly metadata?: Readonly<Record<string, string | number | boolean | null>>;
}

export interface Provenance {
  readonly source: string;
  readonly sourceType: string;
  readonly retrievedAt: string;
  readonly validUntil?: string;
  readonly confidence?: number;
}

export interface Freshness {
  readonly observedAt: string;
  readonly validUntil?: string;
  readonly stale: boolean;
}

export interface EvidenceReference {
  readonly id: string;
  readonly source: string;
  readonly sourceType: string;
}

export interface Correlation {
  readonly conversationId: string;
  readonly turnId: string;
  readonly correlationId: string;
}

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export function ok<T>(value: T): Result<T> {
  return Object.freeze({ ok: true as const, value });
}

export function err(
  code: FailureCode,
  message: string,
  retryable = false,
  metadata?: Readonly<Record<string, string | number | boolean | null>>,
): Result<never> {
  return Object.freeze({
    ok: false as const,
    error: Object.freeze({
      code,
      message,
      retryable,
      ...(metadata ? { metadata } : {}),
    }),
  });
}
