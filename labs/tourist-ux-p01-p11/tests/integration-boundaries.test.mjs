import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveApprovedLocale,mapCameraQuery,safeCanonicalProjection,
  presentCanonicalPlace,chooseVerifiedPlaceMedia,prepareCommercialCta,
  processCheckoutIntent,captureContinuity,planContinuityTransition,
  offlineDecision,recoveryAfterReconnect,decideSavedIntegration,
  approveHeaderPreview,buildQaMatrix,createPreviewAuthority
} from '../src/index.mjs';

const now=Date.now();
const ownerDetail={
 profile:{id:'place-morro',name:'Local canônico',categoryId:'nightlife',location:{area:'Centro'},shortDescription:'Cobertura parcial'},
 partial:{media:'unavailable',booking:'available'},
 media:{gallery:[]},
 actions:{primaryAction:{id:'nightlife.tickets',label:'Comprar ingresso',value:'owner-only'}}
};

test('P01-P11 combined tourist journey preserves approved UI and owner authority',async()=>{
  const locale=resolveApprovedLocale({browserLanguages:['he-IL'],destinationLocale:'pt-BR'});
  assert.equal(locale.locale,'he-IL');assert.equal(locale.direction,'rtl');
  const query=mapCameraQuery({destinationId:'morro-de-sao-paulo',bbox:[-39.05,-13.5,-38.89,-13.35],zoom:13});
  let reads=0;
  const projection=await safeCanonicalProjection({listMap:async()=>{reads++;return {items:[{id:'place-morro',name:'Local canônico',category:'nightlife',lat:-13.3,lng:-38.9}],nextCursor:null}}},query,{legacyApproved:false});
  assert.equal(reads,1);assert.equal(projection.verified,true);assert.equal(projection.canonicalCount,1);assert.equal(projection.legacyCount,0);
  const place=presentCanonicalPlace(ownerDetail,{locale:locale.locale,categoryLabels:{'he-IL':{nightlife:'חיי לילה'}},capabilities:{}});
  assert.equal(place.category,'חיי לילה');assert.equal(place.status,'partial');assert.equal(place.actions[0].disabled,true);
  const media=chooseVerifiedPlaceMedia({placeId:'place-morro',canonical:[{placeId:'different',providerReference:'/wrong.jpg',authoritative:true}]});
  assert.equal(media.status,'media-unavailable');
  const cta=prepareCommercialCta({mode:'ticketed_admission',owner:{name:'Ticketing',verified:true},capability:{owner:'Ticketing',enabled:true},quote:{owner:'Ticketing',expiresAt:now+60000,amountMinor:12000,currency:'BRL'}});
  assert.equal(cta.enabled,true);assert.equal(cta.canCheckout,false);assert.throws(()=>processCheckoutIntent());
  const source=captureContinuity({mode:'place',category:'nightlife',placeId:'place-morro',locale:locale.locale,camera:{center:[-38.9,-13.3],zoom:13},sheetState:'half',assistantContextId:'fixture-context'});
  const assistant=planContinuityTransition(source,'open-assistant');
  assert.equal(assistant.mode,'assistant');assert.deepEqual(assistant.restore.camera,source.camera);
  const ret=planContinuityTransition({...source,mode:'assistant'},'close-assistant');
  assert.equal(ret.mode,'place');assert.equal(ret.restore.assistantContextId,'fixture-context');
  assert.equal(offlineDecision({online:false,domain:'checkout',method:'POST'}).allow,false);
  assert.equal(recoveryAfterReconnect({wasOffline:true,readbackVerified:false}).allowMutations,false);
  assert.equal(decideSavedIntegration('A').state,'PENDING_VISUAL_CHOICE');
  assert.equal(approveHeaderPreview({baselineCaptured:false,haloConfirmed:true,comparisonReviewed:true}).enable,false);
  const auth=createPreviewAuthority();assert.equal(auth.canMutate(),false);
  const qa=buildQaMatrix({sha:'37eb641eefa91f57d8d74c1dc87894c2da36f3ae'});
  assert.equal(qa.status,'PLANNED_NOT_RUN');
});

test('P02 owner failure cannot fabricate production counts or unauthorized legacy visibility',async()=>{
  const query=mapCameraQuery({destinationId:'morro-de-sao-paulo',bbox:[-39,-13.5,-38.9,-13.4],zoom:13});
  const result=await safeCanonicalProjection({listMap:async()=>{throw new Error('OWNER_DOWN')}},query,{legacy:[{id:'stale',name:'Local desatualizado',category:'nightlife',lat:-13.3,lng:-38.9}],legacyApproved:false});
  assert.equal(result.status,'unavailable');assert.equal(result.verified,false);assert.equal(result.places.length,0);
  assert.equal(prepareCommercialCta({mode:'ticketed_admission'}).enabled,false);
});
