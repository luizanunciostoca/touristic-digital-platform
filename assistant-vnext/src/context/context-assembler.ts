import type { AssistantInputSource, AssistantLocale, Result } from "../core/contracts.js";
import { err, ok } from "../core/contracts.js";
import type { Clock, IdGenerator } from "../core/runtime.js";
import { sha256Json } from "../core/runtime.js";
import type { ProfileContextProvider } from "./profile.js";
import { deriveAuthenticatedUserType } from "./profile.js";
import {
  AssistantContextEnvelopeSchema,
  type AssistantContextEnvelope,
} from "./context-envelope.js";

export interface ContextProjectionInput {
  readonly sessionId: string;
  readonly sessionStartedAt: string;
  readonly conversationId: string;
  readonly turnId: string;
  readonly inputSource: AssistantInputSource;
  readonly locale: AssistantLocale;
  readonly userId?: string;
  readonly authenticated: boolean;
  readonly destinationId?: string | null;
  readonly location?: Readonly<{
    latitude: number;
    longitude: number;
    accuracyMeters?: number;
    source: string;
    observedAt: string;
    confidence?: number;
  }> | null;
  readonly map?: Readonly<Record<string, unknown>>;
  readonly explore?: Readonly<Record<string, unknown>>;
  readonly navigation?: Readonly<{ active: boolean; destinationId: string | null; phase: string }>;
  readonly business?: Readonly<Record<string, unknown>>;
  readonly commerce?: Readonly<{
    intent: string | null;
    cartId: string | null;
    orderId: string | null;
  }>;
  readonly ticketing?: Readonly<Record<string, unknown>>;
  readonly payment?: Readonly<{ status: string | null; transactionRef: string | null }>;
  readonly online: boolean;
  readonly timezone: string;
  readonly permissionScopes: readonly string[];
  readonly locationAllowed: boolean;
  readonly profileAllowed: boolean;
  readonly memoryWriteAllowed: boolean;
  readonly availableCapabilities: readonly string[];
  readonly unavailableCapabilities?: readonly string[];
  readonly recentTurnRefs?: readonly string[];
  readonly memoryRefs?: readonly string[];
}

export class AssistantContextAssembler {
  constructor(
    private readonly profileProvider: ProfileContextProvider,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async assemble(
    input: ContextProjectionInput,
  ): Promise<Result<Readonly<AssistantContextEnvelope>>> {
    const profileResult = input.profileAllowed
      ? await this.profileProvider.getProfile({
          ...(input.userId ? { userId: input.userId } : {}),
          localeHint: input.locale,
        })
      : await this.profileProvider.getProfile({ localeHint: input.locale });

    if (!profileResult.ok) return profileResult;

    const now = this.clock.now().toISOString();
    const profile = input.profileAllowed
      ? profileResult.value
      : {
          ...profileResult.value,
          interests: [],
          preferences: {},
          behavioralHints: [],
          recentPlaceIds: [],
          favoritePlaceIds: [],
          durablePreferenceRefs: [],
        };

    const location =
      input.locationAllowed && input.location
        ? {
            latitude: input.location.latitude,
            longitude: input.location.longitude,
            ...(input.location.accuracyMeters !== undefined
              ? { accuracyMeters: input.location.accuracyMeters }
              : {}),
            provenance: {
              source: input.location.source,
              observedAt: input.location.observedAt,
              ...(input.location.confidence !== undefined
                ? { confidence: input.location.confidence }
                : {}),
            },
          }
        : null;

    const base = {
      schemaVersion: "1.0" as const,
      session: { sessionId: input.sessionId, startedAt: input.sessionStartedAt },
      user: {
        ...(input.userId ? { userId: input.userId } : {}),
        userType: deriveAuthenticatedUserType(profile.userType, input.authenticated),
        authenticated: input.authenticated,
      },
      profile: {
        locale: profile.locale,
        interests: profile.interests,
        preferenceHints: profile.behavioralHints,
        favoritePlaceIds: profile.favoritePlaceIds,
      },
      conversation: {
        conversationId: input.conversationId,
        turnId: input.turnId,
        inputSource: input.inputSource,
        locale: input.locale,
        recentTurnRefs: [...(input.recentTurnRefs ?? [])].slice(-12),
      },
      destination: { destinationId: input.destinationId ?? null, locale: input.locale },
      location,
      map: { ...(input.map ?? {}) },
      explore: { ...(input.explore ?? {}) },
      navigation: input.navigation ?? { active: false, destinationId: null, phase: "idle" },
      business: { ...(input.business ?? {}) },
      commerce: input.commerce ?? { intent: null, cartId: null, orderId: null },
      ticketing: { ...(input.ticketing ?? {}) },
      payment: input.payment ?? { status: null, transactionRef: null },
      environment: { online: input.online, timezone: input.timezone },
      permissions: {
        scopes: [...input.permissionScopes],
        locationAllowed: input.locationAllowed,
        profileAllowed: input.profileAllowed,
        memoryWriteAllowed: input.memoryWriteAllowed,
      },
      capabilities: {
        available: [...input.availableCapabilities],
        unavailable: [...(input.unavailableCapabilities ?? [])],
      },
      memory: { refs: [...(input.memoryRefs ?? [])] },
      metadata: {
        assembledAt: now,
        source: "assistant-vnext-context-assembler",
        freshnessSeconds: 0,
        redactions: [
          ...(input.location && !input.locationAllowed ? ["location"] : []),
          ...(!input.profileAllowed ? ["profile"] : []),
        ],
        contextFingerprint: "",
      },
    };

    const fingerprint = sha256Json({
      ...base,
      metadata: { ...base.metadata, contextFingerprint: undefined },
    });
    const candidate = {
      ...base,
      metadata: { ...base.metadata, contextFingerprint: fingerprint },
    };
    const parsed = AssistantContextEnvelopeSchema.safeParse(candidate);
    if (!parsed.success) {
      return err("VALIDATION_FAILED", "ContextEnvelope validation failed", false, {
        issueCount: parsed.error.issues.length,
        assemblyId: this.ids.next("context_error"),
      });
    }
    return ok(Object.freeze(parsed.data));
  }
}
