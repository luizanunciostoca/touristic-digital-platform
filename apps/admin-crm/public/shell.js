import { createDashboardAuthClient } from "@touristic/auth-browser";

const auth = createDashboardAuthClient({fetchFn:window.fetch.bind(window),storage:window.sessionStorage,location:{origin:window.location.origin,pathname:window.location.pathname,search:window.location.search,replace:(url)=>window.location.replace(url)}});
const shell=document.querySelector("#crm-shell");
const loading=document.querySelector("#session-loading");
const chip=document.querySelector("#session-chip");
const logout=document.querySelector("#logout-button");
const dashboardView=document.querySelector("#dashboard-view");
const leadsView=document.querySelector("#leads-view");
const leadsStatus=document.querySelector("#leads-status");
const leadsTable=document.querySelector("#leads-table");
const leadsBody=document.querySelector("#leads-body");
const leadsCount=document.querySelector("#leads-count");
const leadCreateForm=document.querySelector("#lead-create-form");
const leadCreateStatus=document.querySelector("#lead-create-status");
const leadCreateSubmit=document.querySelector("#lead-create-submit");
const viewLinks=[...document.querySelectorAll("[data-view-link]")];
let leadsLoaded=false;

const stageLabels={new_lead:"Novo lead",first_contact:"Primeiro contato",meeting_scheduled:"Reunião agendada",proposal_sent:"Proposta enviada",trial:"Trial",contract_sent:"Contrato enviado",contract_signed:"Contrato assinado",payment_pending:"Pagamento pendente",payment_done:"Pagamento concluído",onboarding:"Onboarding",photo_visit_scheduled:"Visita agendada",photo_visit_done:"Visita concluída",published:"Publicado",announced:"Anunciado",feedback:"Feedback",active_client:"Cliente ativo",churned:"Churn",lost:"Perdido"};
const statusLabels={active:"Ativo",inactive:"Inativo",lost:"Perdido"};

function textCell(value){const cell=document.createElement("td");cell.textContent=value??"—";return cell;}
function monthlyValue(value){if(typeof value!=="string"||!value)return"—";const parsed=Number(value);return Number.isFinite(parsed)?new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(parsed):value;}
function setStatus(message){if(leadsStatus)leadsStatus.textContent=message;}
function setCreateStatus(message){if(leadCreateStatus)leadCreateStatus.textContent=message;}
function renderLeads(leads){if(!(leadsBody instanceof HTMLElement)||!(leadsTable instanceof HTMLElement))return;leadsBody.replaceChildren();for(const lead of leads){const row=document.createElement("tr");row.append(textCell(lead.companyName),textCell(lead.contactName||lead.email||lead.whatsapp||lead.phone),textCell(stageLabels[lead.stage]||lead.stage),textCell(statusLabels[lead.status]||lead.status),textCell(monthlyValue(lead.monthlyValue)));leadsBody.append(row);}leadsTable.hidden=leads.length===0;if(leadsCount)leadsCount.textContent=`${leads.length} ${leads.length===1?"lead":"leads"}`;setStatus(leads.length===0?"Nenhum lead encontrado.":`Exibindo ${leads.length} ${leads.length===1?"lead":"leads"}.`);}
async function loadLeads(){if(leadsLoaded)return;setStatus("Carregando leads…");try{const response=await auth.secureFetch("/api/crm/leads",{headers:{Accept:"application/json"}});if(!response.ok){if(response.status!==401)setStatus("Não foi possível carregar os leads.");return;}const payload=await response.json();if(!payload||!Array.isArray(payload.data)){setStatus("Resposta de leads inválida.");return;}renderLeads(payload.data);leadsLoaded=true;}catch{setStatus("Não foi possível carregar os leads.");}}
function formPayload(form){const data=new FormData(form);const payload={};for(const field of ["companyName","contactName","email","whatsapp","segment","monthlyValue"]){const value=data.get(field);if(typeof value==="string"&&value.trim())payload[field]=value.trim();}return payload;}
async function createLead(event){event.preventDefault();if(!(leadCreateForm instanceof HTMLFormElement))return;if(!leadCreateForm.reportValidity())return;const payload=formPayload(leadCreateForm);setCreateStatus("Cadastrando…");if(leadCreateSubmit instanceof HTMLButtonElement)leadCreateSubmit.disabled=true;try{const response=await auth.secureFetch("/api/crm/leads",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify(payload)});if(!response.ok){if(response.status!==401)setCreateStatus(response.status===403?"Você não possui permissão para cadastrar leads.":"Não foi possível cadastrar o lead.");return;}const result=await response.json();if(!result||!result.data){setCreateStatus("Resposta de cadastro inválida.");return;}leadCreateForm.reset();setCreateStatus("Lead cadastrado com sucesso.");leadsLoaded=false;await loadLeads();}catch{setCreateStatus("Não foi possível cadastrar o lead.");}finally{if(leadCreateSubmit instanceof HTMLButtonElement)leadCreateSubmit.disabled=false;}}
function route(){const view=window.location.hash==="#leads"?"leads":"dashboard";if(dashboardView instanceof HTMLElement)dashboardView.hidden=view!=="dashboard";if(leadsView instanceof HTMLElement)leadsView.hidden=view!=="leads";for(const link of viewLinks)link.classList.toggle("active",link.getAttribute("data-view-link")===view);if(view==="leads")void loadLeads();}

void auth.getSession().then((session)=>{if(!session)throw new Error("AUTH_REQUIRED");if(chip)chip.textContent=`${session.user.email} · ${session.user.role}`;if(loading instanceof HTMLElement)loading.hidden=true;if(shell instanceof HTMLElement)shell.hidden=false;route();}).catch(()=>{const current=`${window.location.pathname}${window.location.search}${window.location.hash}`;window.location.replace(`/dashboard/login.html?return=${encodeURIComponent(current)}`);});

window.addEventListener("hashchange",route);
leadCreateForm?.addEventListener("submit",(event)=>{void createLead(event);});
logout?.addEventListener("click",()=>{void auth.logout();});
