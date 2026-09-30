
export const esc=(value="")=>String(value).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[ch]));
export function statusBanner(state){
  const map={
    loading:["Carregando","Sincronizando a fixture isolada…","info"],
    skeleton:["Preparando conteúdo","A estrutura está disponível enquanto os dados são resolvidos.","info"],
    empty:["Nada por aqui ainda","A interface está pronta para o primeiro registro.","info"],
    populated:["Dados de demonstração","Conteúdo servido exclusivamente por FixtureProvider.","info"],
    success:["Concluído","A ação de demonstração foi processada sem efeitos externos.","success"],
    warning:["Atenção","Há uma condição que precisa de revisão antes de avançar.","warning"],
    partial:["Dados parciais","Parte das informações está indisponível; nenhuma autoridade foi inferida.","warning"],
    disabled:["Recurso desativado","A capability/feature flag está desligada.","warning"],
    unauthorized:["Sessão necessária","Autentique-se para continuar.","danger"],
    forbidden:["Acesso negado","Sua função não possui a capability necessária.","danger"],
    offline:["Você está offline","Conteúdo seguro pode ser consultado; transações permanecem bloqueadas.","warning"],
    network_error:["Falha de rede","Não foi possível alcançar o provider. Tente novamente.","danger"],
    api_error:["Erro do serviço","O domínio respondeu com erro. Nenhum fallback inventa autoridade.","danger"],
    timeout:["Tempo esgotado","A operação não confirmou resultado. O estado permanece não confirmado.","danger"],
    validation_error:["Revise os campos","Há dados inválidos antes do envio.","danger"],
    stale_data:["Dados possivelmente desatualizados","A projeção pode estar antiga; ações autoritativas exigem novo readback.","warning"]
  };
  const [title,body,tone]=map[state]||map.populated;
  return `<div class="status-banner" data-tone="${tone}" role="${tone==="danger"?"alert":"status"}"><div><strong>${title}</strong><div>${body}</div></div></div>`;
}
export function kpi(label,value,detail=""){
 return `<article class="card kpi"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(detail)}</small></article>`;
}
export function field(label,type="text",value="",name="field",extra=""){
 return `<div class="field"><label>${esc(label)}<input name="${esc(name)}" type="${esc(type)}" value="${esc(value)}" ${extra}></label></div>`;
}
export function table(headers,rows){
 return `<div class="table-wrap"><table><thead><tr>${headers.map(h=>`<th scope="col">${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
export function qr(label="QR"){
 return `<div class="qr" role="img" aria-label="${esc(label)}"></div>`;
}
export function progress(value,max=100,label="Progresso"){
 const pct=Math.max(0,Math.min(100,Math.round(value/max*100)));
 return `<div aria-label="${esc(label)}: ${pct}%" role="progressbar" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${value}" class="progress"><span style="width:${pct}%"></span></div>`;
}
