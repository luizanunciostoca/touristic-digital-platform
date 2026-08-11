import {
  buildBusinessTutorialRecommendationCandidate,
  evaluateBusinessTutorialRecommendation,
  type BusinessRouteCoordinate,
  type BusinessRouteResult,
} from "@touristic/business/onboarding";
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
  | "voice-simulate"
  | "route-retry";

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function routeCoordinate(value: unknown): BusinessRouteCoordinate | null {
  if (!isRecord(value)) return null;
  const coordinates = isRecord(value.coordinates) ? value.coordinates : value;
  const latitude = coordinates.latitude;
  const longitude = coordinates.longitude;
  if (
    typeof latitude !== "number" ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    typeof longitude !== "number" ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }
  return Object.freeze({ latitude, longitude });
}

function tutorialOrigin(
  destination: BusinessRouteCoordinate,
): BusinessRouteCoordinate {
  return Object.freeze({
    latitude: Math.max(-90, Math.min(90, destination.latitude - 0.0016)),
    longitude: Math.max(-180, Math.min(180, destination.longitude + 0.0017)),
  });
}

export class BusinessOnboardingRuntime {
  constructor(
    private readonly host: BusinessOnboardingHostController,
    private readonly adapters: BusinessOnboardingConcreteAdapters,
    private readonly view: Window = window,
  ) {}

  beforeTransition(context: BusinessOnboardingGuardContext): boolean {
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
      const candidate = buildBusinessTutorialRecommendationCandidate(context);
      const recommendation = evaluateBusinessTutorialRecommendation(
        query,
        candidate,
      );
      this.host.updateRuntimeContext({
        businessAssistantResult: response,
        tutorialBusinessCandidate: candidate,
        businessRecommendationResult: recommendation,
      });
      dispatch(this.view, "businessOnboardingAssistantResult", {
        query,
        response,
        tutorial: true,
      });
      dispatch(this.view, "businessTutorialRecommendationEvaluated", recommendation);
      if (recommendation.rendered) {
        dispatch(this.view, "businessConversationPresentation", {
          source: "business-recommendation-sandbox",
          kind: "recommendation",
          title: candidate.name,
          message: `Candidata compatível com a intenção: ${candidate.categoryLabel} · ${candidate.specialty}${candidate.locationIsExample ? " · localização usada apenas como exemplo" : ""}.`,
          actions: [
            { action: "place-profile", label: candidate.cta, primary: true },
            { action: "place-info", label: "Ver informações" },
          ],
          tutorial: true,
          excludeFromBusinessMetrics: true,
        });
        dispatch(this.view, "businessTutorialRecommendationRendered", recommendation);
      }
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
      await this.verifyRoute(snapshot);
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

    if (action === "route-retry") {
      return this.verifyRoute(this.host.snapshot());
    }

    return false;
  }

  private async verifyRoute(
    snapshot: BusinessOnboardingHostSnapshot,
  ): Promise<boolean> {
    const context = snapshot.session.conversationDraft.context;
    this.host.updateRuntimeContext({
      businessTutorialRouteReady: false,
      businessRouteResult: null,
    });

    const destination = routeCoordinate(context.businessLocation);
    if (!destination || context.businessLocationConfirmed !== true) {
      dispatch(this.view, "businessOnboardingRouteFailed", {
        code: "LOCATION_UNCONFIRMED",
        tutorial: true,
      });
      return false;
    }

    const result: BusinessRouteResult = await this.adapters.route.showRoute({
      origin: tutorialOrigin(destination),
      destination,
      destinationName: text(context.businessName) || "Sua empresa",
      language: snapshot.session.selectedLanguage,
    });

    this.host.updateRuntimeContext({
      businessTutorialRouteReady: result.success,
      businessRouteResult: result,
    });

    if (!result.success) {
      dispatch(this.view, "businessOnboardingRouteFailed", {
        code: result.code,
        result,
        tutorial: true,
      });
      return false;
    }

    dispatch(this.view, "businessTutorialRouteRendered", {
      ...result,
      destinationName: text(context.businessName) || "Sua empresa",
    });
    // Route verification ends Business ownership; navigation lifecycle and presentation start at the shared request event.
    dispatch(this.view, "morro:navigation-requested", {
      destination,
      source: "business-onboarding",
      tutorial: true,
    });
    return true;
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
