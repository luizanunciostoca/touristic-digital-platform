import { z } from "zod";
import { INPUT_SOURCES, SUPPORTED_LOCALES, USER_TYPES } from "../core/contracts.js";
import { deepFreeze } from "../core/runtime.js";

const TimestampSchema = z.string().datetime({ offset: true });
const ProvenancedScalarSchema = z
  .object({
    source: z.string().min(1).max(120),
    observedAt: TimestampSchema,
    validUntil: TimestampSchema.optional(),
    confidence: z.number().min(0).max(1).optional(),
  })
  .strict();

const LocationSchema = z
  .object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracyMeters: z.number().positive().max(100000).optional(),
    provenance: ProvenancedScalarSchema,
  })
  .strict();

const KeyValueContextSchema = z
  .record(z.string().max(80), z.unknown())
  .refine((value) => Object.keys(value).length <= 30, "Context object has too many keys");

export const AssistantContextEnvelopeSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    session: z
      .object({ sessionId: z.string().min(1).max(160), startedAt: TimestampSchema })
      .strict(),
    user: z
      .object({
        userId: z.string().min(1).max(160).optional(),
        userType: z.enum(USER_TYPES),
        authenticated: z.boolean(),
      })
      .strict(),
    profile: z
      .object({
        locale: z.enum(SUPPORTED_LOCALES),
        interests: z.array(z.string().max(80)).max(20),
        preferenceHints: z.array(z.string().max(120)).max(20),
        favoritePlaceIds: z.array(z.string().max(120)).max(100),
      })
      .strict(),
    conversation: z
      .object({
        conversationId: z.string().min(1).max(160),
        turnId: z.string().min(1).max(160),
        inputSource: z.enum(INPUT_SOURCES),
        locale: z.enum(SUPPORTED_LOCALES),
        recentTurnRefs: z.array(z.string().min(1).max(160)).max(12),
      })
      .strict(),
    destination: z
      .object({
        destinationId: z.string().min(1).max(160).nullable(),
        locale: z.enum(SUPPORTED_LOCALES),
      })
      .strict(),
    location: LocationSchema.nullable(),
    map: KeyValueContextSchema,
    explore: KeyValueContextSchema,
    navigation: z
      .object({
        active: z.boolean(),
        destinationId: z.string().max(160).nullable(),
        phase: z.string().min(1).max(80),
      })
      .strict(),
    business: KeyValueContextSchema,
    commerce: z
      .object({
        intent: z.string().max(120).nullable(),
        cartId: z.string().max(160).nullable(),
        orderId: z.string().max(160).nullable(),
      })
      .strict(),
    ticketing: KeyValueContextSchema,
    payment: z
      .object({
        status: z.string().max(80).nullable(),
        transactionRef: z.string().max(160).nullable(),
      })
      .strict(),
    environment: z.object({ online: z.boolean(), timezone: z.string().min(1).max(80) }).strict(),
    permissions: z
      .object({
        scopes: z.array(z.string().min(1).max(120)).max(100),
        locationAllowed: z.boolean(),
        profileAllowed: z.boolean(),
        memoryWriteAllowed: z.boolean(),
      })
      .strict(),
    capabilities: z
      .object({
        available: z.array(z.string().min(1).max(160)).max(200),
        unavailable: z.array(z.string().min(1).max(160)).max(200),
      })
      .strict(),
    memory: z.object({ refs: z.array(z.string().min(1).max(160)).max(100) }).strict(),
    metadata: z
      .object({
        assembledAt: TimestampSchema,
        source: z.string().min(1).max(120),
        freshnessSeconds: z.number().nonnegative().max(86400),
        redactions: z.array(z.string().min(1).max(120)).max(50),
        contextFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
      })
      .strict(),
  })
  .strict();

export type AssistantContextEnvelope = z.infer<typeof AssistantContextEnvelopeSchema>;

export function validateAndFreezeContext(value: unknown): Readonly<AssistantContextEnvelope> {
  return deepFreeze(AssistantContextEnvelopeSchema.parse(value));
}
