import type { AssistantContextEnvelope } from "../context/context-envelope.js";
import type { Result, ToolEffect } from "../core/contracts.js";
import { err, ok } from "../core/contracts.js";

export interface ToolPolicyDescriptor {
  readonly name: string;
  readonly effect: ToolEffect;
  readonly permissions: readonly string[];
  readonly offlineAllowed: boolean;
  readonly domain: string;
}

export interface PolicySnapshot {
  readonly executeEnabled: boolean;
  readonly memoryWritesEnabled: boolean;
  readonly proactiveEnabled: boolean;
  readonly disabledTools: ReadonlySet<string>;
  readonly unhealthyDomains: ReadonlySet<string>;
}

export interface PolicyDecision {
  readonly allowed: boolean;
  readonly requiresConfirmation: boolean;
  readonly reason?: string;
}

export class AssistantPolicyEngine {
  constructor(private readonly snapshot: PolicySnapshot) {}

  evaluateTool(
    descriptor: ToolPolicyDescriptor,
    context: Readonly<AssistantContextEnvelope>,
  ): Result<PolicyDecision> {
    if (this.snapshot.disabledTools.has(descriptor.name)) {
      return err("POLICY_DENIED", "Tool disabled by kill switch");
    }
    if (this.snapshot.unhealthyDomains.has(descriptor.domain)) {
      return err("UNAVAILABLE", "Tool domain is unhealthy", true);
    }
    if (!context.environment.online && !descriptor.offlineAllowed) {
      return err("UNAVAILABLE", "Tool unavailable offline", true);
    }
    const scopes = new Set(context.permissions.scopes);
    for (const permission of descriptor.permissions) {
      if (
        permission === "context:location" &&
        (!context.permissions.locationAllowed || context.location === null)
      ) {
        return err("POLICY_DENIED", "Location permission is missing");
      }
      if (permission === "context:profile" && !context.permissions.profileAllowed) {
        return err("POLICY_DENIED", "Profile permission is missing");
      }
      if (
        permission !== "context:location" &&
        permission !== "context:profile" &&
        !scopes.has(permission)
      ) {
        return err("POLICY_DENIED", "Required permission is missing");
      }
    }
    if (descriptor.effect === "execute" && !this.snapshot.executeEnabled) {
      return err("POLICY_DENIED", "Real execute is disabled");
    }
    return ok({
      allowed: true,
      requiresConfirmation: descriptor.effect === "confirm" || descriptor.effect === "execute",
    });
  }

  canWriteMemory(context: Readonly<AssistantContextEnvelope>): boolean {
    return this.snapshot.memoryWritesEnabled && context.permissions.memoryWriteAllowed;
  }

  canRunProactive(): boolean {
    return this.snapshot.proactiveEnabled;
  }

  canUseLocation(context: Readonly<AssistantContextEnvelope>): boolean {
    return context.permissions.locationAllowed && context.location !== null;
  }

  canAccessProfile(context: Readonly<AssistantContextEnvelope>): boolean {
    return context.permissions.profileAllowed;
  }

  domainHealthy(domain: string): boolean {
    return !this.snapshot.unhealthyDomains.has(domain);
  }
}
