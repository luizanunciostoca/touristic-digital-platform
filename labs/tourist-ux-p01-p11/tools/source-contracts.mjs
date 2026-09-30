/** Execute only from an isolated worktree of the exact canonical repository. */
import {spawnSync} from 'node:child_process';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';import {fileURLToPath} from 'node:url';
import {APPROVED_CATEGORY_ORDER} from '../src/assistant-continuity.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const source='37eb641eefa91f57d8d74c1dc87894c2da36f3ae';
const run=(...args)=>{const r=spawnSync('git',args,{cwd:root,encoding:'utf8'});if(r.status!==0)throw Error(`GIT_PROOF_FAILED: ${args.join(' ')} : ${r.stderr?.slice(0,120)}`);return r.stdout.trim()};
let gitAvailable=true;try{run('rev-parse','--show-toplevel')}catch{gitAvailable=false}
if(!gitAvailable){console.log(JSON.stringify({status:'NOT_RUN_OUTSIDE_EXACT_WORKTREE',source,root},null,2));process.exit(2)}
run('cat-file','-e',`${source}^{commit}`);
const live=run('rev-parse','refs/remotes/origin/main');
const head=run('rev-parse','HEAD');
const changed=run('diff','--name-only',source,head).split(/\n/u).filter(Boolean);
const outOfScope=changed.filter(file=>!file.startsWith('labs/tourist-ux-p01-p11/'));
const required=[
 ['apps/morro-digital-platform/src/runtime/browser-locale.ts','const destinationDefault = canonicalSupportedLocale(input.fallbackLocale)'],
 ['apps/morro-digital-platform/src/map/explore-locations-control.ts','morroV1SearchCatalog.filter('],
 ['apps/morro-digital-platform/src/map/public-place-presentation-v2.ts','detail.partial'],
 ['apps/morro-digital-platform/src/map/place-bottom-sheet.ts','"peek" | "half" | "full"'],
 ['apps/morro-digital-platform/src/assistant/assistant-shell-ui.ts','assistant-modal-open'],
 ['apps/morro-digital-platform/src/ux/tourist-experience-snapshot.ts','assistantContextId'],
 ['apps/morro-digital-platform/public/tourist-shell-v2.css','box-shadow: var(--md-outdoor-shadow)'],
 ['apps/morro-digital-platform/src/onboarding/public-interactive-tour.ts','const STEPS']
];
const contracts=required.map(([path,token])=>({path,exists:existsSync(resolve(root,path)),tokenPresent:existsSync(resolve(root,path))&&readFileSync(resolve(root,path),'utf8').includes(token)}));
const report={sourceMainSha:source,currentRemoteMainSha:live,head,changedCount:changed.length,outOfScope,allRequiredContractsPresent:contracts.every(x=>x.exists&&x.tokenPresent),contracts,legacyChanges:changed.filter(x=>x.includes('/legacy/')),sourceValid:run('merge-base',source,head)===source};
const menuPath=resolve(root,'packages/assistant/src/menu.ts');
const menuText=existsSync(menuPath)?readFileSync(menuPath,'utf8'):'';
const menuBody=menuText.match(/export const CANONICAL_CATEGORY_ORDER\s*=\s*\[([\s\S]*?)\]/u)?.[1]??'';
const mainCategories=Array.from(menuBody.matchAll(/"([a-z]+)"/gu),m=>m[1]);
report.categoryOrderProof={sourceFile:'packages/assistant/src/menu.ts',main:mainCategories,isolated:[...APPROVED_CATEGORY_ORDER],matches:JSON.stringify(mainCategories)===JSON.stringify(APPROVED_CATEGORY_ORDER)};
report.remoteMainMatchesBaseline=live===source;
report.pass=report.categoryOrderProof.matches&&report.remoteMainMatchesBaseline&&report.sourceValid&&report.outOfScope.length===0&&report.legacyChanges.length===0&&report.allRequiredContractsPresent;
console.log(JSON.stringify(report,null,2));process.exit(report.pass?0:1);
