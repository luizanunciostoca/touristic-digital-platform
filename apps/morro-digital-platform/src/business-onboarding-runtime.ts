import type {
  BusinessRouteCoordinate,
  BusinessRouteResult,
} from "@touristic/business/onboarding";
import type {
  BusinessOnboardingGuardContext,
  BusinessOnboardingHostController,
  BusinessOnboardingHostSnapshot,
} from "@touristic/business/onboarding-host";
import { resolveBusinessOnboardingStep } from "@touristic/business/onboarding-presentation";
import {
  buildBusinessTutorialRecommendationCandidate,
  evaluateBusinessTutorialRecommendation,
} from "@touristic/business/onboarding-recommendation";
import { BUSINESS_ONBOARDING_CATEGORIES } from "@touristic/business/onboarding-steps";
import {
  buildBusinessTutorialPromotion,
  buildBusinessTutorialWorkspaceSnapshot,
  incrementBusinessTutorialEventSummary,
  type BusinessTutorialEventKey,
} from "@touristic/business/onboarding-workspace";

import type { BusinessOnboardingConcreteAdapters } from "./business-onboarding-adapters.js";

export type BusinessOnboardingRuntimeAction =
  | "location-confirm"
  | "location-use-device"
  | "location-search-again"
  | "voice-simulate"
  | "profile-map"
  | "profile-primary"
  | "profile-promotion"
  | "route-retry"
  | "workspace-open-dashboard"
  | `workspace-promotion-save:${string}`
  | `commercial-prepare-checkout:${string}`;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function dispatch<T extends object>(
  view: Window,
  name: string,
  detail: Readonly<T>,
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

function categoryLabel(value: unknown): string {
  const category = text(value);
  return (
    BUSINESS_ONBOARDING_CATEGORIES.find((option) => option.value === category)
      ?.label ?? "Negócio local"
  );
}

export class BusinessOnboardingRuntime {
  constructor(
    private readonly host: BusinessOnboardingHostController,
    private readonly adapters: BusinessOnboardingConcreteAdapters,
    private readonly view: Window = window,
  ) {}

  private trackTutorialEvent(key: BusinessTutorialEventKey): void {
    const context = this.host.snapshot().session.conversationDraft.context;
    const summary = incrementBusinessTutorialEventSummary(
      context.businessTutorialEventSummary,
      key,
    );
    this.host.updateRuntimeContext({ businessTutorialEventSummary: summary });
  }

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
      this.trackTutorialEvent("business_discovered_by_menu");
      return;
    }

    if (snapshot.stepId === "text-discovery") {
      await this.runDiscovery(step.description.replace(/[“”"]/gu, ""));
      this.trackTutorialEvent("business_discovered_by_text_search");
      return;
    }

    if (snapshot.stepId === "name-discovery") {
      await this.runDiscovery(text(context.businessName));
      this.trackTutorialEvent("business_discovered_by_name");
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
      dispatch(
        this.view,
        "businessTutorialRecommendationEvaluated",
        recommendation,
      );
      if (recommendation.rendered) {
        this.trackTutorialEvent("business_recommended_by_assistant");
        const locationNote = candidate.locationIsExample
          ? " · localização usada apenas como exemplo"
          : "";
        dispatch(this.view, "businessConversationPresentation", {
          source: "business-recommendation-sandbox",
          kind: "recommendation",
          title: candidate.name,
          message: `Candidata compatível com a intenção: ${candidate.categoryLabel} · ${candidate.specialty}${locationNote}.`,
          actions: [
            { action: "place-profile", label: candidate.cta, primary: true },
            { action: "place-info", label: "Ver informações" },
          ],
          tutorial: true,
          excludeFromBusinessMetrics: true,
        });
        dispatch(
          this.view,
          "businessTutorialRecommendationRendered",
          recommendation,
        );
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
      const { buildBusinessTutorialProfile } =
        await import("@touristic/business/onboarding-profile");
      const recommendationCandidate = isRecord(
        context.tutorialBusinessCandidate,
      )
        ? context.tutorialBusinessCandidate
        : null;
      const promotion = isRecord(context.businessDemoPromotion)
        ? context.businessDemoPromotion
        : null;
      const profile = buildBusinessTutorialProfile(context, {
        categoryLabel: categoryLabel(context.category),
        cta: text(recommendationCandidate?.cta) || "Ver empresa",
        ...(promotion
          ? {
              promotion: {
                id: text(promotion.id),
                title: text(promotion.title),
                description: text(promotion.description),
                cta: text(promotion.cta) || "Ver oferta",
                validUntil: text(promotion.validUntil),
              },
            }
          : {}),
      });
      this.host.updateRuntimeContext({ tutorialBusinessProfile: profile });
      this.trackTutorialEvent("business_profile_opened");
      dispatch(this.view, "businessOnboardingProfileOpened", {
        profile,
        tutorial: true,
        excludeFromBusinessMetrics: true,
      });
      return;
    }

    if (snapshot.stepId === "route") {
      await this.verifyRoute(snapshot);
      return;
    }

    if (snapshot.stepId === "partner-panel") {
      const workspace = buildBusinessTutorialWorkspaceSnapshot({
        businessName: context.businessName,
        eventSummary: context.businessTutorialEventSummary,
      });
      this.host.updateRuntimeContext({ businessTutorialWorkspace: workspace });
      dispatch(this.view, "businessTutorialWorkspaceOpened", workspace);
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
      this.trackTutorialEvent("business_discovered_by_voice");
      dispatch(this.view, "businessVoiceDiscoveryRecognized", {
        simulated: true,
        results,
        tutorial: true,
      });
      return true;
    }

    if (
      action === "profile-map" ||
      action === "profile-primary" ||
      action === "profile-promotion"
    ) {
      const profile =
        this.host.snapshot().session.conversationDraft.context
          .tutorialBusinessProfile;
      if (!isRecord(profile)) return false;

      if (action === "profile-map") {
        dispatch(this.view, "businessTutorialProfileMapAction", {
          businessId: text(profile.id),
          tutorial: true,
          excludeFromBusinessMetrics: true,
        });
        return true;
      }

      if (action === "profile-primary") {
        this.trackTutorialEvent("business_contact_action");
        dispatch(this.view, "businessTutorialProfilePrimaryAction", {
          businessId: text(profile.id),
          actionLabel: text(profile.cta),
          tutorial: true,
          excludeFromBusinessMetrics: true,
        });
        return true;
      }

      const promotion = isRecord(profile.promotion) ? profile.promotion : null;
      if (!promotion) return false;
      this.trackTutorialEvent("business_demo_promotion_viewed");
      dispatch(this.view, "businessTutorialProfilePromotionAction", {
        businessId: text(profile.id),
        promotionId: text(promotion.id),
        tutorial: true,
        excludeFromBusinessMetrics: true,
      });
      return true;
    }

    if (action === "route-retry") {
      return this.verifyRoute(this.host.snapshot());
    }

    if (action === "workspace-open-dashboard") {
      dispatch(this.view, "businessProtectedDashboardRequested", {
        href: "/apps/morro-digital-platform/public/business-dashboard.html",
        tutorial: true,
        requiresAuthentication: true,
        excludeFromBusinessMetrics: true,
      });
      return true;
    }

    if (action.startsWith("commercial-prepare-checkout:")) {
      let input: Record<string, unknown>;
      try {
        input = JSON.parse(
          decodeURIComponent(
            action.slice("commercial-prepare-checkout:".length),
          ),
        ) as Record<string, unknown>;
      } catch {
        return false;
      }
      const snapshot = this.host.snapshot();
      const context = snapshot.session.conversationDraft.context;
      const {
        buildBusinessCommercialAcceptances,
        buildBusinessCommercialCheckoutHandoff,
        buildBusinessCommercialContractor,
        recommendBusinessCommercialPlan,
      } = await import("@touristic/business/onboarding-commercial-conversion");
      const contractorInput = isRecord(input.contractor)
        ? input.contractor
        : {};
      const contractor = buildBusinessCommercialContractor(contractorInput);
      const acceptedTerms = buildBusinessCommercialAcceptances(
        {
          terms: input.acceptTerms === true,
          privacy: input.acceptPrivacy === true,
          marketing: input.marketingConsent === true,
        },
        new Date().toISOString(),
      );
      const recommendedPlan = recommendBusinessCommercialPlan(
        context.objective,
      );
      const planId = text(input.selectedPlanId) || recommendedPlan?.id || "";
      const handoff = buildBusinessCommercialCheckoutHandoff({
        sessionId: `business-onboarding:${snapshot.session.createdAt}`,
        planId,
        contractor,
        acceptedTerms,
        businessDraft: { ...snapshot.session.businessDraft },
        returnUrl: this.view.location.href,
      });
      if (!handoff) return false;
      this.host.updateRuntimeContext({
        businessCommercialCheckoutHandoff: handoff,
      });
      dispatch(this.view, "businessCheckoutRequested", handoff);
      dispatch(this.view, "businessCommercialCheckoutPrepared", {
        planId: handoff.planId,
        requiresPaymentsCapability: true,
        tutorial: false,
      });
      return true;
    }

    if (action.startsWith("workspace-promotion-save:")) {
      let input: Record<string, unknown>;
      try {
        input = JSON.parse(
          decodeURIComponent(action.slice("workspace-promotion-save:".length)),
        ) as Record<string, unknown>;
      } catch {
        return false;
      }
      const promotion = buildBusinessTutorialPromotion(input);
      if (!promotion) return false;
      this.host.updateRuntimeContext({ businessDemoPromotion: promotion });
      this.trackTutorialEvent("business_demo_promotion_created");
      dispatch(this.view, "businessTutorialPromotionSaved", {
        promotion,
        tutorial: true,
        excludeFromBusinessMetrics: true,
      });
      return true;
    }

    return false;
  }

  async verifyPayment(
    detail: Readonly<Record<string, unknown>>,
  ): Promise<boolean> {
    const snapshot = this.host.snapshot();
    const { acceptBusinessCommercialVerifiedPayment } =
      await import("@touristic/business/onboarding-commercial-conversion");
    const activation = acceptBusinessCommercialVerifiedPayment(
      `business-onboarding:${snapshot.session.createdAt}`,
      detail,
    );
    if (!activation) return false;
    this.host.updateRuntimeContext({
      businessCommercialActivation: activation,
    });
    dispatch(this.view, "businessCommercialActivationReady", {
      ...activation,
      verifiedByPaymentsBoundary: true,
      tutorial: false,
    });
    return true;
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

    this.trackTutorialEvent("business_route_started");
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
