/** Fail closed on incompatible source drift or any changes outside the isolated P08 folder. */
import { existsSync,readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const source='37eb641eefa91f57d8d74c1dc87894c2da36f3ae';
const parent='e76cd78775995d15da2419d082f925dad4178446';
const labPrefix='labs/tourist-p08-hybrid/';
const required=[
 ['apps/morro-digital-platform/src/home/home-discover-navigation.ts','morro:assistant-option-selected'],
 ['apps/morro-digital-platform/src/assistant/assistant-domain-adapter.ts','favoriteOperationFromInput'],
 ['packages/assistant/src/user-profile.ts','favoritePlaces'],
 ['apps/morro-digital-platform/src/ux/tourist-experience-snapshot.ts','TOURIST_EXPERIENCE_SNAPSHOT_STORAGE_KEY'],
 ['apps/morro-digital-platform/src/map/place-bottom-sheet.ts','PlaceBottomSheetState'],
 ['apps/morro-digital-platform/public/tourist-shell-v2.css','.md-home-header'],
 ];
const run=(...cmd)=>execFileSync('git',cmd,{cwd:root,encoding:'utf8'}).trim();
const current=run('rev-parse','HEAD');
const branchChanges=run('diff','--name-only',parent,current).split('
').filter(Boolean);
const violations=branchChanges.filter(path=>!path.startsWith(labPrefix));
const main=run('rev-parse','refs/remotes/origin/main');
const baseSourceIsAncestor=run('merge-base',source,current)===source;
const parentIsAncestor=run('merge-base',parent,current)===parent;
const sourceBindings=required.map(([path,token])=>({path,exists:existsSync(resolve(root,path)),tokenPresent:existsSync(resolve(root,path))&&readFileSync(resolve(root,path),'utf8').includes(token)}));
const result={head:current,sourceMainSha:source,observedRemoteMainSha:main,unchangedMain:main===source,baseSourceIsAncestor,parentIsAncestor,totalChangedFiles:branchChanges.length,onlyNewIsolatedFiles:violations.length===0,violations,sourceBindings,allSourceBindingsPresent:sourceBindings.every(x=>x.tokenPresent)};
result.pass=result.unchangedMain&&baseSourceIsAncestor&&parentIsAncestor&&result.onlyNewIsolatedFiles&&result.allSourceBindingsPresent;
console.log(JSON.stringify(result,null,2));
if(!result.pass)process.exitCode=1;
