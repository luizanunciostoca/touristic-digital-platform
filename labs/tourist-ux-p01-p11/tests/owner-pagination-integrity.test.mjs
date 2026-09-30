import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchCanonicalCoverage,safeCanonicalProjection} from '../src/canonical-places.mjs';
const q={destinationId:'morro-de-sao-paulo',bbox:[-39.05,-13.5,-38.89,-13.35],zoom:13};

test('P02 paginated owner read reports actual pages at maxPages cap',async()=>{
  const source={listMap:async()=>({items:[{id:'p1',name:'Primeira Praia',category:'beaches',lat:-13.4,lng:-38.9}],nextCursor:'more'})};
  const r=await fetchCanonicalCoverage(source,q,{maxPages:1});
  assert.equal(r.pages,1);assert.equal(r.complete,false);assert.equal(r.items.length,1);
});

test('P02 duplicate owner IDs across pages never inflate visible category or canonical totals',async()=>{
  let calls=0;
  const owner={listMap:async()=>{calls++;return {items:[{id:'p1',name:'Primeira Praia',category:'beaches',lat:-13.4,lng:-38.9}],nextCursor:calls===1?'next':null}}};
  const r=await safeCanonicalProjection(owner,q,{legacyApproved:true,legacy:[{name:'Primeira Praia',category:'beaches',lat:-13.4,lng:-38.9}]});
  assert.equal(calls,2);assert.equal(r.places.length,1);assert.equal(r.canonicalCount,1);assert.equal(r.counts.beaches,1);assert.equal(r.legacyCount,0);
});

test('P02 malformed coordinate types are not treated as zero and no phantom marker is shown',async()=>{
  const owner={listMap:async()=>({items:[{id:'invalid',name:'Fake',category:'beaches',lat:'',lng:-38.9}],nextCursor:null})};
  const r=await safeCanonicalProjection(owner,q);
  assert.equal(r.verified,false);assert.equal(r.places.length,0);assert.equal(r.canonicalCount,0);
});