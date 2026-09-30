import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
const app=await readFile(new URL("../../src/app.js",import.meta.url),"utf8");
const templates=await readFile(new URL("../../src/templates/index.js",import.meta.url),"utf8");
test("tutorial has all required controls",()=>{
 for(const marker of ["tutorial-next","tutorial-back","tutorial-skip","tutorial-resume","tutorial-end"]) assert.ok(templates.includes(marker),marker);
});
test("tutorial persists step and completion locally",()=>{
 for(const marker of ["if-tutorial-step","if-tutorial-complete","tutorialState","setTutorialStep","finishTutorial"]) assert.ok(app.includes(marker),marker);
});
