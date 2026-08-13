import { createDashboardAuthClient } from "@touristic/auth-browser";

const auth = createDashboardAuthClient({fetchFn:window.fetch.bind(window),storage:window.sessionStorage,location:{origin:window.location.origin,pathname:window.location.pathname,search:window.location.search,replace:(url)=>window.location.replace(url)}});
const shell=document.querySelector("#crm-shell");
const loading=document.querySelector("#session-loading");
const chip=document.querySelector("#session-chip");
const logout=document.querySelector("#logout-button");

void auth.getSession().then((session)=>{if(!session)throw new Error("AUTH_REQUIRED");if(chip)chip.textContent=`${session.user.email} · ${session.user.role}`;if(loading instanceof HTMLElement)loading.hidden=true;if(shell instanceof HTMLElement)shell.hidden=false;}).catch(()=>{const current=`${window.location.pathname}${window.location.search}`;window.location.replace(`/dashboard/login.html?return=${encodeURIComponent(current)}`);});

logout?.addEventListener("click",()=>{void auth.logout();});
