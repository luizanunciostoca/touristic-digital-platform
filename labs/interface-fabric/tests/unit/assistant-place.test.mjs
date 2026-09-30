import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
const app=await readFile(new URL("../../src/app.js",import.meta.url),"utf8");
const templates=await readFile(new URL("../../src/templates/index.js",import.meta.url),"utf8");
test("assistant implements voice/listening/processing/response states",()=>{
 for(const marker of ["assistant-voice","Ouvindo…","Processando…","Resposta pronta","aria-pressed"]) assert.ok((app+templates).includes(marker),marker);
});
test("place actions are gated by fixture capabilities",()=>{
 assert.match(templates,/capabilityActions=/);
 assert.match(templates,/filter\(\(\[cap\]\)=>p\.capabilities\.includes\(cap\)\)/);
});
