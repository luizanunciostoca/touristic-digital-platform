import assert from "node:assert/strict";
import test from "node:test";
import {can,capabilitiesFor} from "../../src/permissions.js";
test("business roles are least-privilege ordered",()=>{
 assert.equal(can("BUSINESS_OWNER","business.team"),true);
 assert.equal(can("BUSINESS_MANAGER","business.team"),false);
 assert.equal(can("BUSINESS_VIEWER","business.profile"),false);
 assert.equal(can("BUSINESS_VIEWER","business.read"),true);
});
test("public cannot inherit private capabilities",()=>{
 assert.equal(can("PUBLIC","platform.write"),false);
 assert.deepEqual(capabilitiesFor("UNKNOWN"),[]);
});
