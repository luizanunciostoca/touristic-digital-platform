export interface PlatformEvent<TPayload = unknown> {
  readonly eventId: string;
  readonly type: string;
  readonly version: number;
  readonly payload: TPayload;
  readonly occurredAt: string;
  readonly destinationId: string;
  readonly tenantId?: string;
  readonly correlationId: string;
  readonly causationId?: string;
}

export interface PlatformEventMetadata {
  readonly eventId?: string;
  readonly version?: number;
  readonly occurredAt?: string;
  readonly destinationId?: string;
  readonly tenantId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;
}

export type PlatformObservationKind =
  "log" | "metric" | "trace" | "audit" | "alert";

export type PlatformObservationSeverity =
  "debug" | "info" | "warn" | "error" | "critical";

export type PlatformObservationAttributes = Readonly<
  Record<string, string | number | boolean | null>
>;

export interface PlatformObservation {
  readonly observationId: string;
  readonly kind: PlatformObservationKind;
  readonly name: string;
  readonly severity: PlatformObservationSeverity;
  readonly occurredAt: string;
  readonly destinationId: string;
  readonly tenantId?: string;
  readonly correlationId: string;
  readonly causationId?: string;
  readonly attributes: PlatformObservationAttributes;
}

export interface PlatformObservationInput {
  readonly observationId?: string;
  readonly kind: PlatformObservationKind;
  readonly name: string;
  readonly severity: PlatformObservationSeverity;
  readonly occurredAt?: string;
  readonly destinationId: string;
  readonly tenantId?: string;
  readonly correlationId: string;
  readonly causationId?: string;
  readonly attributes?: PlatformObservationAttributes;
}

export interface PlatformContractRuntimeOptions {
  readonly createId?: (prefix: "evt" | "corr" | "obs") => string;
  readonly now?: () => string;
}

export interface EventBusOptions extends PlatformContractRuntimeOptions {
  readonly destinationId?: string;
  readonly tenantId?: string;
}

export type EventHandler<TPayload = unknown> = (
  event: PlatformEvent<TPayload>,
) => void | Promise<void>;

const MAX_CONTEXT_LENGTH = 160;
const MAX_EVENT_TYPE_LENGTH = 160;
const MAX_OBSERVATION_NAME_LENGTH = 200;
const OBSERVATION_KINDS = new Set<PlatformObservationKind>([
  "log",
  "metric",
  "trace",
  "audit",
  "alert",
]);
const OBSERVATION_SEVERITIES = new Set<PlatformObservationSeverity>([
  "debug",
  "info",
  "warn",
  "error",
  "critical",
]);

function requireBoundedString(
  value: string | undefined,
  field: string,
  maxLength = MAX_CONTEXT_LENGTH,
): string {
  if (typeof value !== "string") throw new Error(`${field} is required.`);
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} is required.`);
  if (normalized.length > maxLength) {
    throw new Error(`${field} exceeds ${maxLength} characters.`);
  }
  return normalized;
}

function requirePositiveVersion(value: number | undefined): number {
  const version = value ?? 1;
  if (!Number.isSafeInteger(version) || version <= 0) {
    throw new Error("Event version must be a positive safe integer.");
  }
  return version;
}

function requireIsoTimestamp(value: string, field: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new Error(`${field} must be ISO-8601.`);
  }
  return value;
}

function requireObservationKind(
  value: PlatformObservationKind,
): PlatformObservationKind {
  if (!OBSERVATION_KINDS.has(value)) {
    throw new Error("Observation kind is invalid.");
  }
  return value;
}

function requireObservationSeverity(
  value: PlatformObservationSeverity,
): PlatformObservationSeverity {
  if (!OBSERVATION_SEVERITIES.has(value)) {
    throw new Error("Observation severity is invalid.");
  }
  return value;
}

function freezeObservationAttributes(
  attributes: PlatformObservationAttributes | undefined,
): PlatformObservationAttributes {
  const normalized: Record<string, string | number | boolean | null> = {};

  for (const [key, value] of Object.entries(attributes ?? {})) {
    const normalizedKey = requireBoundedString(
      key,
      "Observation attribute key",
      MAX_CONTEXT_LENGTH,
    );
    const isPrimitive =
      value === null ||
      typeof value === "string" ||
      typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value));
    if (!isPrimitive) {
      throw new Error(
        `Observation attribute ${normalizedKey} must be primitive.`,
      );
    }
    normalized[normalizedKey] = value;
  }

  return Object.freeze(normalized);
}

function createSecureId(prefix: "evt" | "corr" | "obs"): string {
  if (typeof globalThis.crypto?.randomUUID !== "function") {
    throw new Error(
      "Secure randomUUID support is required for platform contracts.",
    );
  }
  return `${prefix}_${globalThis.crypto.randomUUID()}`;
}

function resolveRuntimeOptions(
  options: PlatformContractRuntimeOptions,
): Required<PlatformContractRuntimeOptions> {
  return {
    createId: options.createId ?? createSecureId,
    now: options.now ?? (() => new Date().toISOString()),
  };
}

export function createPlatformEvent<TPayload>(
  type: string,
  payload: TPayload,
  metadata: PlatformEventMetadata = {},
  options: PlatformContractRuntimeOptions = {},
): PlatformEvent<TPayload> {
  const runtime = resolveRuntimeOptions(options);
  const destinationId = requireBoundedString(
    metadata.destinationId,
    "Event destinationId",
  );
  const occurredAt = requireIsoTimestamp(
    metadata.occurredAt ?? runtime.now(),
    "Event occurredAt",
  );

  return Object.freeze({
    eventId: requireBoundedString(
      metadata.eventId ?? runtime.createId("evt"),
      "Event eventId",
    ),
    type: requireBoundedString(type, "Event type", MAX_EVENT_TYPE_LENGTH),
    version: requirePositiveVersion(metadata.version),
    payload,
    occurredAt,
    destinationId,
    ...(metadata.tenantId
      ? {
          tenantId: requireBoundedString(metadata.tenantId, "Event tenantId"),
        }
      : {}),
    correlationId: requireBoundedString(
      metadata.correlationId ?? runtime.createId("corr"),
      "Event correlationId",
    ),
    ...(metadata.causationId
      ? {
          causationId: requireBoundedString(
            metadata.causationId,
            "Event causationId",
          ),
        }
      : {}),
  });
}

export function createPlatformObservation(
  input: PlatformObservationInput,
  options: PlatformContractRuntimeOptions = {},
): PlatformObservation {
  const runtime = resolveRuntimeOptions(options);
  const attributes = freezeObservationAttributes(input.attributes);

  return Object.freeze({
    observationId: requireBoundedString(
      input.observationId ?? runtime.createId("obs"),
      "Observation observationId",
    ),
    kind: requireObservationKind(input.kind),
    name: requireBoundedString(
      input.name,
      "Observation name",
      MAX_OBSERVATION_NAME_LENGTH,
    ),
    severity: requireObservationSeverity(input.severity),
    occurredAt: requireIsoTimestamp(
      input.occurredAt ?? runtime.now(),
      "Observation occurredAt",
    ),
    destinationId: requireBoundedString(
      input.destinationId,
      "Observation destinationId",
    ),
    ...(input.tenantId
      ? {
          tenantId: requireBoundedString(
            input.tenantId,
            "Observation tenantId",
          ),
        }
      : {}),
    correlationId: requireBoundedString(
      input.correlationId,
      "Observation correlationId",
    ),
    ...(input.causationId
      ? {
          causationId: requireBoundedString(
            input.causationId,
            "Observation causationId",
          ),
        }
      : {}),
    attributes,
  });
}

export interface PlatformModule {
  readonly id: string;
  readonly version: string;
  readonly dependencies?: readonly string[];
  readonly enabled: boolean;
}

export interface DestinationRuntimeConfig {
  readonly id: string;
  readonly name: string;
  readonly locale: string;
  readonly enabledModules: readonly string[];
}

export class EventBus {
  readonly #handlers = new Map<string, Set<EventHandler>>();
  readonly #destinationId: string | undefined;
  readonly #tenantId: string | undefined;
  readonly #runtimeOptions: PlatformContractRuntimeOptions;

  constructor(options: EventBusOptions = {}) {
    this.#destinationId = options.destinationId;
    this.#tenantId = options.tenantId;
    this.#runtimeOptions = Object.freeze({
      ...(options.createId ? { createId: options.createId } : {}),
      ...(options.now ? { now: options.now } : {}),
    });
  }

  subscribe<TPayload>(
    type: string,
    handler: EventHandler<TPayload>,
  ): () => void {
    const handlers = this.#handlers.get(type) ?? new Set<EventHandler>();
    handlers.add(handler as EventHandler);
    this.#handlers.set(type, handlers);

    return () => handlers.delete(handler as EventHandler);
  }

  async publish<TPayload>(
    type: string,
    payload: TPayload,
    metadata: PlatformEventMetadata = {},
  ): Promise<void> {
    const destinationId = metadata.destinationId ?? this.#destinationId;
    const tenantId = metadata.tenantId ?? this.#tenantId;
    const resolvedMetadata: PlatformEventMetadata = {
      ...metadata,
      ...(destinationId ? { destinationId } : {}),
      ...(tenantId ? { tenantId } : {}),
    };
    const event = createPlatformEvent(
      type,
      payload,
      resolvedMetadata,
      this.#runtimeOptions,
    );

    const handlers = [...(this.#handlers.get(type) ?? [])];
    await Promise.all(
      handlers.map((handler) => Promise.resolve(handler(event))),
    );
  }
}

export class ModuleRegistry {
  readonly #modules = new Map<string, PlatformModule>();

  register(module: PlatformModule): void {
    if (!module.id.trim()) throw new Error("Module id is required.");
    if (this.#modules.has(module.id)) {
      throw new Error(`Module already registered: ${module.id}`);
    }

    const dependencies = module.dependencies
      ? Object.freeze([...module.dependencies])
      : undefined;

    this.#modules.set(
      module.id,
      Object.freeze({
        ...module,
        ...(dependencies ? { dependencies } : {}),
      }),
    );
  }

  resolveEnabled(config: DestinationRuntimeConfig): readonly PlatformModule[] {
    const enabled = new Set(config.enabledModules);
    const modules = [...this.#modules.values()].filter(
      (module) => module.enabled && enabled.has(module.id),
    );

    for (const module of modules) {
      for (const dependency of module.dependencies ?? []) {
        if (!modules.some((candidate) => candidate.id === dependency)) {
          throw new Error(
            `Module ${module.id} requires unavailable dependency ${dependency}.`,
          );
        }
      }
    }

    return Object.freeze(modules);
  }
}

export interface PlatformRuntime {
  readonly destination: DestinationRuntimeConfig;
  readonly modules: readonly PlatformModule[];
  readonly events: EventBus;
}

export function createPlatformRuntime(input: {
  readonly destination: DestinationRuntimeConfig;
  readonly registry: ModuleRegistry;
  readonly events?: EventBus;
}): PlatformRuntime {
  if (!input.destination.id.trim()) {
    throw new Error("Destination id is required.");
  }

  const destination = Object.freeze({
    ...input.destination,
    enabledModules: Object.freeze([...input.destination.enabledModules]),
  });

  return Object.freeze({
    destination,
    modules: input.registry.resolveEnabled(destination),
    events: input.events ?? new EventBus({ destinationId: destination.id }),
  });
}
