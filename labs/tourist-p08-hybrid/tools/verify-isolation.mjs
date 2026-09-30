/** Run in a Git checkout after commit to verify exactly additive P08 lab changes. */
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const origin='37eb641eefa91f57d8d74c1dc87894c2da36f3ae';
const base='e76cd78775995d15da2419d082f925dad4178446';
const exec=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const head=exec('rev-parse','HEAD');
const baselineIsAncestor=exec('merge-base',base,head)===base;
const scope=exec('diff','--name-only',base,head).split('\n').filter(Boolean);
const outOfScope=scope.filter(file=>!file.startsWith('labs/tourist-p08-hybrid/'));
let mainMatches=null;
try{mainMatches=exec('rev-parse','refs/remotes/origin/main')===origin;}catch{mainMatches=false;}
const existingP08Blob=exec('rev-parse',base+':labs/tourist-ux-p01-p11/src/saved-options.mjs')===exec('rev-parse',head+':labs/tourist-ux-p01-p11/src/saved-options.mjs');
const m=JSON.parse(readFileSync(new URL('../implementation-manifest.json',import.meta.url),'utf8'));
const flagOff=m.featureFlagDefault?.startsWith('OFF');
const pass=baselineIsAncestor&&outOfScope.length===0&&existingP08Blob&&mainMatches&&flagOff&&m.realOwnerBound===false&&m.currentMainModified===false;
console.log(JSON.stringify({pass,head,baseline:base,sourceMainSha:origin,mainMatches,baselineIsAncestor,changeCount:scope.length,outOfScope,previousLabP08Unchanged:existingP08Blob,featureFlagOff:flagOff,ownerMounted:m.realOwnerBound,productionChanged:m.currentMainModified},null,2));
process.exit(pass?0:1);
