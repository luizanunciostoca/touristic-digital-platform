/** Explicit owner boundary; no implementation automatically calls a real endpoint. */
import { destinationIdOf, placeIdOf, normalizeSavedList } from './identity.mjs';
export function validateOwnerProjection(response, destinationId) {
  if (!response || typeof response !== 'object' || response.ownerVerified !== true || destinationIdOf(response.destinationId) !== destinationIdOf(destinationId) || !Number.isSafeInteger(response.revision) || response.revision < 0) throw new Error('OWNER_READBACK_NOT_AUTHORITATIVE');
  return Object.freeze({ ownerVerified: true, destinationId: destinationIdOf(destinationId), revision: response.revision, items: normalizeSavedList(response.items, destinationId, { source: 'owner' }) });
}
export function buildOwnerCommand({ destinationId, placeId, action, idempotencyKey, auth, featureEnabled = false, online = true }) {
  if (!featureEnabled || !online || auth?.capability !== 'favorites.write' || auth?.authorized !== true || typeof auth?.csrf !== 'string' || auth.csrf.length < 8 || !/^p08-[a-z0-9-]{12,80}$/i.test(idempotencyKey ?? '')) throw new Error('OWNER_WRITE_NOT_AUTHORIZED');
  if (action !== 'add' && action !== 'remove') throw new Error('INVALID_SAVED_ACTION');
  return Object.freeze({ destinationId: destinationIdOf(destinationId), placeId: placeIdOf(placeId), action, idempotencyKey, csrf: auth.csrf });
}
export function createOwnerBoundary({ read, command, enabled = false, auth, online = () => true } = {}) {
  return Object.freeze({
    async read(destinationId, { signal } = {}) {
      if (typeof read !== 'function') throw new Error('OWNER_READ_BINDING_MISSING');
      return validateOwnerProjection(await read(destinationId, { signal }), destinationId);
    },
    async write(input) {
      const safe = buildOwnerCommand({ ...input, featureEnabled: enabled, auth, online: online() });
      if (typeof command !== 'function') throw new Error('OWNER_COMMAND_BINDING_MISSING');
      // Provider response is deliberately ignored; only an independent owner readback may confirm the UI.
      await command(safe);
      return this.read(safe.destinationId);
    }
  });
}
