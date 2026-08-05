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
