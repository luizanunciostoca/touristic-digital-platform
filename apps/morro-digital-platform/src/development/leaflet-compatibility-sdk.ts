import type {
  MapboxGlMapLike,
  MapboxGlMarkerLike,
  MapboxGlModuleLike,
} from "@touristic/geospatial";

interface LeafletMapLike {
  setView(center: [number, number], zoom?: number, options?: object): this;
  remove(): void;
}

interface LeafletLayerLike {
  addTo(map: LeafletMapLike): this;
}

interface LeafletMarkerLike extends LeafletLayerLike {
  setLatLng(position: [number, number]): this;
  remove(): void;
}

interface LeafletNamespaceLike {
  map(container: string, options?: object): LeafletMapLike;
  tileLayer(url: string, options?: object): LeafletLayerLike;
  marker(position: [number, number], options?: object): LeafletMarkerLike;
  divIcon?(options: { readonly html: string; readonly className: string }): object;
}

export interface LeafletCompatibilityWindow {
  readonly L?: LeafletNamespaceLike;
}

function toLeafletCoordinates(position: [number, number]): [number, number] {
  return [position[1], position[0]];
}

export function hasLeafletCompatibilitySdk(
  window: LeafletCompatibilityWindow,
): boolean {
  return Boolean(window.L);
}

export function createLeafletCompatibilitySdk(
  window: LeafletCompatibilityWindow,
): MapboxGlModuleLike {
  const leaflet = window.L;
  if (!leaflet) {
    throw new Error("Leaflet compatibility runtime is not available.");
  }

  class LeafletCompatibilityMap implements MapboxGlMapLike {
    readonly nativeMap: LeafletMapLike;
    readonly zoom: number;

    constructor(options: {
      readonly container: string;
      readonly style?: string;
      readonly center: [number, number];
      readonly zoom: number;
    }) {
      this.zoom = options.zoom;
      this.nativeMap = leaflet
        .map(options.container, { zoomControl: false })
        .setView(toLeafletCoordinates(options.center), options.zoom);

      leaflet
        .tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        })
        .addTo(this.nativeMap);
    }

    setCenter(center: [number, number]): void {
      this.nativeMap.setView(toLeafletCoordinates(center), this.zoom, {
        animate: false,
      });
    }

    remove(): void {
      this.nativeMap.remove();
    }
  }

  class LeafletCompatibilityMarker implements MapboxGlMarkerLike {
    readonly #element: HTMLElement | undefined;
    #position: [number, number] = [0, 0];
    #marker: LeafletMarkerLike | undefined;

    constructor(options?: { readonly element?: HTMLElement }) {
      this.#element = options?.element;
    }

    setLngLat(coordinates: [number, number]): MapboxGlMarkerLike {
      this.#position = coordinates;
      this.#marker?.setLatLng(toLeafletCoordinates(coordinates));
      return this;
    }

    addTo(map: MapboxGlMapLike): MapboxGlMarkerLike {
      if (!(map instanceof LeafletCompatibilityMap)) {
        throw new Error("Leaflet marker requires a Leaflet compatibility map.");
      }

      this.#marker?.remove();
      const icon =
        this.#element && leaflet.divIcon
          ? leaflet.divIcon({
              html: this.#element.outerHTML,
              className: "morro-leaflet-compatibility-marker",
            })
          : undefined;
      this.#marker = leaflet.marker(toLeafletCoordinates(this.#position),
        icon ? { icon } : undefined,
      );
      this.#marker.addTo(map.nativeMap);
      return this;
    }

    remove(): void {
      this.#marker?.remove();
      this.#marker = undefined;
    }
  }

  return {
    accessToken: "",
    Map: LeafletCompatibilityMap,
    Marker: LeafletCompatibilityMarker,
  };
}
