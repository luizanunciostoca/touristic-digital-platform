import { createSavedPlacesService } from '/src/service.mjs';
import { createOwnerBoundary } from '/src/owner-port.mjs';
import { mountSavedHybrid, localizeSaved } from '/src/surfaces.mjs';
import { createAssistantSavedContext,resolveFavoriteIntent,buildSavedAssistantResponse } from '/src/assistant-bridge.mjs';
const $=id=>document.getElementById(id);
const dataset={
  'morro-de-sao-paulo': [
    {destinationId:'morro-de-sao-paulo',placeId:'demo-segunda-praia',name:'Segunda Praia',category:'Praias'},
    {destinationId:'morro-de-sao-paulo',placeId:'demo-toca-morcego',name:'Toca do Morcego',category:'Vida Noturna'},
    {destinationId:'morro-de-sao-paulo',placeId:'demo-mirante',name:'Mirante',category:'Atrações'}
  ],
  itacare: [{destinationId:'itacare',placeId:'demo-resende',name:'Praia do Resende',category:'Praias'},
    {destinationId:'itacare',placeId:'demo-concha',name:'Praia da Concha',category:'Praias'}]
};
let service,ui,unsubscribeMarkers=()=>{};
let ownerTestKey=0;
let ownerFixtures=Object.create(null);
const previewCopy={
 'pt-BR':{subtitle:'Seu guia pelo destino',dock:'Assistant contextual',proof:'Prévia não autoritativa',explore:'Explorar',tours:'Passeios',tickets:'Ingressos',profile:'Perfil',placeholder:'Mostre meus salvos',response:'Salvo no laboratório. Sem sincronização real.'},
 en:{subtitle:'Your destination guide',dock:'Contextual Assistant',proof:'Non-authoritative preview',explore:'Explore',tours:'Tours',tickets:'Tickets',profile:'Profile',placeholder:'Show my saved places',response:'Saved in the lab. No real synchronization.'},
 es:{subtitle:'Tu guía del destino',dock:'Assistant contextual',proof:'Vista de prueba no autoritativa',explore:'Explorar',tours:'Paseos',tickets:'Entradas',profile:'Perfil',placeholder:'Muestra mis guardados',response:'Guardado en el laboratorio. Sin sincronización real.'},
 he:{subtitle:'המדריך שלך ליעד',dock:'עוזר הקשרי',proof:'תצוגה לדוגמה בלבד',explore:'לגלות',tours:'סיורים',tickets:'כרטיסים',profile:'פרופיל',placeholder:'הצג מקומות שמורים',response:'נשמר במעבדה. ללא סנכרון אמיתי.'}
};
function translatePreview(locale){const t=previewCopy[locale]??previewCopy['pt-BR'];
 $('brand-subtitle').textContent=t.subtitle;$('dock-label').textContent=t.dock;$('dock-proof').textContent=t.proof;
 $('nav-explore').textContent=t.explore;$('nav-tours').textContent=t.tours;$('nav-tickets').textContent=t.tickets;$('nav-profile').textContent=t.profile;
 $('chat-input').placeholder=t.placeholder;
}

function fixtureFor(dest){return ownerFixtures[dest]??={items:[],revision:0};}
function ownerPort(){return createOwnerBoundary({
  enabled:true,
  auth:{authorized:true,capability:'favorites.write',csrf:'LAB_SIMULATED_CSRF_ONLY'},
  online:()=>!$('offline').checked,
  read:async dest=>{await new Promise(res=>setTimeout(res,10));const f=fixtureFor(dest);return {destinationId:dest,ownerVerified:true,revision:f.revision,items:f.items};},
  command:async command=>{const f=fixtureFor(command.destinationId);const matching=dataset[command.destinationId]?.find(x=>x.placeId===command.placeId);
    if(command.action==='add' && matching&&!f.items.some(x=>x.placeId===matching.placeId))f.items.push(matching);
    if(command.action==='remove')f.items=f.items.filter(x=>x.placeId!==command.placeId);
    f.revision++;}
});}
function syncMarkerHearts(){
 const entries=new Set(service.snapshot().items.map(item=>item.placeId));
 for(const button of $('demo-markers').querySelectorAll('.demo-marker')){
   const saved=entries.has(button.dataset.placeId);
   button.setAttribute('aria-pressed',String(saved));
   button.querySelector('span').textContent=saved?'♥':'♡';
 }
}
function renderMarkers(){const dest=$('destination').value;
 $('brand-title').textContent=dest==='itacare'?'Itacaré (fixture)':'Morro de São Paulo';
 $('demo-markers').replaceChildren();
 for(const place of dataset[dest]){
  const button=document.createElement('button');button.type='button';button.className='demo-marker';button.dataset.placeId=place.placeId;
  const symbol=document.createElement('span');symbol.textContent='♡';
  button.append(symbol,document.createTextNode(' '+place.name));
  button.setAttribute('aria-label','Salvar '+place.name);
  button.addEventListener('click',async()=>{
   const s=service.snapshot();
   if(s.items.some(x=>x.placeId===place.placeId))await service.remove(place);else await service.add(place);
   $('assistant-response').textContent=previewCopy[$('locale').value]?.response??previewCopy['pt-BR'].response;
  });$('demo-markers').append(button);
 }
 syncMarkerHearts();
}
function addHandlers(){const locale=$('locale').value;const dir=locale==='he'?'rtl':'ltr';document.documentElement.lang=locale;document.documentElement.dir=dir;
 translatePreview(locale);
 ui=mountSavedHybrid({document,service,root:$('saved-surface-host'),assistantHost:$('assistant-projection'),trigger:$('nav-saved'),locale,
  onOpenPlace:item=>{$('assistant-response').textContent='LOCAL FICTÍCIO: '+item.name+' — navegação real só após contrato canônico.';},
  onPanelToggle:opened=>{document.querySelector('.shell').dataset.p08PanelOpen=String(opened);},
  onAskAssistant:context=>{
   $('assistant-response').textContent=context.items.length?`Assistant recebeu ${context.items.length} favorito(s) da MESMA fonte. Nenhuma recomendação externa foi solicitada.`:'Não há favoritos salvos neste destino.';
  }
 });renderMarkers();unsubscribeMarkers=service.subscribe(syncMarkerHearts);}

function initialize(){unsubscribeMarkers();ui?.destroy();service?.destroy();$('saved-surface-host').replaceChildren();
 const dest=$('destination').value,mode=$('mode').value,remember=$('remember').checked;
 service=createSavedPlacesService({destinationId:dest,mode,storage:remember?localStorage:null,persistenceConsent:remember,owner:mode==='owner'?ownerPort():null,guestSimulation:true,idFactory:()=>`lab-only-${String(++ownerTestKey).padStart(12,'0')}`});
 if($('offline').checked)service.setOnline(false);
 service.refresh();
 addHandlers();
}
$('mode').addEventListener('change',initialize);
$('remember').addEventListener('change',initialize);
$('destination').addEventListener('change',async()=>{await service.switchDestination($('destination').value);renderMarkers();ui.close();});
$('locale').addEventListener('change',()=>{const locale=$('locale').value;document.documentElement.lang=locale;document.documentElement.dir=locale==='he'?'rtl':'ltr';ui.setLocale(locale);translatePreview(locale);});
$('offline').addEventListener('change',()=>{service.setOnline(!$('offline').checked);if(!$('offline').checked&&$('mode').value==='owner')service.refresh();});
$('chat-form').addEventListener('submit',event=>{
 event.preventDefault();const input=$('chat-input'),intent=resolveFavoriteIntent(input.value);
 if(intent==='unrelated'){$('assistant-response').textContent='LAB: experimente “Mostre meus salvos”. Não há LLM ativo.';return;}
 const context=createAssistantSavedContext(service,{destinationId:service.snapshot().destinationId,explicitUserRequest:true});
 const result=buildSavedAssistantResponse(context,intent);
 if(result.kind==='list')$('assistant-response').textContent=`Assistant: ${result.items.map(x=>x.name).join(', ')} (mesma coleção).`;
 else $('assistant-response').textContent=result.message??(result.kind==='empty'?'Você ainda não salvou nenhum lugar.':'Recurso disponível somente com serviço autorizado.');
 ui.showAssistant();input.value='';
});
window.addEventListener('storage',ev=>{if(service)service.importGuestStorageEvent(ev);});
initialize();
