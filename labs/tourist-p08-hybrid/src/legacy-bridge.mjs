/** Existing profile stores favorites by name. Never silently equate a name to a canonical ID. */
import { destinationIdOf, normalizeSavedItem, safeText } from './identity.mjs';
export function inspectLegacyAssistantFavorites(favorites, catalog, destinationId) {
  const target=destinationIdOf(destinationId);
  if (!Array.isArray(favorites) || !Array.isArray(catalog)) throw new Error('LEGACY_INSPECTION_INVALID');
  const approved=[],unresolved=[];
  for (const candidate of favorites) {
    const name=safeText(candidate?.name);
    if (!name) continue;
    const possible=catalog.filter(entry=>entry?.destinationId===target && typeof entry.placeId==='string' && typeof entry.name==='string' && entry.name.trim().toLocaleLowerCase()===name.toLocaleLowerCase());
    if (possible.length!==1) {unresolved.push(Object.freeze({name,reason:possible.length>1?'AMBIGUOUS_NAME':'CANONICAL_MATCH_MISSING'}));continue;}
    approved.push(normalizeSavedItem(possible[0],target,{source:'guest'}));
  }
  return Object.freeze({ importApplied:false, requiresExplicitUserConfirmation:true, candidates:Object.freeze(approved), unresolved:Object.freeze(unresolved) });
}
export function migrationMayApply(report,{userConfirmed=false,stableDestination=false}={}) {
  if (!report?.requiresExplicitUserConfirmation || !userConfirmed || !stableDestination || report.unresolved?.length) throw new Error('LEGACY_MIGRATION_BLOCKED');
  return Object.freeze({ eligible:true, items:report.candidates });
}
