
import {fixtures} from "./fixtures.js";
const delay=(ms)=>new Promise(r=>setTimeout(r,ms));
export class FixtureProvider{
  constructor(seed=fixtures){ this.seed=structuredClone(seed); this.log=[]; }
  async read(interfaceDef,{state="populated"}={}){
    await delay(12);
    this.log.push({op:"read",id:interfaceDef.id,state,at:new Date().toISOString()});
    if(state==="network_error") throw new TypeError("NETWORK_ERROR");
    if(state==="api_error") throw new Error("API_ERROR");
    if(state==="timeout") throw new Error("TIMEOUT");
    return {state,data:this.seed,meta:{provider:"fixture",authoritative:false,interfaceId:interfaceDef.id}};
  }
  async command(interfaceDef,command,payload={}){
    await delay(20);
    const idempotencyKey=`fixture-${interfaceDef.id}-${command}-${JSON.stringify(payload).length}`;
    this.log.push({op:"command",id:interfaceDef.id,command,idempotencyKey,at:new Date().toISOString()});
    return {ok:true,idempotencyKey,authoritative:false,message:"Ação simulada na Fabric isolada. Nenhum backend real foi alterado."};
  }
}
export class InterfaceAdapter{
  constructor(provider=new FixtureProvider()){this.provider=provider;}
  read(def,options){return this.provider.read(def,options);}
  command(def,command,payload){return this.provider.command(def,command,payload);}
}
