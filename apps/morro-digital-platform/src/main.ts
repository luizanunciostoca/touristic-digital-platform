import { installAssistantSingleMessageController } from "./assistant/assistant-single-message-controller.js";
import { mountAppShell } from "./layouts/app-shell.js";
import { installExploreMapViewportV1 } from "./map/explore-map-viewport-v1.js";
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
  installAssistantSingleMessageController({ document });
  installExploreMapViewportV1({ document });
  const exploreLocations = installExploreLocationsControl({ document });
  installThreeDimensionalMapControl({ document });
  return Object.freeze({ exploreLocations });
}
