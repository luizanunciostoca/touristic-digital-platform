import type { MapMarker } from "@touristic/geospatial";

function defineMapMarker(marker: MapMarker): MapMarker {
  return Object.freeze({
    ...marker,
    position: Object.freeze({ ...marker.position }),
  });
}

export const morroInitialMapMarkers: readonly MapMarker[] = Object.freeze([
  defineMapMarker({
    id: "terceira-praia",
    label: "Partida: Terceira Praia",
    position: {
      latitude: -13.3839443,
      longitude: -38.9084472,
    },
  }),
  defineMapMarker({
    id: "fonte-grande",
    label: "Início: Fonte Grande",
    position: {
      latitude: -13.376543,
      longitude: -38.918765,
    },
  }),
  defineMapMarker({
    id: "retorno-por-do-sol",
    label: "Retorno no Pôr do Sol",
    position: {
      latitude: -13.376845,
      longitude: -38.917543,
    },
  }),
]);
