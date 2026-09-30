import {InterfaceAdapter} from "./adapters.js";
import {resolveLocale,applyLocale,t,SUPPORTED_LOCALES} from "./i18n.js";
import {renderTemplate} from "./templates/index.js";
import {statusBanner,esc} from "./components.js";

const storage={
  get(key){try{return window.localStorage?.getItem(key)??null}catch{return null}},
  set(key,value){try{window.localStorage?.setItem(key,value)}catch{}},
};
const adapter=new InterfaceAdapter();
const app=document.querySelector("#app");
const currentId=document.body.dataset.interfaceId || "CATALOG";
const stateOptions=["populated","loading","skeleton","empty","success","warning","partial","disabled","unauthorized","forbidden","offline","network_error","api_error","timeout","validation_error","stale_data"];
const fatalStates=new Set(["unauthorized","forbidden","network_error","api_error","timeout","offline"]);

let catalog=[], nav={next:{},previous:{}}, currentState=new URLSearchParams(location.search).get("state")||"populated";
let locale=resolveLocale({
  manualOverride:storage.get("if-locale"),
  browserLocale:navigator.language,
  destinationFallback:"pt-BR",
  safeFallback:"pt-BR"
});
applyLocale(locale);

function basePath(){
  return location.pathname.includes("/interfaces/") ? "../" : "./";
}
async function loadJson(path){ const r=await fetch(basePath()+path,{cache:"no-store"}); if(!r.ok) throw new Error(`LOAD_${path}`); return r.json(); }
function pageFor(id){ return `${basePath()}interfaces/${id}.html`; }
function navigate(id){ if(!id) return; location.href=pageFor(id); }
function domainGroups(){
  const groups=new Map();
  for(const def of catalog){ if(!groups.has(def.domain)) groups.set(def.domain,[]); groups.get(def.domain).push(def); }
  return groups;
}
function shell(def,body){
  const groups=domainGroups();
  const activeDomain=def?.domain;
  const navLinks=[...groups.entries()].map(([domain,items])=>{
    const first=items[0];
    return `<a class="nav-link" href="${pageFor(first.id)}" ${domain===activeDomain?'aria-current="page"':""}><span aria-hidden="true">◈</span><span>${esc(domain)}</span></a>`;
  }).join("");
  const title=def?.title||"Interface Fabric";
  const subtitle=def?`${def.id} · ${def.domain}`:"112 superfícies";
  return `<div class="fabric-shell">
    <aside class="sidebar" id="sidebar" aria-label="Navegação principal">
      <div class="brand"><span class="brand-mark">M</span><div><strong>Morro Digital</strong><small>Interface Fabric</small></div></div>
      <nav>${navLinks}</nav>
      <div class="sidebar-foot"><a class="nav-link" href="${basePath()}index.html">Catálogo 112</a><small>Isolado · fixture-only</small></div>
    </aside>
    <div class="page">
      <header class="topbar">
        <button class="icon-button mobile-only" type="button" data-action="menu" aria-label="${t(locale,"openMenu")}" aria-controls="sidebar" aria-expanded="false">☰</button>
        <div><h1>${esc(title)}</h1><small>${esc(subtitle)}</small></div><span class="spacer"></span>
        <div class="state-lab" aria-label="Controles de QA">
          <span class="label sr-only">${t(locale,"state")}</span>
          <select id="qa-state" aria-label="Estado da interface">${stateOptions.map(s=>`<option value="${s}" ${s===currentState?"selected":""}>${s}</option>`).join("")}</select>
          <select id="locale-select" aria-label="${t(locale,"language")}">${SUPPORTED_LOCALES.map(l=>`<option value="${l}" ${l===locale?"selected":""}>${l}</option>`).join("")}</select>
          <button class="icon-button" type="button" data-action="theme" aria-label="${t(locale,"theme")}">◐</button>
        </div>
      </header>
      <main id="main-content" class="content" tabindex="-1">${body}</main>
    </div>
    <div class="toast-region" aria-live="polite" aria-atomic="true"></div>
    <dialog id="fabric-dialog" class="dialog" aria-labelledby="dialog-title"><div class="dialog-inner"><h2 id="dialog-title">Detalhes</h2><p>Conteúdo demonstrativo isolado. Nenhuma operação real foi executada.</p><div class="actions"><button class="button primary" type="button" data-action="dialog-close">Fechar</button></div></div></dialog>
  </div>`;
}
function hero(def){
  return `<nav class="breadcrumbs" aria-label="Breadcrumb"><a href="${basePath()}index.html">Fabric</a><span>/</span><span>${esc(def.domain)}</span><span>/</span><span aria-current="page">${esc(def.id)}</span></nav>
  <section class="hero"><div><span class="eyebrow">${esc(def.persona)}</span><h2>${esc(def.title)}</h2><p>${esc(def.sourceEvidence)}</p></div><div><span class="badge">${esc(def.legacyStatus)} → ${esc(def.isolatedStatus)}</span></div></section>`;
}
function stateBody(def,data){
  if(currentState==="loading") return `${statusBanner("loading")}<div class="grid cards">${Array.from({length:6},()=>'<div class="card"><div class="skeleton" style="height:1rem;width:38%"></div><div class="skeleton" style="height:2rem;margin-top:.8rem"></div><div class="skeleton" style="height:4rem;margin-top:.8rem"></div></div>').join("")}</div>`;
  if(currentState==="skeleton") return `${statusBanner("skeleton")}<div class="grid two"><div class="panel"><div class="skeleton" style="height:2rem"></div><div class="skeleton" style="height:12rem;margin-top:1rem"></div></div><div class="panel"><div class="skeleton" style="height:2rem"></div><div class="skeleton" style="height:12rem;margin-top:1rem"></div></div></div>`;
  if(currentState==="empty") return `${statusBanner("empty")}<section class="panel"><h3>Sem registros</h3><p>Crie o primeiro item ou altere os filtros.</p><button class="button primary" type="button" data-action="dialog">Criar primeiro item</button></section>`;
  if(fatalStates.has(currentState)) return `${statusBanner(currentState)}<section class="panel"><h3>Recuperação segura</h3><p>O estado autoritativo não será presumido.</p><button class="button primary" type="button" data-action="retry">Tentar novamente</button></section>`;
  return `${statusBanner(currentState)}${renderTemplate(def,data)}`;
}
function footerNav(def){
  const prev=nav.previous[def.id], next=nav.next[def.id];
  return `<nav class="actions" aria-label="Navegação entre interfaces">${prev?`<button class="button" type="button" data-nav-id="${prev}">← ${t(locale,"back")}</button>`:""}${next?`<button class="button primary" type="button" data-nav-id="${next}">${t(locale,"next")} →</button>`:""}</nav>`;
}
async function renderInterface(def){
  let payload;
  try{ payload=await adapter.read(def,{state:currentState}); }
  catch(err){ currentState=String(err.message).includes("TIMEOUT")?"timeout":String(err.message).includes("API")?"api_error":"network_error"; payload={data:{destination:{name:"Morro de São Paulo"}}}; }
  app.innerHTML=shell(def,`${hero(def)}${stateBody(def,payload.data)}${footerNav(def)}`);
  wire(def);
}
function renderCatalog(){
  const groups=domainGroups();
  const body=`<section class="hero"><div><span class="eyebrow">Isolated build</span><h2>112 interfaces implementadas, aguardando prova final</h2><p>Catálogo físico da Fabric. Cada item possui HTML próprio, Design System compartilhado, lógica, estados, fixture adapter e contrato de integração; browser, visual e acessibilidade permanecem gates explícitos.</p></div><span class="badge">ZERO-TOUCH LEGACY</span></section>
  ${[...groups.entries()].map(([domain,items])=>`<section class="panel"><h3>${esc(domain)} <small>(${items.length})</small></h3><div class="grid cards">${items.map(x=>`<article class="card"><span class="eyebrow">${esc(x.id)}</span><h3>${esc(x.title)}</h3><p>${esc(x.legacyStatus)} → alvo isolado</p><a class="button primary" href="${pageFor(x.id)}">Abrir interface</a></article>`).join("")}</div></section>`).join("")}`;
  app.innerHTML=shell(null,body);
  wire(null);
}
function showToast(message){
  const region=document.querySelector(".toast-region");
  if(!region)return;
  const el=document.createElement("div");el.className="toast";el.textContent=message;region.append(el);setTimeout(()=>el.remove(),2600);
}
let dialogReturnFocus=null;
function openDialog(event){
  dialogReturnFocus=event?.currentTarget instanceof HTMLElement?event.currentTarget:document.activeElement;
  const d=document.querySelector("#fabric-dialog"); if(!d)return; d.showModal(); d.querySelector("button")?.focus();
}
function closeDialog(){document.querySelector("#fabric-dialog")?.close();}
function restoreDialogFocus(){
  if(dialogReturnFocus instanceof HTMLElement && dialogReturnFocus.isConnected) dialogReturnFocus.focus();
  dialogReturnFocus=null;
}
function wire(def){
  document.querySelector('[data-action="menu"]')?.addEventListener("click",e=>{
    const s=document.querySelector("#sidebar"); const open=s.classList.toggle("open"); e.currentTarget.setAttribute("aria-expanded",String(open));
  });
  document.querySelector('[data-action="theme"]')?.addEventListener("click",()=>{
    const dark=document.documentElement.dataset.theme!=="dark"; document.documentElement.dataset.theme=dark?"dark":"light"; storage.set("if-theme",dark?"dark":"light");
  });
  const savedTheme=storage.get("if-theme"); if(savedTheme) document.documentElement.dataset.theme=savedTheme;
  document.querySelector("#qa-state")?.addEventListener("change",e=>{ const u=new URL(location.href);u.searchParams.set("state",e.target.value);location.href=u.toString(); });
  document.querySelector("#locale-select")?.addEventListener("change",e=>{storage.set("if-locale",e.target.value);location.reload();});
  document.querySelectorAll("[data-nav-id]").forEach(el=>el.addEventListener("click",()=>navigate(el.dataset.navId)));
  document.querySelectorAll('[data-action="command"]').forEach(el=>el.addEventListener("click",async()=>{if(!def)return;const result=await adapter.command(def,"action",{label:el.textContent?.trim()||"action"});showToast(result.message);}));
  document.querySelector('[data-action="nav-explore"]')?.addEventListener("click",()=>navigate("IF-PUB-008"));
  document.querySelectorAll('[data-action="nav-assistant"]').forEach(el=>el.addEventListener("click",()=>navigate("IF-PUB-014")));
  document.querySelector('[data-action="nav-route"]')?.addEventListener("click",()=>navigate("IF-PUB-017"));
  document.querySelector('[data-action="nav-commerce"]')?.addEventListener("click",()=>navigate("IF-COM-001"));
  document.querySelectorAll('[data-action="dialog"]').forEach(el=>el.addEventListener("click",openDialog));
  document.querySelector('[data-action="dialog-close"]')?.addEventListener("click",closeDialog);
  document.querySelectorAll('[data-action="toast"]').forEach(el=>el.addEventListener("click",()=>showToast("Ação demonstrativa concluída.")));
  document.querySelectorAll('[data-action="retry"]').forEach(el=>el.addEventListener("click",()=>{const u=new URL(location.href);u.searchParams.set("state","populated");location.href=u.toString();}));
  document.querySelectorAll("[data-demo-form]").forEach(form=>form.addEventListener("submit",async e=>{e.preventDefault(); if(!form.reportValidity())return; const result=await adapter.command(def,"submit",Object.fromEntries(new FormData(form)));showToast(result.message);}));
  document.querySelector("[data-chat-form]")?.addEventListener("submit",async e=>{e.preventDefault();const input=e.currentTarget.elements.message;const text=input.value.trim();if(!text)return;const box=document.querySelector(".messages");box.insertAdjacentHTML("beforeend",`<div class="message user">${esc(text)}</div><div class="message">Resposta de fixture: posso sugerir lugares, rotas e experiências sem executar uma ação autoritativa.</div>`);input.value="";showToast("Mensagem processada pela fixture.");});
  document.querySelector("[data-search-form]")?.addEventListener("submit",e=>{e.preventDefault();showToast(`Busca fixture: ${e.currentTarget.elements.q.value}`);});
  const dialog=document.querySelector("#fabric-dialog"); dialog?.addEventListener("click",e=>{if(e.target===dialog)closeDialog();}); dialog?.addEventListener("close",restoreDialogFocus);
}
async function boot(){
  [catalog,nav]=await Promise.all([loadJson("manifest/interfaces.json"),loadJson("manifest/navigation.json")]);
  if(currentId==="CATALOG"){renderCatalog();return;}
  const def=catalog.find(x=>x.id===currentId);
  if(!def){app.innerHTML=shell(null,`<section class="panel"><h2>Interface não encontrada</h2><p>${esc(currentId)}</p></section>`);wire(null);return;}
  await renderInterface(def);
}
boot().catch(err=>{app.innerHTML=`<main class="content"><h1>Interface Fabric</h1><div role="alert">Falha de bootstrap: ${esc(err.message)}</div></main>`;});
