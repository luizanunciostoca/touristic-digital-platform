import type {
  MapboxGlMapLike,
  MapboxGlMarkerLike,
  MapboxGlModuleLike,
} from "@touristic/geospatial";

export interface DevelopmentMapElement {
  textContent: string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
}

export interface DevelopmentMapDocument {
  getElementById(id: string): DevelopmentMapElement | null;
}

function formatCoordinates(center: [number, number]): string {
  return `${center[1].toFixed(4)}, ${center[0].toFixed(4)}`;
}

export function createDevelopmentMapboxSdk(
  document: DevelopmentMapDocument,
): MapboxGlModuleLike {
  class DevelopmentMap implements MapboxGlMapLike {
    readonly #element: DevelopmentMapElement;
    #markerCount = 0;
    #active = true;
    #center: [number, number];
    #zoom: number;

    constructor(options: {
      readonly container: string;
      readonly style?: string;
      readonly center: [number, number];
      readonly zoom: number;
    }) {
      const element = document.getElementById(options.container);
      if (!element) {
        throw new Error(
          `Development map container was not found: ${options.container}.`,
        );
      }

      this.#element = element;
      this.#center = options.center;
      this.#zoom = options.zoom;
      this.#element.setAttribute("data-development-map", "true");
      this.#renderCameraState();
      this.#renderMarkerState();
    }

    #renderCameraState(): void {
      this.#element.setAttribute(
        "data-development-center",
        formatCoordinates(this.#center),
      );
      this.#element.setAttribute("data-development-zoom", String(this.#zoom));
    }

    #renderMarkerState(): void {
      this.#element.setAttribute(
        "data-development-marker-count",
        String(this.#markerCount),
      );
      const pointLabel = this.#markerCount === 1 ? "ponto" : "pontos";
      this.#element.textContent = `Mapa de desenvolvimento ativo — Morro de São Paulo — ${this.#markerCount} ${pointLabel}`;
    }

    registerMarker(): () => void {
      if (!this.#active) {
        throw new Error("Development map is no longer active.");
      }

      this.#markerCount += 1;
      this.#renderMarkerState();
      let removed = false;

      return () => {
        if (removed) return;
        removed = true;
        this.#markerCount = Math.max(0, this.#markerCount - 1);
        if (this.#active) this.#renderMarkerState();
      };
    }

    setCenter(center: [number, number]): void {
      this.#center = center;
      this.#renderCameraState();
    }

    easeTo(input: {
      readonly center?: [number, number];
      readonly zoom?: number;
    }): void {
      if (input.center) this.#center = input.center;
      if (Number.isFinite(Number(input.zoom))) this.#zoom = Number(input.zoom);
      this.#renderCameraState();
    }

    remove(): void {
      this.#active = false;
      this.#markerCount = 0;
      this.#element.removeAttribute("data-development-map");
      this.#element.removeAttribute("data-development-center");
      this.#element.removeAttribute("data-development-zoom");
      this.#element.removeAttribute("data-development-marker-count");
      this.#element.textContent = null;
    }
  }

  class DevelopmentMarker implements MapboxGlMarkerLike {
    #removeFromMap: (() => void) | undefined;

    setLngLat(): MapboxGlMarkerLike {
      return this;
    }

    addTo(map: MapboxGlMapLike): MapboxGlMarkerLike {
      if (!(map instanceof DevelopmentMap)) {
        throw new Error("Development marker requires a development map.");
      }

      this.#removeFromMap?.();
      this.#removeFromMap = map.registerMarker();
      return this;
    }

    remove(): void {
      this.#removeFromMap?.();
      this.#removeFromMap = undefined;
    }
  }

  return {
    accessToken: "",
    Map: DevelopmentMap,
    Marker: DevelopmentMarker,
  };
}
