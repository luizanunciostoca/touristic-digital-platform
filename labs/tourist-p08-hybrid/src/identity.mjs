/** P08 — stable canonical identity and bounded presentation, never name-based writes. */
export const P08_MAX_ITEMS = 120;
const idPattern = /^[a-z0-9][a-z0-9_-]{0,127}$/i;
export function destinationIdOf(value) {
  if (typeof value !== 'string' || !idPattern.test(value)) throw new Error('INVALID_DESTINATION_ID');
  return value.toLowerCase();
}
export function placeIdOf(value) {
  if (typeof value !== 'string' || !idPattern.test(value)) throw new Error('CANONICAL_PLACE_ID_REQUIRED');
  return value;
}
export function safeText(value, length = 140) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, length);
}
export function normalizeSavedItem(raw, destinationId, { source = 'guest' } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('INVALID_SAVED_ITEM');
  const destination = destinationIdOf(destinationId);
  if (raw.destinationId != null && destinationIdOf(raw.destinationId) !== destination) throw new Error('CROSS_DESTINATION_ITEM_DENIED');
  const placeId = placeIdOf(raw.placeId);
  const name = safeText(raw.name);
  if (!name) throw new Error('SAVED_PLACE_NAME_REQUIRED');
  const category = safeText(raw.category ?? '', 64) || null;
  return Object.freeze({ destinationId: destination, placeId, name, category, source });
}
export function normalizeSavedList(items, destinationId, options = {}) {
  if (!Array.isArray(items) || items.length > P08_MAX_ITEMS * 2) throw new Error('SAVED_LIST_INVALID');
  const unique = new Map();
  for (const entry of items) {
    const item = normalizeSavedItem(entry, destinationId, options);
    unique.set(item.placeId, item);
    if (unique.size > P08_MAX_ITEMS) throw new Error('FAVORITES_CAP_EXCEEDED');
  }
  return Object.freeze([...unique.values()]);
}
export function clonePublicItems(items) { return Object.freeze(items.map(item => Object.freeze({ ...item }))); }
export function guestStorageKey(destinationId) { return `md:p08:guest:v1:${destinationIdOf(destinationId)}`; }
export function parseGuestPayload(raw, destinationId) {
  if (typeof raw !== 'string' || raw.length > 55000) throw new Error('INVALID_GUEST_PAYLOAD');
  let envelope;
  try { envelope = JSON.parse(raw); } catch { throw new Error('INVALID_GUEST_JSON'); }
  if (!envelope || envelope.schemaVersion !== 1 || destinationIdOf(envelope.destinationId) !== destinationIdOf(destinationId) || !Number.isSafeInteger(envelope.revision) || envelope.revision < 0) throw new Error('INVALID_GUEST_SCHEMA');
  return Object.freeze({ revision: envelope.revision, items: normalizeSavedList(envelope.items, destinationId, { source: 'guest' }) });
}
export function createGuestPayload(destinationId, revision, items) {
  if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('INVALID_REVISION');
  return JSON.stringify({ schemaVersion: 1, destinationId: destinationIdOf(destinationId), revision, items: normalizeSavedList(items, destinationId, { source: 'guest' }) });
}
