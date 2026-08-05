import { describe, expect, it } from 'vitest';

import { defineDestination, type DestinationId } from './index.js';

describe('defineDestination', () => {
  it('freezes a valid destination configuration', () => {
    const destination = defineDestination({
      id: 'test-destination' as DestinationId,
      name: 'Test Destination',
      countryCode: 'BR',
      timezone: 'America/Bahia',
      currency: 'BRL',
      center: { latitude: -13.3833, longitude: -38.9167 },
      radiusMeters: 1_000,
      modules: { map: true },
    });

    expect(destination.id).toBe('test-destination');
    expect(Object.isFrozen(destination)).toBe(true);
  });

  it('rejects a non-positive operating radius', () => {
    expect(() =>
      defineDestination({
        id: 'invalid-destination' as DestinationId,
        name: 'Invalid Destination',
        countryCode: 'BR',
        timezone: 'America/Bahia',
        currency: 'BRL',
        center: { latitude: 0, longitude: 0 },
        radiusMeters: 0,
        modules: {},
      }),
    ).toThrow('Destination radius must be positive');
  });
});
