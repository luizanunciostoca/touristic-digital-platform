import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
const css=await readFile(new URL("../../design-system/components.css",import.meta.url),"utf8");
test("breadcrumb links preserve the 44px touch target",()=>{
 assert.match(css,/\.breadcrumbs a\{[^}]*min-width:var\(--touch\);[^}]*min-height:var\(--touch\)/);
});
