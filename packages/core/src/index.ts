export type DestinationId = string & { readonly __brand: "DestinationId" };

export interface Coordinates {
  readonly latitude: number;
  readonly longitude: number;
}

export interface DestinationConfig {
  readonly id: DestinationId;
  readonly name: string;
  readonly countryCode: string;
  readonly timezone: string;
  readonly currency: string;
  readonly center: Coordinates;
  readonly radiusMeters: number;
  readonly modules: Readonly<Record<string, boolean>>;
}

export function defineDestination(
  config: DestinationConfig,
): DestinationConfig {
  if (config.radiusMeters <= 0)
    throw new Error("Destination radius must be positive");
  return Object.freeze(config);
}

export {
  createPlatformHealthSnapshot,
  type PlatformHealthCheck,
  type PlatformHealthCheckInput,
  type PlatformHealthCheckStatus,
  type PlatformHealthRuntimeOptions,
  type PlatformHealthSnapshot,
  type PlatformHealthSnapshotInput,
  type PlatformHealthStatus,
  type PlatformReadinessStatus,
} from "./health.js";

export {
  createPlatformEvent,
  createPlatformObservation,
  createPlatformRuntime,
  EventBus,
  ModuleRegistry,
  type DestinationRuntimeConfig,
  type EventBusOptions,
  type EventHandler,
  type PlatformContractRuntimeOptions,
  type PlatformEvent,
  type PlatformEventMetadata,
  type PlatformModule,
  type PlatformObservation,
  type PlatformObservationAttributes,
  type PlatformObservationInput,
  type PlatformObservationKind,
  type PlatformObservationSeverity,
  type PlatformRuntime,
} from "./runtime.js";
