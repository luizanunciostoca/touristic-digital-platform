/** P11: never display media from another Place or unverified external source. */
const isSafeReference=(ref)=>typeof ref==='string'&&(ref.startsWith('/')&&!ref.startsWith('//')||/^https:\/\//.test(ref));
export function chooseVerifiedPlaceMedia({placeId,canonical=null,editorial=null,allowedHosts=[]}={}) {
  if(!placeId||typeof placeId!=='string')throw new Error('PLACE_ID_REQUIRED');
  const acceptable=(image,owner)=>image?.placeId===placeId&&isSafeReference(image.providerReference)&&(
    image.providerReference.startsWith('/')||allowedHosts.some(host=>{try{return new URL(image.providerReference).hostname===host}catch{return false}})
  )&&owner;
  const canon=(canonical??[]).filter(x=>acceptable(x,x.authoritative===true));
  if(canon.length)return Object.freeze({status:'canonical',placeId,media:Object.freeze(canon.map(x=>Object.freeze({src:x.providerReference,alt:x.alt?.trim()||'Fotografia do local',source:'canonical'})))});
  const fallbacks=(editorial??[]).filter(x=>acceptable(x,x.editorApproved===true));
  if(fallbacks.length)return Object.freeze({status:'editorial-fallback',placeId,media:Object.freeze(fallbacks.map(x=>Object.freeze({src:x.providerReference,alt:x.alt?.trim()||'Imagem editorial de referência',source:'editorial'}))),notice:'Imagem editorial identificada; cobertura canônica indisponível.'});
  return Object.freeze({status:'media-unavailable',placeId,media:[],notice:'Este local ainda não possui imagens verificadas.'});
}
export function auditMediaCoverage(places,byPlaceId,{allowedHosts=[]}={}) {
  const entries=places.map(place=>chooseVerifiedPlaceMedia({placeId:place.id,canonical:byPlaceId[place.id]?.canonical,editorial:byPlaceId[place.id]?.editorial,allowedHosts}));
  const counts=entries.reduce((x,y)=>(x[y.status]=(x[y.status]??0)+1,x),{'canonical':0,'editorial-fallback':0,'media-unavailable':0});
  return Object.freeze({total:places.length,counts:Object.freeze(counts),entries:Object.freeze(entries),fullyCanonical:counts.canonical===places.length});
}
