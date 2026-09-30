import assert from "node:assert/strict";
import {readFile,readdir,stat} from "node:fs/promises";
import {join,relative} from "node:path";
import test from "node:test";
const rootPath=new URL("../../",import.meta.url).pathname;
async function walk(dir){const out=[];for(const name of await readdir(dir)){const p=join(dir,name);const s=await stat(p);if(s.isDirectory())out.push(...await walk(p));else out.push(p);}return out;}
test("runtime code remains self-contained inside labs/interface-fabric",async()=>{
  const files=(await walk(rootPath)).filter(p=>/\.(html|css|js|mjs)$/.test(p));
  const forbidden=["/apps/morro-digital-platform/","/apps/control-center/","/apps/admin-crm/","/packages/","/services/","/dashboard/"];
  for(const file of files){
    const rel=relative(rootPath,file);
    if(rel.startsWith("tests/")) continue;
    const source=await readFile(file,"utf8");
    for(const marker of forbidden) assert.ok(!source.includes(marker),rel+" references "+marker);
  }
});
