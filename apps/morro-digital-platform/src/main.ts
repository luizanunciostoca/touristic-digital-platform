import { mountAppShell } from "./layouts/app-shell.js";
import { installExploreLocationsControl } from "./map/explore-locations-control.js";
import { installThreeDimensionalMapControl } from "./map/three-dimensional-map-control.js";

export function bootstrapMorroDigitalApplication(document: Document): void {
  mountAppShell({ document });
  installExploreLocationsControl({ document });
  installThreeDimensionalMapControl({ document });
}
