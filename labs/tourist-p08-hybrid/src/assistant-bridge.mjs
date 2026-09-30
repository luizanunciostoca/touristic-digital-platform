/** Existing Assistant intends favorites; this bridge supplies the SAME service projection. */
import { destinationIdOf, placeIdOf, safeText } from './identity.mjs';

export const CONTEXT_ENVELOPE_VERSION = 1;
export function createAssistantSavedContext(service, { destinationId, explicitUserRequest = false } = {}) {
  const snapshot = service?.snapshot?.();
  if (!snapshot || !explicitUserRequest) throw new Error('USER_CONTEXT_CONSENT_REQUIRED');
  if (destinationIdOf(destinationId) !== snapshot.destinationId) throw new Error('CROSS_DESTINATION_CONTEXT_DENIED');
  if (!['ready', 'empty'].includes(snapshot.status)) {
    return Object.freeze({ schemaVersion: CONTEXT_ENVELOPE_VERSION, intent: 'favorites', destinationId: snapshot.destinationId, status: snapshot.status, items: Object.freeze([]), authoritative: false, warning: snapshot.warning ?? null });
  }
  return Object.freeze({
    schemaVersion: CONTEXT_ENVELOPE_VERSION,
    intent: 'favorites',
    destinationId: snapshot.destinationId,
    status: snapshot.status,
    items: Object.freeze(snapshot.items.map(x => Object.freeze({ destinationId: x.destinationId, placeId: x.placeId, name: x.name, category: x.category, source: x.source }))),
    authoritative: snapshot.ownerVerified === true,
    warning: snapshot.ownerVerified ? null : 'Os salvos locais precisam ser confirmados no catálogo antes de iniciar ações reais.'
  });
}
export function resolveFavoriteIntent(input = '') {
  const text = safeText(input, 500).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (!/(salvos?|favorit|guardad|saved|favorites|מועדפ)/u.test(text)) return 'unrelated';
  if (/(mais proxim|perto|nearest|closest|cerca|קרוב)/u.test(text)) return 'nearest';
  if (/(roteiro|route|itiner|ruta|מסלול)/u.test(text)) return 'itinerary';
  return 'list';
}
export function buildSavedAssistantResponse(context, intent, { routeProvider = null, positionConsent = false } = {}) {
  if (!context || context.schemaVersion !== CONTEXT_ENVELOPE_VERSION || !['list', 'nearest', 'itinerary'].includes(intent)) throw new Error('INVALID_ASSISTANT_CONTEXT');
  if (!['ready', 'empty'].includes(context.status)) return Object.freeze({ kind: 'unavailable', canExecute: false, items: [], message: 'Não foi possível consultar seus favoritos.' });
  if (intent === 'list') return Object.freeze({ kind: context.items.length ? 'list' : 'empty', items: context.items, canExecute: false });
  // Never pretend to calculate proximity or route when exact canonical owner / geolocation are absent.
  if (context.authoritative !== true || !routeProvider || (intent === 'nearest' && !positionConsent)) return Object.freeze({ kind: 'need-authority', canExecute: false, items: context.items, message: 'Preciso validar os lugares e, quando necessário, sua localização para fazer isso.' });
  return Object.freeze({ kind: 'owner-handoff-required', canExecute: false, items: context.items, message: 'Serviço autorizado deverá calcular o resultado antes da ação.' });
}
