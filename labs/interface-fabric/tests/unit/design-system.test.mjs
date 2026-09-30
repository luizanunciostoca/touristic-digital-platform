import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
const tokens=await readFile(new URL("../../design-system/tokens.css",import.meta.url),"utf8");
const responsive=await readFile(new URL("../../design-system/responsive.css",import.meta.url),"utf8");
const components=await readFile(new URL("../../design-system/components.css",import.meta.url),"utf8");
test("tourist typography token starts with Poppins",()=>assert.match(tokens,/--font-sans:\s*"Poppins"/));
test("minimum touch target is 44px",()=>assert.match(tokens,/--touch:44px/));
test("reduced motion and forced colors are global",()=>{
  assert.match(responsive,/prefers-reduced-motion:reduce/);
  assert.match(responsive,/forced-colors:active/);
});
test("mobile safe viewport uses dvh",()=>assert.match(responsive,/100dvh/));
test("source does not block browser zoom",()=>{
  const all=tokens+responsive+components;
  assert.ok(!/maximum-scale\s*=\s*1/i.test(all));
  assert.ok(!/user-scalable\s*=\s*no/i.test(all));
});
test("new semantic colors live in tokens, not component literals",()=>{
  assert.ok(!/#08252b|#ecfffb|#d9f0e9|#b8ded3|#e7e2c5|#bee0d2|#d8f1e7/.test(components));
});
