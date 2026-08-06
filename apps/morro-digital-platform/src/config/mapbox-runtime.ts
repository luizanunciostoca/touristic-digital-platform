export interface MorroMapboxRuntimeConfig {
  readonly accessToken: string;
  readonly containerId: string;
  readonly style: string;
  readonly zoom: number;
}

export type RuntimeEnvironment = Readonly<Record<string, string | undefined>>;

const environmentKeys = Object.freeze({
  accessToken: "VITE_MAPBOX_ACCESS_TOKEN",
  containerId: "VITE_MAPBOX_CONTAINER_ID",
  style: "VITE_MAPBOX_STYLE",
  zoom: "VITE_MAPBOX_INITIAL_ZOOM",
});

function requireEnvironmentValue(
  environment: RuntimeEnvironment,
  key: string,
): string {
  const value = environment[key]?.trim();
  if (!value) throw new Error(`Required environment variable is missing: ${key}.`);
  return value;
}

function parseZoom(value: string): number {
  const zoom = Number(value);
  if (!Number.isFinite(zoom) || zoom < 0 || zoom > 24) {
    throw new Error(`${environmentKeys.zoom} must be between 0 and 24.`);
  }
  return zoom;
}

export function loadMorroMapboxRuntimeConfig(
  environment: RuntimeEnvironment,
): MorroMapboxRuntimeConfig {
  return Object.freeze({
    accessToken: requireEnvironmentValue(
      environment,
      environmentKeys.accessToken,
    ),
    containerId: requireEnvironmentValue(
      environment,
      environmentKeys.containerId,
    ),
    style: requireEnvironmentValue(environment, environmentKeys.style),
    zoom: parseZoom(requireEnvironmentValue(environment, environmentKeys.zoom)),
  });
}
