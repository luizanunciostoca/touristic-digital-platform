import type { Result } from "../core/contracts.js";
import { err, ok } from "../core/contracts.js";
import type { AssistantPlan } from "../reasoning/provider.js";
import type { AssistantToolRegistry } from "../tools/tool-registry.js";

export class AssistantPlanValidator {
  constructor(private readonly registry: AssistantToolRegistry) {}

  validate(plan: AssistantPlan): Result<AssistantPlan> {
    const ids = new Set<string>();
    for (const step of plan.steps) {
      if (ids.has(step.id)) return err("VALIDATION_FAILED", "Duplicate plan step id");
      ids.add(step.id);
      const tool = this.registry.resolve(step.tool, step.version);
      if (!tool.ok) return tool;
      if (tool.value.effect !== step.effect) {
        return err("POLICY_DENIED", "Planner cannot override registered tool effect");
      }
      if (step.effect === "execute") {
        return err("POLICY_DENIED", "Planner cannot directly schedule EXECUTE");
      }
    }
    for (const step of plan.steps) {
      if (step.dependencies.some((dependency) => !ids.has(dependency))) {
        return err("VALIDATION_FAILED", "Plan has unknown dependency");
      }
    }
    return ok(plan);
  }
}
