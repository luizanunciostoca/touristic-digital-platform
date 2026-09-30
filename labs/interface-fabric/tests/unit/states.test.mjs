import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
const app=await readFile(new URL("../../src/app.js",import.meta.url),"utf8");
const components=await readFile(new URL("../../src/components.js",import.meta.url),"utf8");
test("system and transaction states are complete",()=>{
 for(const state of ["loading","skeleton","empty","populated","success","warning","partial","disabled","unauthorized","forbidden","session_expired","suspended","rate_limit","offline","network_error","api_error","internal_error","service_unavailable","maintenance","timeout","validation_error","stale_data","idle","pending","processing","confirmed","failed","cancelled","reversed"]) {
   assert.ok(app.includes('"'+state+'"'),"app:"+state);
   assert.ok(components.includes(state+':'),"component:"+state);
 }
});
