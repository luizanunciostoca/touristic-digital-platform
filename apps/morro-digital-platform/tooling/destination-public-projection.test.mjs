import { describe, expect, it } from "vitest";
import { projectPublicDestination, resolvePublicDestination } from "./destination-public-projection.mjs";

const fallback = Object.freeze({
  id:"morro-de-sao-paulo",name:"Morro de São Paulo",countryCode:"BR",timezone:"America/Bahia",currency:"BRL",
  center:{latitude:-13.3833,longitude:-38.9167},radiusMeters:15000,
  modules:{marketplace:true,map:true,navigation:true,assistant:true,businessPortal:true,adminCrm:true,booking:false,payments:false,affiliates:false},
});
const owner = {
  id:"morro-de-sao-paulo",status:"active",timezone:"America/Bahia",currency:"BRL",
  branding:{name:"Morro Owner",shortName:"Morro",tagline:"Governado"},
  center:{lat:-13.38,lng:-38.91,zoom:14},modules:["map","assistant"],
  featureFlags:{map:true,assistant:true,booking:true},version:7,createdAt:"secret",updatedAt:"secret",
};
describe("public destination projection",()=>{
  it("projects only public runtime fields from active owner",()=>{
    const projected=projectPublicDestination(owner,fallback);
    expect(projected.name).toBe("Morro Owner");
    expect(projected.center).toEqual({latitude:-13.38,longitude:-38.91});
    expect(projected.modules.booking).toBe(true);
    expect(projected).not.toHaveProperty("version");
    expect(projected).not.toHaveProperty("createdAt");
    expect(projected).not.toHaveProperty("branding");
    expect(projected).not.toHaveProperty("featureFlags");
  });
  it("rejects suspended, malformed and foreign owner documents",()=>{
    expect(projectPublicDestination({...owner,status:"suspended"},fallback)).toBeNull();
    expect(projectPublicDestination({...owner,center:{lat:"bad",lng:-38.91}},fallback)).toBeNull();
    expect(projectPublicDestination({...owner,id:"other"},fallback)).toBeNull();
  });
  it("falls back when owner runtime is unavailable or throws",async()=>{
    expect(await resolvePublicDestination({state:"unavailable"},fallback)).toBe(fallback);
    const runtime={state:"configured",service:{read:async()=>{throw new Error("db down")}}};
    expect(await resolvePublicDestination(runtime,fallback)).toBe(fallback);
  });
  it("uses active owner data through the runtime service",async()=>{
    const runtime={state:"configured",service:{read:async()=>({destination:owner})}};
    expect((await resolvePublicDestination(runtime,fallback)).name).toBe("Morro Owner");
  });
});
