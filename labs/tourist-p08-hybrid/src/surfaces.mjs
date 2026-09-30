/** Non-modal Home panel + read-only Assistant projection. Both subscribe to one SavedPlacesService. */
import { createAssistantSavedContext, buildSavedAssistantResponse } from './assistant-bridge.mjs';

const copy = Object.freeze({
  'pt-BR': { saved:'Salvos', title:'Seus lugares salvos', empty:'Ainda não há favoritos neste destino.', loading:'Carregando favoritos…', error:'Não foi possível confirmar seus favoritos.', offline:'Offline: dados do servidor não podem ser confirmados.', conflict:'Revise as alterações feitas em outra aba.', unavailable:'Serviço de favoritos indisponível.', close:'Fechar painel', panel:'Abrir painel de favoritos', assistant:'Perguntar ao Assistant', remove:'Remover dos salvos', view:'Ver no mapa', origin:'Favorito local · validar lugar antes da rota', verified:'Lugar registrado no serviço', list:'Meus favoritos', message:'O painel e o Assistant consultam a mesma lista.', count:n=>`${n} ${n===1?'lugar':'lugares'}`, pending:'Aguardando confirmação…' },
  en: { saved:'Saved', title:'Your saved places', empty:'No favorite places in this destination yet.', loading:'Loading favorites…', error:'Could not confirm your favorites.', offline:'Offline: server data cannot be confirmed.', conflict:'Review changes from another tab.', unavailable:'Favorites service unavailable.', close:'Close panel', panel:'Open saved places panel', assistant:'Ask the Assistant', remove:'Remove favorite', view:'Show on map', origin:'Local favorite · verify place before route', verified:'Place verified by the service', list:'My favorites', message:'The panel and Assistant use the same list.', count:n=>`${n} ${n===1?'place':'places'}`, pending:'Awaiting confirmation…' },
  es: { saved:'Guardados', title:'Tus lugares guardados', empty:'Todavía no hay favoritos en este destino.', loading:'Cargando favoritos…', error:'No se pudieron confirmar tus favoritos.', offline:'Sin conexión: datos del servidor sin confirmar.', conflict:'Revisa los cambios de otra pestaña.', unavailable:'Servicio de favoritos no disponible.', close:'Cerrar panel', panel:'Abrir lugares guardados', assistant:'Preguntar al Assistant', remove:'Eliminar favorito', view:'Ver en el mapa', origin:'Favorito local · verifica el lugar antes de navegar', verified:'Lugar registrado por el servicio', list:'Mis favoritos', message:'El panel y el Assistant usan la misma lista.', count:n=>`${n} ${n===1?'lugar':'lugares'}`, pending:'Pendiente de confirmación…' },
  he: { saved:'שמורים', title:'המקומות השמורים שלך', empty:'אין עדיין מקומות שמורים ביעד הזה.', loading:'טוען מקומות שמורים…', error:'לא ניתן לאמת את המקומות השמורים.', offline:'אין חיבור: לא ניתן לאמת נתוני שרת.', conflict:'יש לבדוק שינויים מחלונית אחרת.', unavailable:'שירות המקומות השמורים אינו זמין.', close:'סגירת החלונית', panel:'פתיחת המקומות השמורים', assistant:'שאל את העוזר', remove:'הסרת המקום', view:'הצגה במפה', origin:'מועדף מקומי · יש לאמת מקום לפני מסלול', verified:'מקום מאומת על ידי השירות', list:'המקומות השמורים', message:'החלונית והעוזר משתמשים באותה רשימה.', count:n=>`${n} מקומות`, pending:'ממתין לאישור…' }
});
function localeOf(locale) { const lang=String(locale ?? '').toLowerCase();return lang.startsWith('he')?'he':lang.startsWith('es')?'es':lang.startsWith('en')?'en':'pt-BR'; }
function localizedCategory(value,locale){
 const categories={
  'Praias':{'pt-BR':'Praias',en:'Beaches',es:'Playas',he:'חופים'},
  'Vida Noturna':{'pt-BR':'Vida Noturna',en:'Nightlife',es:'Vida nocturna',he:'חיי לילה'},
  'Atrações':{'pt-BR':'Atrações',en:'Attractions',es:'Atracciones',he:'אטרקציות'}
 };
 return categories[value]?.[locale]??value;
}
function el(d,tag,cl,text) { const v=d.createElement(tag);if(cl)v.className=cl;if(text!=null)v.textContent=text;return v; }
function buildSavedRow(d,item,t,onMap,onRemove,ownerVerified=false) {
  const row=el(d,'li','saved-card');row.dataset.placeId=item.placeId;
  const icon=el(d,'div','saved-card__icon','♡');icon.setAttribute('aria-hidden','true');
  const body=el(d,'div','saved-card__body');const title=el(d,'strong','saved-card__title',item.name);
  const meta=el(d,'small','saved-card__meta',(item.category??'')+' · '+(item.source==='owner'?(ownerVerified?t.verified:t.pending):t.origin));
  body.append(title,meta);
  const actions=el(d,'div','saved-card__actions');
  const mapButton=el(d,'button','saved-btn saved-btn--subtle',t.view);mapButton.type='button';mapButton.dataset.action='open-place';mapButton.addEventListener('click',()=>onMap(item));
  const removeButton=el(d,'button','saved-btn saved-btn--quiet','×');removeButton.type='button';removeButton.dataset.action='remove';removeButton.setAttribute('aria-label',t.remove+' '+item.name);removeButton.addEventListener('click',()=>onRemove(item));
  actions.append(mapButton,removeButton);row.append(icon,body,actions);return row;
}
export function mountSavedHybrid({ document, service, root, assistantHost, trigger, locale = 'pt-BR', onAskAssistant=()=>{}, onOpenPlace=()=>{}, onPanelToggle=()=>{} }={}) {
  if (!document || !service || !root || !assistantHost || !trigger) throw new Error('P08_SURFACE_HOSTS_REQUIRED');
  let currentLocale=localeOf(locale),open=false,disposed=false, assistantVisible=false;
  const panel=el(document,'section','saved-panel');panel.id='home-saved-panel';panel.hidden=true;panel.tabIndex=-1;panel.setAttribute('role','region');panel.setAttribute('aria-label','Salvos');root.append(panel);
  trigger.type='button';trigger.setAttribute('aria-controls',panel.id);trigger.setAttribute('aria-expanded','false');
  const render=state=>{
    if(disposed)return;
    const t=copy[currentLocale];
    panel.setAttribute('aria-label',t.title);trigger.setAttribute('aria-label',t.panel);if(trigger.querySelector('span'))trigger.querySelector('span').textContent=t.saved;
    // Reuse the same model in both surfaces, no duplicate collection or competing cache.
    const scroll=panel.scrollTop;
    const focused = open && panel.contains(document.activeElement) ? document.activeElement : null;
    const focusedAction = focused?.dataset?.action ?? null;
    const focusedPlaceId = focused?.closest?.('[data-place-id]')?.dataset?.placeId ?? null;
    panel.replaceChildren();
    const header=el(document,'header','saved-panel__header');
    const overline=el(document,'span','saved-eyebrow','P08 · '+t.saved);
    const title=el(document,'h2','saved-panel__title',t.title);title.id='saved-panel-heading';panel.setAttribute('aria-labelledby',title.id);
    const count=el(document,'span','saved-count',t.count(state.items.length));count.dataset.testid='saved-count';
    const close=el(document,'button','saved-btn saved-btn--close','×');close.type='button';close.dataset.action='close';close.setAttribute('aria-label',t.close);close.addEventListener('click',()=>setOpen(false));
    const heading=el(document,'div','saved-panel__heading');heading.append(overline,title,count);header.append(heading,close);panel.append(header);
    const status=el(document,'p','saved-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.dataset.testid='saved-status';
    if(['loading','unavailable','offline','error','conflict'].includes(state.status))status.textContent=state.warning || t[state.status] || t.error;
    else if(!state.items.length) status.textContent=t.empty;
    if(status.textContent) panel.append(status);
    const list=el(document,'ul','saved-list');list.dataset.testid='panel-list';
    const onRemove=async item=>{if(disposed)return;await service.remove(item);};
    state.items.forEach(item=>list.append(buildSavedRow(document,{...item,category:localizedCategory(item.category,currentLocale)},t,onOpenPlace,onRemove,state.ownerVerified)));
    if(['offline','error','unavailable','conflict','loading'].includes(state.status)) {
      list.querySelectorAll('[data-action="open-place"]').forEach(button=>{button.disabled=true;button.title=t[state.status]??t.error;});
      if(state.mode==='owner'||state.status==='conflict') list.querySelectorAll('[data-action="remove"]').forEach(button=>{button.disabled=true;});
    }
    panel.append(list);
    const footer=el(document,'div','saved-panel__footer');const ask=el(document,'button','saved-btn saved-btn--primary',t.assistant);ask.dataset.action='ask-assistant';ask.addEventListener('click',()=>{
      const context=createAssistantSavedContext(service,{destinationId:service.snapshot().destinationId,explicitUserRequest:true});
      setOpen(false);assistantVisible=true;renderAssistant(service.snapshot());onAskAssistant(context);
      assistantHost.querySelector('[data-testid="assistant-list"]')?.focus();
    });footer.append(ask);panel.append(footer);
    panel.scrollTop=scroll;
    if(focused && focused !== panel) {
      const matching = Array.from(panel.querySelectorAll('[data-place-id]')).find(node => node.dataset.placeId === focusedPlaceId);
      const replacement = matching?.querySelector('[data-action="'+focusedAction+'"]') ?? panel.querySelector('.saved-list [data-action="remove"]') ?? panel.querySelector('[data-action="close"]');
      if(replacement && !replacement.disabled) replacement.focus();
    }
    if(assistantVisible)renderAssistant(state);
  };
  const renderAssistant=state=>{
    if(disposed)return;
    const t=copy[currentLocale]; assistantHost.replaceChildren();assistantHost.setAttribute('aria-label',t.list);assistantHost.setAttribute('role','region');
    const desc=el(document,'p','assistant-context-intro',t.message);assistantHost.append(desc);
    const list=el(document,'ul','assistant-saved-list');list.dataset.testid='assistant-list';list.tabIndex=-1;
    if(['loading','error','offline','unavailable','conflict'].includes(state.status)){const msg=el(document,'li','assistant-empty',t[state.status]??t.error);list.append(msg);}
    else if(!state.items.length){list.append(el(document,'li','assistant-empty',t.empty));}
    else state.items.forEach(item=>list.append(buildSavedRow(document,{...item,category:localizedCategory(item.category,currentLocale)},t,onOpenPlace,async x=>{await service.remove(x);},state.ownerVerified )));
    if(['offline','error','unavailable','conflict','loading'].includes(state.status)) {
      list.querySelectorAll('[data-action="open-place"]').forEach(button=>{button.disabled=true;button.title=t[state.status]??t.error;});
      if(state.mode==='owner'||state.status==='conflict') list.querySelectorAll('[data-action="remove"]').forEach(button=>{button.disabled=true;});
    }
    assistantHost.append(list);
    const status=el(document,'small','assistant-context-status');status.textContent=state.mode==='owner'?(state.ownerVerified?t.verified:t.pending):t.origin;assistantHost.append(status);
  };
  function setOpen(value) {
    const hadPanelFocus = document.activeElement && panel.contains(document.activeElement);
    open=Boolean(value);panel.hidden=!open;trigger.setAttribute('aria-expanded',String(open));
    if(open) { assistantVisible=false;assistantHost.replaceChildren(); }
    onPanelToggle(open);
    if(open){render(service.snapshot());panel.focus();}
    else if(hadPanelFocus)trigger.focus();
  }
  const onClick=()=>setOpen(!open);
  const onKey=event=>{if(open&&event.key==='Escape'){event.preventDefault();setOpen(false);}};
  trigger.addEventListener('click',onClick);document.addEventListener('keydown',onKey);
  const unsubscribe=service.subscribe(render);
  return Object.freeze({
    open:()=>setOpen(true),close:()=>setOpen(false),toggle:()=>setOpen(!open),
    showAssistant:()=>{assistantVisible=true;renderAssistant(service.snapshot());},
    setLocale(value){currentLocale=localeOf(value);panel.dir=currentLocale==='he'?'rtl':'ltr';assistantHost.dir=panel.dir;render(service.snapshot());},
    get state(){return Object.freeze({panelOpen:open,assistantVisible,locale:currentLocale});},
    destroy(){disposed=true;unsubscribe();trigger.removeEventListener('click',onClick);document.removeEventListener('keydown',onKey);panel.remove();assistantHost.replaceChildren();}
  });
}
export function localizeSaved(lang){return copy[localeOf(lang)];}
