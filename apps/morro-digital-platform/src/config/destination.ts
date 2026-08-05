import { defineDestination, type DestinationId } from '@touristic/core';
import { defaultGeospatialPolicy } from '@touristic/geospatial';

export const morroDeSaoPauloDestination = defineDestination({
  id: 'morro-de-sao-paulo' as DestinationId,
  name: 'Morro de São Paulo',
  countryCode: 'BR',
  timezone: 'America/Bahia',
  currency: 'BRL',
  center: {
    latitude: -13.3833,
    longitude: -38.9167,
  },
  radiusMeters: 15_000,
  modules: {
    marketplace: true,
    map: true,
    navigation: true,
    assistant: true,
    businessPortal: true,
    adminCrm: true,
    booking: false,
    payments: false,
    affiliates: false,
  },
});

export const morroDeSaoPauloGeospatialPolicy = defaultGeospatialPolicy;
