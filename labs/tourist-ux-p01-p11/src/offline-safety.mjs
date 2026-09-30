/** P09: offline read-only safety, explicit staleness and recovery. */
const MUTATING=['POST','PUT','PATCH','DELETE'];
export function offlineDecision({online,method='GET',domain='public',cached=null,now=Date.now(),ttlMs=24*3600*1000}={}) {
  const unsafe=MUTATING.includes(String(method).toUpperCase())||['checkout','payment','inventory','booking','commission','payout','reservation'].includes(domain);
  if(!online&&unsafe)return Object.freeze({allow:false,status:'offline-blocked',reason:'Operação requer conexão e confirmação autoritativa do servidor.',readbackRequired:true});
  if(online)return Object.freeze({allow:true,status:'online',readbackRequired:unsafe});
  if(!cached||typeof cached.savedAt!=='number'||cached.savedAt>now||now-cached.savedAt>ttlMs)return Object.freeze({allow:false,status:'offline-no-cache',reason:'Não há conteúdo seguro atualizado para consulta.',readbackRequired:true});
  return Object.freeze({allow:true,status:'offline-stale',readOnly:true,notice:'Conteúdo salvo para consulta; pode estar desatualizado.',savedAt:cached.savedAt,readbackRequired:true});
}
export function recoveryAfterReconnect({wasOffline,readbackVerified,serverState}={}) {
  if(!wasOffline)return Object.freeze({status:'unchanged'});
  if(!readbackVerified)return Object.freeze({status:'revalidating',allowMutations:false,notice:'Reconectado. Validando disponibilidade e preços atuais.'});
  return Object.freeze({status:'synchronized',allowMutations:true,serverState,notice:'Conteúdo atualizado com os dados do servidor.'});
}
export function serviceWorkerCachingPolicy(request) {
  const method=String(request?.method??'GET').toUpperCase();const url=new URL(request.url,'https://preview.invalid');
  if(method!=='GET')return 'NETWORK_ONLY';
  if(url.pathname.startsWith('/api/')||/\/checkout|\/payment|\/inventory|\/order/i.test(url.pathname))return 'NETWORK_ONLY';
  if(!['https:','http:'].includes(url.protocol))return 'BYPASS';
  return 'STATIC_OR_PUBLIC_READ_ONLY';
}
