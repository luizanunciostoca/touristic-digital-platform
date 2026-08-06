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
      this.#element.setAttribute("data-development-map", "true");
      this.#element.setAttribute(
        "data-development-center",
        formatCoordinates(options.center),
      );
      this.#element.setAttribute(
        "data-development-zoom",
        String(options.zoom),
      );
      this.#element.textContent =
        "Mapa de desenvolvimento ativo — Morro de São Paulo";
    }

    setCenter(center: [number, number]): void {
      this.#element.setAttribute(
        "data-development-center",
        formatCoordinates(center),
      );
    }

    remove(): void {
      this.#element.removeAttribute("data-development-map");
      this.#element.removeAttribute("data-development-center");
      this.#element.removeAttribute("data-development-zoom");
      this.#element.textContent = null;
    }
  }

  class DevelopmentMarker implements MapboxGlMarkerLike {
    setLngLat(): MapboxGlMarkerLike {
      return this;
    }

    addTo(): MapboxGlMarkerLike {
      return this;
    }

    remove(): void {}
  }

  return {
    accessToken: "",
    Map: DevelopmentMap,
    Marker: DevelopmentMarker,
  };
}
