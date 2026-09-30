/** One collection for Home and Assistant, isolated by destination, with explicit owner/guest modes. */
import { destinationIdOf, placeIdOf, normalizeSavedItem, normalizeSavedList, clonePublicItems, guestStorageKey, parseGuestPayload, createGuestPayload, P08_MAX_ITEMS } from './identity.mjs';

const immutableState = data => Object.freeze({ ...data, items: clonePublicItems(data.items) });
export function createSavedPlacesService({ destinationId, mode = 'guest', storage = null, persistenceConsent = false, owner = null, guestSimulation = false, idFactory = () => globalThis.crypto.randomUUID() } = {}) {
  let destination = destinationIdOf(destinationId), generation = 0, online = true, listeners = new Set(), loaded = false, ownerQueue = Promise.resolve(), guestSessions = new Map();
  if (!['guest', 'owner'].includes(mode)) throw new Error('INVALID_SAVED_MODE');
  let revision = 0;
  let state = immutableState({ destinationId: destination, mode, status: mode === 'owner' ? 'unavailable' : 'empty', items: [], ownerVerified: false, warning: null, revision, online });
  const emit = patch => {
    state = immutableState({ ...state, ...patch });
    for (const listener of [...listeners]) listener(state);
    return state;
  };
  const storagePermitted = () => mode === 'guest' && persistenceConsent && storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function';
  function hydrateGuest() {
    if (!storagePermitted()) { loaded = true; const cached=guestSessions.get(destination); if (cached) {revision=cached.revision;return emit({items:cached.items,revision,status:cached.items.length?'ready':'empty',warning:null});} return state; }
    try {
      const raw = storage.getItem(guestStorageKey(destination));
      if (raw == null) { loaded = true; const cached=guestSessions.get(destination); if (cached) {revision=cached.revision;return emit({items:cached.items,revision,status:cached.items.length?'ready':'empty',warning:null});} return state; }
      const saved = parseGuestPayload(raw, destination);
      revision = saved.revision;
      guestSessions.set(destination,{revision,items:saved.items});
      loaded = true;
      return emit({ status: saved.items.length ? 'ready' : 'empty', items: saved.items, revision, warning: null });
    } catch {
      loaded = true;
      // Corrupt local data is not erased automatically. User may export/resolve in future integration.
      return emit({ status: 'error', warning: 'Os favoritos locais precisam de revisão. Nenhum dado foi apagado.' });
    }
  }
  function commitGuest(items) {
    if (mode !== 'guest') throw new Error('GUEST_ONLY');
    const normalized = normalizeSavedList(items, destination, { source: 'guest' });
    const nextRevision = revision + 1;
    if (storagePermitted()) {
      try {
        const oldPayload = storage.getItem(guestStorageKey(destination));
        if (oldPayload === null && revision > 0) {
          return emit({ status: 'conflict', warning: 'Os favoritos foram alterados em outra aba. Recarregue e revise antes de salvar.' });
        }
        if (oldPayload !== null) {
          const persisted = parseGuestPayload(oldPayload, destination);
          if (persisted.revision !== revision || JSON.stringify(persisted.items) !== JSON.stringify(state.items)) {
            return emit({ status: 'conflict', warning: 'Outra aba alterou seus favoritos. Recarregue e revise antes de salvar.' });
          }
        }
        storage.setItem(guestStorageKey(destination), createGuestPayload(destination, nextRevision, normalized));
      } catch { return emit({ status: 'error', warning: 'Não foi possível salvar neste navegador. Sua seleção anterior foi preservada.' }); }
    }
    revision = nextRevision;
    guestSessions.set(destination,{revision,items:normalized});
    return emit({ items: normalized, revision, status: normalized.length ? 'ready' : 'empty', warning: !persistenceConsent ? 'Salvos nesta sessão demonstrativa; persistência exige sua autorização.' : null, ownerVerified: false });
  }
  async function refresh() {
    if (mode === 'guest') return !loaded ? hydrateGuest() : state;
    if (!owner?.read) return emit({ status: 'unavailable', warning: 'Serviço de favoritos ainda não integrado.' });
    if (!online) return emit({ status: 'offline', ownerVerified: false, warning: 'Sem conexão: a leitura autoritativa não foi executada.' });
    const op = ++generation, target = destination;
    emit({ status: 'loading', warning: null });
    try {
      const data = await owner.read(target);
      if (op !== generation || target !== destination || !online) return state;
      if (!data || data.ownerVerified !== true || destinationIdOf(data.destinationId) !== target || !Array.isArray(data.items) || !Number.isSafeInteger(data.revision)) throw new Error('OWNER_READBACK_NOT_AUTHORITATIVE');
      revision = data.revision;
      return emit({ items: normalizeSavedList(data.items, destination, { source: 'owner' }), status: data.items.length ? 'ready' : 'empty', ownerVerified: true, revision, warning: null });
    } catch (error) {
      if (op !== generation || target !== destination) return state;
      return emit({ status: !online ? 'offline' : 'error', ownerVerified: false, warning: error?.message === 'OWNER_READBACK_NOT_AUTHORITATIVE' ? 'O serviço não confirmou os favoritos.' : 'Os favoritos do servidor não estão disponíveis. Não serão modificados.' });
    }
  }
  async function change(action, candidate) {
    if (action !== 'add' && action !== 'remove') throw new Error('INVALID_SAVED_ACTION');
    const placeId = placeIdOf(candidate?.placeId);
    if (candidate.destinationId != null && destinationIdOf(candidate.destinationId) !== destination) throw new Error('CROSS_DESTINATION_MUTATION_DENIED');
    if (mode === 'guest') {
      if (!loaded) hydrateGuest();
      if (state.status === 'error' || state.status === 'conflict') return state;
      const old = state.items;
      if (action === 'remove') {
        if (!old.some(item => item.placeId === placeId)) return state;
        return commitGuest(old.filter(item => item.placeId !== placeId));
      }
      const item = normalizeSavedItem(candidate, destination, { source: 'guest' });
      if (old.some(entry => entry.placeId === item.placeId)) return state;
      if (old.length >= P08_MAX_ITEMS) return emit({ status: 'error', warning: 'Limite de favoritos alcançado.' });
      return commitGuest([...old, item]);
    }
    if (!online || !owner?.write || !state.ownerVerified) return emit({ status: !online ? 'offline' : 'unavailable', warning: 'Ação bloqueada até confirmação do serviço autorizado.', ownerVerified: false });
    const target = destination;
    const mutation = async () => {
      if (target !== destination) return state;
      if (!state.ownerVerified) return emit({status:'unavailable',warning:'O resultado anterior não foi confirmado. Recarregue antes de tentar novamente.'});
      const op = ++generation;
      emit({ status: 'loading', warning: null });
      try {
        const data = await owner.write({ destinationId: target, placeId, action, idempotencyKey: 'p08-' + idFactory() });
        if (op !== generation || target !== destination || !online) return state;
        if (!data || data.ownerVerified !== true || destinationIdOf(data.destinationId) !== target || !Array.isArray(data.items) || !Number.isSafeInteger(data.revision)) throw new Error('OWNER_READBACK_FAILED');
        const normalized = normalizeSavedList(data.items, destination, { source: 'owner' });
        const included = normalized.some(entry => entry.placeId === placeId);
        if ((action === 'add' && !included) || (action === 'remove' && included)) throw new Error('OWNER_READBACK_DID_NOT_CONFIRM_COMMAND');
        revision = data.revision;
        return emit({ items: normalized, status: normalized.length ? 'ready' : 'empty', ownerVerified: true, warning: null, revision });
      } catch {
        if (op !== generation || target !== destination) return state;
        return emit({ status: 'error', ownerVerified: false, warning: 'Não foi possível confirmar a operação. Recarregue antes de tentar novamente.' });
      }
    };
    ownerQueue = ownerQueue.then(mutation, mutation);
    return ownerQueue;
  }
  return Object.freeze({
    snapshot: () => state,
    subscribe(listener, { immediate = true } = {}) {
      if (typeof listener !== 'function') throw new Error('LISTENER_REQUIRED');
      listeners.add(listener); if (immediate) listener(state);
      return () => listeners.delete(listener);
    },
    refresh,
    add(item) { return change('add', item); },
    remove(input) { return change('remove', input); },
    async switchDestination(next) {
      const id = destinationIdOf(next);
      if (id === destination) return state;
      if (mode === 'guest' && loaded && ['ready','empty'].includes(state.status)) guestSessions.set(destination,{revision,items:state.items});
      generation += 1; destination = id; revision = 0; loaded = false;
      emit({ destinationId: id, items: [], revision, ownerVerified: false, status: mode === 'owner' ? 'unavailable' : 'empty', warning: null });
      return refresh();
    },
    setOnline(value) { online = Boolean(value); return emit({ online, ...(online || mode === 'guest' ? {} : { status: 'offline', ownerVerified: false }) }); },
    importGuestStorageEvent(event) {
      if (!storagePermitted() || event?.key !== guestStorageKey(destination) || typeof event.newValue !== 'string') return state;
      try {
        const incoming = parseGuestPayload(event.newValue, destination);
        if (incoming.revision < revision) return state;
        if (incoming.revision === revision) {
          if (JSON.stringify(incoming.items) !== JSON.stringify(state.items)) return emit({ status: 'conflict', warning: 'Outra aba alterou seus favoritos. Revise antes de salvar novamente.' });
          return state;
        }
        revision = incoming.revision;
        guestSessions.set(destination,{revision,items:incoming.items});
        return emit({ items: incoming.items, status: incoming.items.length ? 'ready' : 'empty', revision, warning: null });
      } catch { return state; }
    },
    destroy() { listeners.clear(); generation += 1; },
    get persistenceConsent() { return Boolean(persistenceConsent); }
  });
}
