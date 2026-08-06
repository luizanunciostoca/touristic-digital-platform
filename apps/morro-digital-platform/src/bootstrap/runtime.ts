import {
  createPlatformRuntime,
  EventBus,
  ModuleRegistry,
  type PlatformModule,
  type PlatformRuntime,
} from "@touristic/platform-runtime";
import { morroDeSaoPauloDestination } from "../config/destination.js";

const geospatialModule: PlatformModule = Object.freeze({
  id: "geospatial",
  version: "0.1.0",
  enabled: true,
});

const marketplaceModule: PlatformModule = Object.freeze({
  id: "marketplace",
  version: "0.1.0",
  dependencies: ["geospatial"],
  enabled: true,
});

export interface BootstrapResult {
  readonly runtime: PlatformRuntime;
  readonly startedModules: readonly string[];
}

export async function bootstrapMorroDigital(): Promise<BootstrapResult> {
  const registry = new ModuleRegistry();
  registry.register(geospatialModule);
  registry.register(marketplaceModule);

  const events = new EventBus();
  const runtime = createPlatformRuntime({
    destination: {
      id: morroDeSaoPauloDestination.id,
      name: morroDeSaoPauloDestination.name,
      locale: "pt-BR",
      enabledModules: ["geospatial", "marketplace"],
    },
    registry,
    events,
  });

  await runtime.events.publish("DestinationLoaded", {
    destinationId: runtime.destination.id,
    modules: runtime.modules.map((module) => module.id),
  });

  return Object.freeze({
    runtime,
    startedModules: Object.freeze(runtime.modules.map((module) => module.id)),
  });
}
