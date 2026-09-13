import { mountAppShell } from "./layouts/app-shell.js";
import { installExploreLocationsControl } from "./map/explore-locations-control.js";

export function bootstrapMorroDigitalApplication(document: Document): void {
  mountAppShell({ document });
  installExploreLocationsControl({ document });
}
