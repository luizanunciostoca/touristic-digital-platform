import type {
  BusinessOnboardingGuardContext,
  BusinessOnboardingHostController,
  BusinessOnboardingHostSnapshot,
} from "@touristic/business/onboarding-host";
import { resolveBusinessOnboardingStep } from "@touristic/business/onboarding-presentation";

import type { BusinessOnboardingConcreteAdapters } from "./business-onboarding-adapters.js";

export type BusinessOnboardingRuntimeAction =
  | "location-confirm"
  | "location-use-device"
  | "location-search-again"
  | "voice-simulate";

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function dispatch(
  view: Window,
  name: string,
  detail: Readonly<Record<string, unknown>>,
): void {
  view.dispatchEvent(new CustomEvent(name, { detail }));
}

export class BusinessOnboardingRuntime {
  constructor(
    private readonly host: BusinessOnboardingHostController,
    private readonly adapters: BusinessOnboardingConcreteAdapters,
    private readonly view: Window = window,
  ) {}

  async beforeTransition(
    context: BusinessOnboardingGuardContext,
  ): Promise<boolean> {
    if (context.direction === "previous") return true;
    const state = context.session.conversationDraft.context;

    if (context.fromStepId === "ready") {
      return state.businessLocationConfirmed === true;
    }
    if (context.fromStepId === "voice-discovery") {
      return state.businessVoiceDiscoveryReady === true;
    }
    if (context.fromStepId === "ranking-explanation") {
      return state.businessRankingExplanationReady === true;
    }
    if (context.fromStepId === "route") {
      return state.businessTutorialRouteReady === true;
    }
    return true;
  }

  async onStepEnter(snapshot: BusinessOnboardingHostSnapshot): Promise<void> {
    const context = snapshot.session.conversationDraft.context;
    const step = resolveBusinessOnboardingStep(snapshot.stepId, context);

    if (snapshot.stepId === "ready") {
      await this.findLocationCandidate();
      return;
    }

    if (snapshot.stepId === "menu-discovery") {
      await this.runDiscovery(text(context.category));
      return;
    }

    if (snapshot.stepId === "text-discovery") {
      await this.runDiscovery(step.description.replace(/[“”"]/gu, ""));
      return;
    }

    if (snapshot.stepId === "name-discovery") {
      await this.runDiscovery(text(context.businessName));
      return;
    }

    if (snapshot.stepId === "voice-discovery") {
      this.host.updateRuntimeContext({ businessVoiceDiscoveryReady: false });
      dispatch(this.view, "businessVoiceDiscoveryRequested", {
        prompt: step.description,
        tutorial: true,
      });
      return;
    }

    if (snapshot.stepId === "multilingual") {
      dispatch(this.view, "businessOnboardingMultilingualPresented", {
        locales: ["pt", "en", "es", "he"],
        tutorial: true,
      });
      return;
    }

    if (snapshot.stepId === "assistant-query") {
      const query = step.description.replace(/[“”"]/gu, "");
      const response = await this.adapters.assistant.ask(
        query,
        snapshot.session.selectedLanguage,
      );
      this.host.updateRuntimeContext({ businessAssistantResult: response });
      dispatch(this.view, "businessOnboardingAssistantResult", {
        query,
        response,
        tutorial: true,
      });
      return;
    }

    if (snapshot.stepId === "ranking-explanation") {
      const explanation = Object.freeze({
        category: text(context.category),
        specialty: text(context.specialty),
        audience: text(context.audience),
        objective: text(context.objective),
        hasConfirmedLocation: context.businessLocationConfirmed === true,
      });
      this.host.updateRuntimeContext({ businessRankingExplanationReady: true });
      dispatch(this.view, "businessOnboardingRankingExplanation", {
        explanation,
        tutorial: true,
      });
      return;
    }

    if (snapshot.stepId === "profile") {
      dispatch(this.view, "businessOnboardingProfileOpened", {
        businessName: text(context.businessName),
        tutorial: true,
      });
      return;
    }

    if (snapshot.stepId === "route") {
      this.host.updateRuntimeContext({ businessTutorialRouteReady: false });
      dispatch(this.view, "businessOnboardingRouteRequired", {
        location: context.businessLocation ?? null,
        tutorial: true,
        reason: "route-port-not-yet-equivalent",
      });
    }
  }

  async handleAction(
    action: BusinessOnboardingRuntimeAction,
  ): Promise<boolean> {
    if (action === "location-confirm") {
      const candidate =
        this.host.snapshot().session.conversationDraft.context
          .businessLocationCandidate;
      if (!candidate) return false;
      this.host.updateRuntimeContext({
        businessLocation: candidate,
        businessLocationCandidate: null,
        businessLocationConfirmed: true,
      });
      dispatch(this.view, "businessTutorialLocationResolved", {
        location: candidate,
        foundExisting: true,
        tutorial: true,
      });
      return true;
    }

    if (action === "location-use-device") {
      const location = await this.adapters.location.requestDeviceLocation();
      if (!location) return false;
      this.host.updateRuntimeContext({
        businessLocation: location,
        businessLocationCandidate: null,
        businessLocationConfirmed: true,
      });
      dispatch(this.view, "businessTutorialLocationResolved", {
        location,
        foundExisting: false,
        tutorial: true,
      });
      return true;
    }

    if (action === "location-search-again") {
      return this.findLocationCandidate();
    }

    if (action === "voice-simulate") {
      const snapshot = this.host.snapshot();
      const step = resolveBusinessOnboardingStep(
        "voice-discovery",
        snapshot.session.conversationDraft.context,
      );
      const results = await this.runDiscovery(
        step.description.replace(/[“”"]/gu, ""),
      );
      this.host.updateRuntimeContext({ businessVoiceDiscoveryReady: true });
      dispatch(this.view, "businessVoiceDiscoveryRecognized", {
        simulated: true,
        results,
        tutorial: true,
      });
      return true;
    }

    return false;
  }

  private async findLocationCandidate(): Promise<boolean> {
    const businessName = text(
      this.host.snapshot().session.conversationDraft.context.businessName,
    );
    if (!businessName) return false;
    const candidate =
      await this.adapters.location.findExistingLocation(businessName);
    this.host.updateRuntimeContext({
      businessLocationCandidate: candidate,
      businessLocationConfirmed: false,
    });
    dispatch(this.view, "businessTutorialLocationCandidate", {
      businessName,
      location: candidate,
      tutorial: true,
    });
    return Boolean(candidate);
  }

  private async runDiscovery(query: string): Promise<unknown> {
    if (!query) return Object.freeze([]);
    const results = await this.adapters.discovery.searchBusiness(query);
    this.host.updateRuntimeContext({ businessDiscoveryResult: results });
    dispatch(this.view, "businessOnboardingDiscoveryResult", {
      query,
      results,
      tutorial: true,
    });
    return results;
  }
}
