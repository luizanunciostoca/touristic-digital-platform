export const ROLE_CAPABILITIES = {
  BUSINESS_OWNER: [
    "business.read",
    "business.profile",
    "business.location",
    "business.media",
    "business.catalog",
    "business.offers",
    "business.menu",
    "business.reservations",
    "business.ticketing",
    "business.financial.read",
    "business.content",
    "business.preview",
    "business.team",
    "business.settings",
  ],
  BUSINESS_MANAGER: [
    "business.read",
    "business.profile",
    "business.location",
    "business.media",
    "business.catalog",
    "business.offers",
    "business.menu",
    "business.reservations",
    "business.ticketing",
    "business.financial.read",
    "business.content",
    "business.preview",
  ],
  BUSINESS_VIEWER: [
    "business.read",
    "business.financial.read",
    "business.preview",
  ],
  PLATFORM_ADMIN: [
    "platform.read",
    "platform.write",
    "platform.support",
    "platform.audit",
    "platform.system",
    "growth.read",
    "growth.write",
  ],
  PLATFORM_SUPPORT: ["platform.read", "platform.support", "platform.audit"],
  AFFILIATE: [
    "affiliate.read",
    "affiliate.referral",
    "affiliate.financial.read",
    "affiliate.growth.read",
  ],
  CRM_OPERATOR: ["crm.read", "crm.write"],
  PUBLIC: ["public.read"],
};
export function can(role, capability) {
  if (!capability) return true;
  return (ROLE_CAPABILITIES[role] || []).includes(capability);
}
export function capabilitiesFor(role) {
  return [...(ROLE_CAPABILITIES[role] || [])];
}
