/** P02: composable read model, no fake counts and no browser-inferred authority. */
import { assertReadOnly } from './authority.mjs';
const norm=(v)=>String(v??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').trim().toLocaleLowerCase('pt-BR').replace(/\s+/g,' ');
const key=(place)=>place.id&&place.source==='canonical'?`id:${place.id}`:`name:${norm(place.category)}:${norm(place.name)}`;
const validPlace=(p)=>p&&typeof p.name==='string'&&p.name.trim()&&Number.isFinite(Number(p.lat??p.latitude))&&Number.isFinite(Number(p.lng??p.longitude));
export function mapCameraQuery({destinationId,bbox,zoom,category}={}) {
  if(!/^[a-z0-9][a-z0-9-]*$/.test(destinationId??''))throw new Error('INVALID_DESTINATION');
  if(!Array.isArray(bbox)||bbox.length!==4||bbox.some(x=>!Number.isFinite(x))||bbox[0]>=bbox[2]||bbox[1]>=bbox[3])throw new Error('INVALID_BBOX');
  if(!Number.isFinite(zoom)||zoom<0||zoom>24)throw new Error('INVALID_ZOOM');
  return Object.freeze({destinationId,bbox:Object.freeze([...bbox]),zoom,...(category?{category}:{})});
}
export async function fetchCanonicalCoverage(client,query,{maxPages=20}={}) {
  assertReadOnly('GET');
  if(!client||typeof client.listMap!=='function') throw new Error('CANONICAL_OWNER_CLIENT_REQUIRED');
  if(!Number.isInteger(maxPages)||maxPages<1||maxPages>20) throw new Error('PAGE_LIMIT_INVALID');
  const seen=new Set(),items=[];
  let cursor=null,complete=false,pagesFetched=0;
  for(let index=0;index<maxPages;index++) {
    const response=await client.listMap({...query,...(cursor?{cursor}:{})});
    pagesFetched += 1;
    if(!response||!Array.isArray(response.items))throw new Error('OWNER_INVALID_RESPONSE');
    for(const item of response.items) if(validPlace(item)) items.push(Object.freeze({...item,source:'canonical'}));
    const next=response.nextCursor??null;
    if(!next){complete=true;break}
    if(typeof next!=='string'||seen.has(next))throw new Error('OWNER_PAGINATION_LOOP');
    seen.add(next);cursor=next;
  }
  return Object.freeze({items:Object.freeze(items),complete,pages:pagesFetched,source:'canonical',queried:true});
}
export function reconcileVisiblePlaces({canonical=null,legacy=[],legacyApproved=false,category=null}={}) {
  const safeCanonical=canonical?.items??[];
  const rendered=[],identities=new Set();
  const canonicalNames=new Set(safeCanonical.map(p=>`name:${norm(p.category)}:${norm(p.name)}`));
  for(const item of safeCanonical) {const k=key(item);if(!identities.has(k)){rendered.push(Object.freeze({...item,source:'canonical'}));identities.add(k);}}
  if(legacyApproved){for(const item of legacy){if(!validPlace(item))continue;const lk=`name:${norm(item.category)}:${norm(item.name)}`;if(canonicalNames.has(lk)||identities.has(lk))continue;rendered.push(Object.freeze({...item,source:'legacy',authoritative:false}));identities.add(lk);}}
  const filtered=category?rendered.filter(p=>norm(p.category)===norm(category)):rendered;
  const counts={};for(const p of rendered) counts[p.category]=(counts[p.category]??0)+1;
  return Object.freeze({
    places:Object.freeze(filtered), counts:Object.freeze(counts),
    canonicalCount:safeCanonical.length,legacyCount:rendered.filter(p=>p.source==='legacy').length,
    status: !canonical?.queried? 'unverified' : !canonical.complete?'partial' : safeCanonical.length===0?(rendered.length?'legacy-fallback':'empty'):(rendered.some(p=>p.source==='legacy')?'hybrid':'canonical'),
    verified: Boolean(canonical?.queried&&canonical?.complete&&canonical.items.length>0),
    emptyReason:canonical?.queried&&canonical.complete&&rendered.length===0?'Nenhum local retornado para a área e filtros consultados.':'',
    sourceNotice:rendered.some(p=>p.source==='legacy')?'Parte dos locais vem de dados de compatibilidade e requer revisão.':''
  });
}
export async function safeCanonicalProjection(client,query,{legacy=[],legacyApproved=false}={}) {
  try {const coverage=await fetchCanonicalCoverage(client,query);return reconcileVisiblePlaces({canonical:coverage,legacy,legacyApproved,category:query.category});}
  catch(error){return Object.freeze({...reconcileVisiblePlaces({legacy,legacyApproved,category:query.category}),status:legacyApproved?'degraded':'unavailable',errorCode:error?.message??'OWNER_UNAVAILABLE',verified:false});}
}
