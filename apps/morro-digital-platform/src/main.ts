import { mountAppShell } from "./layouts/app-shell.js";
import {
  installExploreLocationsControl,
  type ExploreLocationsControl,
} from "./map/explore-locations-control.js";
import { installThreeDimensionalMapControl } from "./map/three-dimensional-map-control.js";

export interface MorroDigitalApplicationBootstrap {
  readonly exploreLocations: ExploreLocationsControl;
}

export function bootstrapMorroDigitalApplication(
  document: Document,
): MorroDigitalApplicationBootstrap {
  mountAppShell({ document });
  const exploreLocations = installExploreLocationsControl({ document });
  installThreeDimensionalMapControl({ document });
  return Object.freeze({ exploreLocations });
}
