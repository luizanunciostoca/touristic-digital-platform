export const FIXED_ISO = "2026-09-21T18:00:00.000Z";

export const VIEWPORTS = Object.freeze([
  { width: 1440, height: 900, label: "1440x900" },
  { width: 1280, height: 800, label: "1280x800" },
  { width: 1024, height: 768, label: "1024x768" },
  { width: 768, height: 1024, label: "768x1024" },
  { width: 430, height: 932, label: "430x932" },
  { width: 390, height: 844, label: "390x844" },
]);

export const SURFACES = Object.freeze([
  { id: "overview", route: "#overview", view: "overview" },
  { id: "businesses", route: "#businesses", view: "businesses" },
  { id: "business-360", route: "#businesses:toca-do-morcego", view: "businesses", entity360: true },
  { id: "affiliates", route: "#affiliates", view: "affiliates" },
  { id: "affiliate-360", route: "#affiliates:affiliate-visual-001", view: "affiliates", entity360: true },
  { id: "users", route: "#users", view: "users" },
  { id: "user-360", route: "#users:business-owner-visual", view: "users", entity360: true },
  { id: "crm", route: "#crm", view: "crm" },
  { id: "products", route: "#products", view: "products" },
  { id: "reservations", route: "#reservations", view: "reservations" },
  { id: "ticketing", route: "#ticketing", view: "ticketing" },
  { id: "orders", route: "#orders", view: "orders" },
  { id: "financial", route: "#financial", view: "financial" },
  { id: "content", route: "#content", view: "content" },
  { id: "destinations", route: "#destinations", view: "destinations" },
  { id: "support", route: "#support", view: "support" },
  { id: "audit", route: "#audit", view: "audit" },
  { id: "system", route: "#system", view: "system" },
  { id: "settings", route: "#settings", view: "settings" },
]);

export const MANUAL_HASHES = Object.freeze({
  controlCenterUxV1: "ae9aa18a07462ccab44b79250a9d28580a21ecae5ef2d3d2343d998b946c77ab",
  developerUxV2: "9e4c5a637c703a6f43764f9c3ec971f4b48294ac649076fddb134ccd712de0ed",
});

const USERS = [
  {
    id: "platform-owner-visual",
    email: "platform-owner@example.com",
    role: "PLATFORM_OWNER",
    canonicalRole: "PLATFORM_OWNER",
    configuredRole: "PLATFORM_OWNER",
    configuredCanonicalRole: "PLATFORM_OWNER",
    status: "active",
    businessIds: [],
    capabilities: ["users.manage","business.update","crm.manage","ticketing.manage","content.manage","affiliate.suspend","financial.manage","support.impersonate"],
  },
  {
    id: "business-owner-visual",
    email: "business-owner@example.com",
    role: "BUSINESS_OWNER",
    canonicalRole: "BUSINESS_OWNER",
    configuredRole: "BUSINESS_OWNER",
    configuredCanonicalRole: "BUSINESS_OWNER",
    status: "active",
    businessIds: ["toca-do-morcego"],
    capabilities: ["business.read","reservation.read"],
  },
  {
    id: "affiliate-user-visual",
    email: "affiliate@example.com",
    role: "AFFILIATE",
    canonicalRole: "AFFILIATE",
    configuredRole: "AFFILIATE",
    configuredCanonicalRole: "AFFILIATE",
    status: "active",
    businessIds: [],
    capabilities: [],
  },
];

const DESTINATIONS = [
  {
    id: "morro-de-sao-paulo", status: "active", locale: "pt-BR",
    timezone: "America/Bahia", currency: "BRL", version: 7,
    branding: { name: "Morro de São Paulo", shortName: "Morro", tagline: "Descubra, viva, volte." },
    center: { lat: -13.3777, lng: -38.9144, zoom: 14 },
    modules: ["map","navigation","assistant","commerce"],
    featureFlags: { assistant: true, commerce: true },
  },
  {
    id: "itacare", status: "active", locale: "pt-BR",
    timezone: "America/Bahia", currency: "BRL", version: 3,
    branding: { name: "Itacaré", shortName: "Itacaré", tagline: "Costa do Cacau." },
    center: { lat: -14.278, lng: -38.9959, zoom: 13 },
    modules: ["map","navigation","commerce"],
    featureFlags: { assistant: true, commerce: true },
  },
];

const BUSINESSES = [
  {
    id: "toca-do-morcego", name: "Toca do Morcego",
    destinationId: "morro-de-sao-paulo", source: "Identity + Business owner",
    members: [{ id: "business-owner-visual", email: "business-owner@example.com", canonicalRole: "BUSINESS_OWNER" }],
  },
  {
    id: "pousada-visual", name: "Pousada Horizonte",
    destinationId: "itacare", source: "Identity + Business owner", members: [],
  },
];

const AFFILIATES = [{
  affiliateId: "affiliate-visual-001",
  identityReference: "affiliate@example.com",
  status: "active", roleCategory: "creator",
  approvedMembershipCount: 1, suspendedMembershipCount: 0, conversionCount: 2,
}];

const PRODUCTS = [{
  businessId: "toca-do-morcego", availableQuantity: 38,
  offer: {
    id: "off_visual_001", label: "Sunset Premium",
    destinationId: "morro-de-sao-paulo", capacity: 60, maxPerReservation: 6,
    enabled: true, pricingVersion: "morro-pro-v1",
    unitAmount: { minorUnits: 12500, currency: "BRL" },
    salesStartAt: "2026-09-01T10:00:00.000Z", salesEndAt: "2026-09-30T22:00:00.000Z",
    startsAt: "2026-09-21T19:30:00.000Z", endsAt: "2026-09-21T23:30:00.000Z",
    product: { kind: "business_experience", reference: "sunset-premium" },
  },
}];

const RESERVATIONS = [{
  businessId: "toca-do-morcego", inventoryLabel: "Sunset Premium",
  reservation: {
    id: "res_visual_001", inventoryId: "inv_visual_001",
    destinationId: "morro-de-sao-paulo",
    holderReference: "visitante.visual@example.com", quantity: 2,
    status: "confirmed", createdAt: "2026-09-21T14:15:00-03:00",
    orderId: "ord_visual_001", paymentId: "pay_visual_001",
    unitAmount: { minorUnits: 12500, currency: "BRL" },
    product: { kind: "business_experience", reference: "sunset-premium" },
  },
}];

const AUDIT = [
  { timestamp:"2026-09-21T17:45:00.000Z", actorUserId:"platform-owner-visual", actorRole:"PLATFORM_OWNER", action:"business.destination.updated", entityType:"business", entityId:"toca-do-morcego", tenantId:"toca-do-morcego", result:"success" },
  { timestamp:"2026-09-21T16:30:00.000Z", actorUserId:"platform-owner-visual", actorRole:"PLATFORM_OWNER", action:"content.preview.reviewed", entityType:"content", entityId:"place-segunda-praia", result:"success" },
  { timestamp:"2026-09-21T15:10:00.000Z", actorUserId:"platform-owner-visual", actorRole:"PLATFORM_OWNER", action:"affiliate.membership.reviewed", entityType:"affiliate", entityId:"affiliate-visual-001", result:"success" },
];

const DASHBOARD = {
  summary: { businesses: 2, users: 3, alerts: 2 },
  health: {
    readiness: "degraded",
    release: { sha: "visual-baseline-sha", version: "0.1.0-visual", deploymentId: "visual-regression" },
    checks: [
      { name:"API administrativa", status:"pass", detail:"Contratos disponíveis" },
      { name:"Fila de webhooks", status:"warn", detail:"1 retry pendente" },
    ],
  },
  modules: {
    businesses:{state:"available"}, users:{state:"available"}, affiliates:{state:"available"},
    crm:{state:"available"}, ticketing:{state:"available"}, financial:{state:"available"},
    content:{state:"available"}, destinations:{state:"available"}, webhooks:{state:"partial"},
  },
};

function byDestination(rows, url, readDestination) {
  const destinationId = url.searchParams.get("destinationId");
  return destinationId ? rows.filter((row) => readDestination(row) === destinationId) : rows;
}

export function fixtureResponse(url, method) {
  const prefix = "/api/admin/v1";
  const path = url.pathname.startsWith(prefix) ? (url.pathname.slice(prefix.length) || "/") : url.pathname;

  if (method !== "GET") return { status: 405, body: { error: "VISUAL_FIXTURE_READ_ONLY" } };
  if (path === "/session") return { status:200, body:{ actor:USERS[0], effectiveUser:USERS[0], support:null } };
  if (path === "/dashboard") return { status:200, body:DASHBOARD };
  if (path === "/destinations") return { status:200, body:{ destinations:DESTINATIONS } };

  const destination = path.match(/^\/destinations\/([^/]+)$/u);
  if (destination) {
    const item = DESTINATIONS.find((candidate) => candidate.id === decodeURIComponent(destination[1]));
    return item ? { status:200, body:{data:item} } : { status:404, body:{error:"DESTINATION_NOT_FOUND"} };
  }

  if (path === "/users") return { status:200, body:{users:USERS} };
  const sessions = path.match(/^\/users\/([^/]+)\/sessions$/u);
  if (sessions) return { status:200, body:{sessions:[
    {handle:"sess_visual_000000000001",issuedAt:1790000000,expiresAt:1890000000,revokedAt:null},
    {handle:"sess_visual_revoked_0002",issuedAt:1789900000,expiresAt:1890000000,revokedAt:1790001000},
  ]} };
  const user = path.match(/^\/users\/([^/]+)$/u);
  if (user) {
    const item = USERS.find((candidate) => candidate.id === decodeURIComponent(user[1]));
    return item ? { status:200, body:{user:item} } : { status:404, body:{error:"USER_NOT_FOUND"} };
  }

  if (path === "/businesses") {
    return { status:200, body:{
      businesses:byDestination(BUSINESSES,url,(item)=>item.destinationId),
      destinationScope:"owner-backed",
    } };
  }
  const profile = path.match(/^\/businesses\/([^/]+)\/profile$/u);
  if (profile) {
    const id = decodeURIComponent(profile[1]);
    const item = BUSINESSES.find((candidate) => candidate.id === id);
    return item ? { status:200, body:{profile:{
      id, name:item.name, destinationId:item.destinationId, categoryLabel:"Experiência",
      specialty:"Sunset", description:"Experiência premium ao pôr do sol.",
      cta:"Ver empresa", locationLabel:"Morro de São Paulo",
    }} } : { status:404, body:{error:"BUSINESS_NOT_FOUND"} };
  }

  if (path === "/affiliates") {
    const destinationId = url.searchParams.get("destinationId");
    return { status:200, body:{data:(!destinationId || destinationId === "morro-de-sao-paulo") ? AFFILIATES : []} };
  }
  const affiliate = path.match(/^\/affiliates\/([^/]+)$/u);
  if (affiliate) return { status:200, body:{data:{
    affiliate:{affiliateId:"affiliate-visual-001",identityReference:"affiliate@example.com",status:"active",accountType:"individual",roleCategory:"creator",identityVerified:true,contactVerified:true,fraudBlocked:false},
    memberships:[{programId:"morro-creators",destinationId:"morro-de-sao-paulo",status:"approved",eligibleForAttribution:true,financialOnboardingStatus:"ready"}],
    attribution:{count:14,latestAt:"2026-09-21T16:00:00.000Z"},
    summaryByCurrency:[{currency:"BRL",pendingMinor:4200,earnedMinor:16800,reversedMinor:0,disputedMinor:0}],
    conversions:[{conversionId:"conv_visual_001",orderId:"ord_visual_001",eligibleRevenueMinor:25000,commissionMinor:2500,currency:"BRL",entitlementStatus:"earned",materializationState:"materialized"}],
    payoutAuthority:{owner:"Financial"},
  }} };

  if (path === "/crm/leads") return { status:200, body:{data:[
    {id:42,companyName:"Pousada Horizonte",destinationId:"morro-de-sao-paulo",contactName:"Ana Costa",email:"ana@example.com",stage:"proposal",status:"active",monthlyValue:"1490.00"},
    {id:43,companyName:"Restaurante Farol",destinationId:"morro-de-sao-paulo",contactName:"Carlos Lima",email:"carlos@example.com",stage:"first_contact",status:"active",monthlyValue:"890.00"},
  ]} };

  if (path === "/products") {
    const businessId = url.searchParams.get("businessId");
    let rows = byDestination(PRODUCTS,url,(item)=>item.offer.destinationId);
    if (businessId) rows = rows.filter((item)=>item.businessId === businessId);
    return {status:200,body:{data:rows}};
  }

  if (path === "/reservations") {
    const businessId = url.searchParams.get("businessId");
    let rows = byDestination(RESERVATIONS,url,(item)=>item.reservation.destinationId);
    if (businessId) rows = rows.filter((item)=>item.businessId === businessId);
    return {status:200,body:{data:rows}};
  }

  if (path === "/ticketing/inventory") return {status:200,body:{data:[
    {id:"inv_visual_001",label:"Sunset Premium",productReference:"sunset-premium",available:38,capacity:60,unitAmount:{minorUnits:12500,currency:"BRL"}},
    {id:"inv_visual_002",label:"Passeio Volta à Ilha",productReference:"volta-ilha",available:16,capacity:24,unitAmount:{minorUnits:22000,currency:"BRL"}},
  ]}};

  if (path === "/content") return {status:200,body:{data:[
    {id:"place-segunda-praia",destinationId:"morro-de-sao-paulo",kind:"place",locale:"pt-BR",status:"published",version:4,fields:{title:"Segunda Praia",summary:"Praia com gastronomia, lazer e vida noturna."},sourceReference:"place:segunda-praia",createdAt:"2026-08-20T12:00:00.000Z",updatedAt:"2026-09-20T18:00:00.000Z",publishedAt:"2026-09-01T10:00:00.000Z",scheduledFor:null,archivedAt:null},
    {id:"event-sunset-visual",destinationId:"morro-de-sao-paulo",kind:"event",locale:"pt-BR",status:"preview",version:2,fields:{title:"Sunset em Morro"},sourceReference:"event:sunset",createdAt:"2026-09-18T12:00:00.000Z",updatedAt:"2026-09-21T10:00:00.000Z",publishedAt:null,scheduledFor:null,archivedAt:null},
  ]}};

  if (path === "/audit") return {status:200,body:{durability:"mysql-append-only",entries:AUDIT}};
  if (path === "/system") return {status:200,body:{
    release:{sha:"visual-baseline-sha",version:"0.1.0-visual",deploymentId:"visual-regression"},
    health:DASHBOARD.health,secrets:"redacted",
  }};

  const payment = path.match(/^\/payments\/([^/]+)$/u);
  if (payment) return {status:200,body:{data:{id:decodeURIComponent(payment[1]),status:"APPROVED",amount:{minorUnits:25000,currency:"BRL"},subject:{reference:"ord_visual_001"},providerReference:"mp_visual_001",updatedAt:"2026-09-21T16:20:00.000Z"}}};

  const order = path.match(/^\/orders\/([^/]+)$/u);
  if (order) return {status:200,body:{data:{id:decodeURIComponent(order[1]),status:"paid",source:{kind:"reservation",reference:"res_visual_001"},pricing:{amount:{minorUnits:25000,currency:"BRL"},planName:"Sunset Premium"},updatedAt:"2026-09-21T16:20:00.000Z"}}};

  if (path === "/search") return {status:200,body:{results:[{type:"business",title:"Toca do Morcego",context:"Morro de São Paulo",href:"#businesses:toca-do-morcego"}]}};

  return {status:404,body:{error:"VISUAL_FIXTURE_NOT_IMPLEMENTED",path}};
}
