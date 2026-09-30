import assert from "node:assert/strict";
import test from "node:test";
import {FixtureProvider,InterfaceAdapter} from "../../src/adapters.js";
const def={id:"IF-TEST-001"};
test("fixture read is explicitly non-authoritative",async()=>{
 const result=await new FixtureProvider().read(def);
 assert.equal(result.meta.provider,"fixture");
 assert.equal(result.meta.authoritative,false);
});
test("fixture exposes recoverable network/api/timeout failures",async()=>{
 const p=new FixtureProvider();
 await assert.rejects(()=>p.read(def,{state:"network_error"}),/NETWORK_ERROR/);
 await assert.rejects(()=>p.read(def,{state:"api_error"}),/API_ERROR/);
 await assert.rejects(()=>p.read(def,{state:"timeout"}),/TIMEOUT/);
});
test("commands never claim server authority and carry idempotency evidence",async()=>{
 const adapter=new InterfaceAdapter(new FixtureProvider());
 const a=await adapter.command(def,"save",{value:1});
 const b=await adapter.command(def,"save",{value:1});
 assert.equal(a.authoritative,false);
 assert.match(a.idempotencyKey,/^fixture-IF-TEST-001-save-/);
 assert.equal(a.idempotencyKey,b.idempotencyKey);
});
