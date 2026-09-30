import {esc} from "./components.js";
const attrs=(obj={})=>Object.entries(obj).map(([k,v])=>v===true?esc(k):v===false||v==null?"":`${esc(k)}="${esc(v)}"`).filter(Boolean).join(" ");
export const ui={
 button:(label,{variant="",type="button",...rest}={})=>`<button type="${esc(type)}" class="button ${esc(variant)}" ${attrs(rest)}>${esc(label)}</button>`,
 input:(label,{name="field",type="text",value="",...rest}={})=>`<label class="field">${esc(label)}<input name="${esc(name)}" type="${esc(type)}" value="${esc(value)}" ${attrs(rest)}></label>`,
 select:(label,options=[],{name="field",...rest}={})=>`<label class="field">${esc(label)}<select name="${esc(name)}" ${attrs(rest)}>${options.map(o=>`<option value="${esc(o.value??o)}">${esc(o.label??o)}</option>`).join("")}</select></label>`,
 textarea:(label,{name="field",value="",...rest}={})=>`<label class="field">${esc(label)}<textarea name="${esc(name)}" ${attrs(rest)}>${esc(value)}</textarea></label>`,
 checkbox:(label,{name="field",checked=false,...rest}={})=>`<label class="control-label"><input type="checkbox" name="${esc(name)}" ${checked?"checked":""} ${attrs(rest)}><span>${esc(label)}</span></label>`,
 radio:(label,{name="field",value="",checked=false,...rest}={})=>`<label class="control-label"><input type="radio" name="${esc(name)}" value="${esc(value)}" ${checked?"checked":""} ${attrs(rest)}><span>${esc(label)}</span></label>`,
 switchControl:(label,{name="field",checked=false,...rest}={})=>`<label class="switch"><input type="checkbox" role="switch" name="${esc(name)}" ${checked?"checked":""} ${attrs(rest)}><span class="switch-track" aria-hidden="true"></span><span>${esc(label)}</span></label>`,
 badge:(label)=>`<span class="badge">${esc(label)}</span>`,
 chip:(label)=>`<span class="chip">${esc(label)}</span>`,
 alert:(title,body,tone="info")=>`<section class="alert" data-tone="${esc(tone)}" role="${tone==="danger"?"alert":"status"}"><strong>${esc(title)}</strong><p>${esc(body)}</p></section>`,
 card:(title,body)=>`<article class="card"><h3>${esc(title)}</h3><p>${esc(body)}</p></article>`,
 tabs:(tabs,active=0)=>`<div class="tabs" role="tablist">${tabs.map((x,i)=>`<button class="tab" role="tab" aria-selected="${i===active}" tabindex="${i===active?0:-1}">${esc(x)}</button>`).join("")}</div>`,
 accordion:(items)=>`<div class="accordion">${items.map(x=>`<details><summary>${esc(x.title)}</summary><div>${esc(x.body)}</div></details>`).join("")}</div>`,
 tooltip:(label,text)=>`<span class="tooltip-host"><button class="icon-button" type="button">${esc(label)}</button><span class="tooltip" role="tooltip">${esc(text)}</span></span>`,
 pagination:(page,total)=>`<nav class="pagination" aria-label="Paginação"><button type="button" ${page<=1?"disabled":""}>←</button><span>Página ${page} de ${total}</span><button type="button" ${page>=total?"disabled":""}>→</button></nav>`,
 loader:(label="Carregando")=>`<span class="loader" role="status" aria-label="${esc(label)}"></span>`,
 skeleton:()=>'<div class="skeleton" aria-hidden="true"></div>',
 transactionState:(state,label=state)=>`<span class="transaction-state" data-state="${esc(state)}">${esc(label)}</span>`
};
