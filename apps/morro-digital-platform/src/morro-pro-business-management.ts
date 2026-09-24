import {
  canonicalAuthRole,
  hasAuthCapability,
  normalizeBusinessId,
  type AuthCapability,
  type AuthRole,
} from "@touristic/auth";
import type { DashboardSessionResponse } from "@touristic/auth-browser";

export const morroProModules = Object.freeze([
  "dashboard",
  "profile",
  "location",
  "photos",
  "products",
  "offers",
  "menu",
  "reservations",
  "ticketing",
  "financial",
  "content",
  "preview",
  "team",
  "settings",
] as const);

export type MorroProModule = (typeof morroProModules)[number];

export interface MorroProModulePolicy {
  readonly id: MorroProModule;
  readonly label: string;
  readonly readCapability: AuthCapability;
  readonly mutationCapability: AuthCapability | null;
  readonly placeCapability?: string;
  readonly ownerOnly?: boolean;
}

export const morroProModulePolicies: readonly MorroProModulePolicy[] =
  Object.freeze([
    { id: "dashboard", label: "Dashboard", readCapability: "business.read", mutationCapability: null },
    { id: "profile", label: "Perfil", readCapability: "business.read", mutationCapability: "business.update" },
    { id: "location", label: "Localização", readCapability: "business.read", mutationCapability: "business.update", placeCapability: "directions" },
    { id: "photos", label: "Fotos", readCapability: "content.read", mutationCapability: "content.manage", placeCapability: "photos" },
    { id: "products", label: "Produtos", readCapability: "business.read", mutationCapability: "business.update", placeCapability: "products" },
    { id: "offers", label: "Ofertas", readCapability: "ticketing.read", mutationCapability: "ticketing.manage", placeCapability: "offers" },
    { id: "menu", label: "Cardápio", readCapability: "business.read", mutationCapability: "business.update", placeCapability: "menu" },
    { id: "reservations", label: "Reservas", readCapability: "business.read", mutationCapability: "business.update", placeCapability: "tableReservation" },
    { id: "ticketing", label: "Ticketing / check-in", readCapability: "ticketing.read", mutationCapability: "ticketing.manage", placeCapability: "tickets" },
    { id: "financial", label: "Financeiro", readCapability: "financial.read", mutationCapability: null },
    { id: "content", label: "Conteúdo", readCapability: "content.read", mutationCapability: "content.manage" },
    { id: "preview", label: "Preview", readCapability: "business.read", mutationCapability: null },
    { id: "team", label: "Equipe", readCapability: "business.read", mutationCapability: "business.update", ownerOnly: true },
    { id: "settings", label: "Configurações", readCapability: "business.read", mutationCapability: "business.update" },
  ]);

export interface MorroProModuleAccess {
  readonly id: MorroProModule;
  readonly label: string;
  readonly visible: boolean;
  readonly mutable: boolean;
  readonly reason:
    | "allowed"
    | "capability_missing"
    | "place_capability_missing"
    | "owner_only";
}

export function resolveMorroProModuleAccess(
  role: AuthRole,
  sessionCapabilities: readonly string[] | undefined,
  placeCapabilities: readonly string[] = [],
): readonly MorroProModuleAccess[] {
  const canonicalRole = canonicalAuthRole(role);
  const effectiveCapabilities = new Set(sessionCapabilities ?? []);
  const hasCapability = (capability: AuthCapability): boolean =>
    effectiveCapabilities.has(capability) || hasAuthCapability(role, capability);

  return Object.freeze(
    morroProModulePolicies.map((policy) => {
      if (policy.ownerOnly && canonicalRole !== "BUSINESS_OWNER") {
        return Object.freeze({
          id: policy.id,
          label: policy.label,
          visible: false,
          mutable: false,
          reason: "owner_only" as const,
        });
      }
      if (!hasCapability(policy.readCapability)) {
        return Object.freeze({
          id: policy.id,
          label: policy.label,
          visible: false,
          mutable: false,
          reason: "capability_missing" as const,
        });
      }
      if (
        policy.placeCapability &&
        placeCapabilities.length > 0 &&
        !placeCapabilities.includes(policy.placeCapability)
      ) {
        return Object.freeze({
          id: policy.id,
          label: policy.label,
          visible: false,
          mutable: false,
          reason: "place_capability_missing" as const,
        });
      }
      const mutable =
        policy.mutationCapability !== null &&
        hasCapability(policy.mutationCapability) &&
        canonicalRole !== "BUSINESS_VIEWER";
      return Object.freeze({
        id: policy.id,
        label: policy.label,
        visible: true,
        mutable,
        reason: "allowed" as const,
      });
    }),
  );
}

export function normalizedBusinessScopes(
  session: DashboardSessionResponse,
): readonly string[] {
  return Object.freeze(
    [...new Set(session.user.businessIds.map(normalizeBusinessId).filter(Boolean))] as string[],
  );
}

export function resolveBusinessContext(
  session: DashboardSessionResponse,
  requestedBusinessId?: unknown,
): string {
  const allowed = normalizedBusinessScopes(session);
  const requested = normalizeBusinessId(requestedBusinessId);
  if (requestedBusinessId !== undefined && requestedBusinessId !== null) {
    if (!requested) throw new Error("INVALID_BUSINESS_ID");
    if (!allowed.includes(requested)) throw new Error("BUSINESS_ACCESS_DENIED");
    return requested;
  }
  if (allowed.length === 1) return allowed[0]!;
  if (allowed.length > 1) return allowed[0]!;
  throw new Error("BUSINESS_SCOPE_REQUIRED");
}

export interface BusinessContextRequest {
  readonly businessId: string;
  readonly generation: number;
  readonly signal: AbortSignal;
}

export interface BusinessContextController {
  readonly current: () => string | null;
  readonly scopes: () => readonly string[];
  readonly switchTo: (businessId: unknown) => BusinessContextRequest;
  readonly request: () => BusinessContextRequest;
  readonly isCurrent: (request: Pick<BusinessContextRequest, "businessId" | "generation">) => boolean;
  readonly dispose: () => void;
}

export function createBusinessContextController(
  session: DashboardSessionResponse,
  initialBusinessId?: unknown,
): BusinessContextController {
  const allowed = normalizedBusinessScopes(session);
  let currentBusinessId = resolveBusinessContext(session, initialBusinessId);
  let generation = 0;
  let controller = new AbortController();

  function nextRequest(): BusinessContextRequest {
    return Object.freeze({
      businessId: currentBusinessId,
      generation,
      signal: controller.signal,
    });
  }

  return Object.freeze({
    current: () => currentBusinessId,
    scopes: () => allowed,
    switchTo(businessIdInput: unknown): BusinessContextRequest {
      const businessId = normalizeBusinessId(businessIdInput);
      if (!businessId) throw new Error("INVALID_BUSINESS_ID");
      if (!allowed.includes(businessId)) throw new Error("BUSINESS_ACCESS_DENIED");
      controller.abort("business-context-switch");
      controller = new AbortController();
      generation += 1;
      currentBusinessId = businessId;
      return nextRequest();
    },
    request: nextRequest,
    isCurrent(request): boolean {
      return (
        request.businessId === currentBusinessId &&
        request.generation === generation &&
        !controller.signal.aborted
      );
    },
    dispose(): void {
      controller.abort("business-context-disposed");
    },
  });
}
