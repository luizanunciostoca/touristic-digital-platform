export interface PlatformEvent<TPayload = unknown> {
  readonly type: string;
  readonly payload: TPayload;
  readonly occurredAt: string;
}

export type EventHandler<TPayload = unknown> = (
  event: PlatformEvent<TPayload>,
) => void | Promise<void>;

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

  subscribe<TPayload>(
    type: string,
    handler: EventHandler<TPayload>,
  ): () => void {
    const handlers = this.#handlers.get(type) ?? new Set<EventHandler>();
    handlers.add(handler as EventHandler);
    this.#handlers.set(type, handlers);

    return () => handlers.delete(handler as EventHandler);
  }

  async publish<TPayload>(type: string, payload: TPayload): Promise<void> {
    const event: PlatformEvent<TPayload> = Object.freeze({
      type,
      payload,
      occurredAt: new Date().toISOString(),
    });

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
  if (!input.destination.id.trim())
    throw new Error("Destination id is required.");

  const destination = Object.freeze({
    ...input.destination,
    enabledModules: Object.freeze([...input.destination.enabledModules]),
  });

  return Object.freeze({
    destination,
    modules: input.registry.resolveEnabled(destination),
    events: input.events ?? new EventBus(),
  });
}
