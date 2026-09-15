import {
  morroV1SearchCatalog,
  type MorroV1SearchCatalogItem,
} from "@touristic/search";

import { createAssistantMessageDom } from "../assistant/assistant-message-dom.js";
import type { BrowserLocation } from "./browser-geolocation.js";
import type {
  NavigationSpeech,
  NavigationSpeechLanguage,
} from "./navigation-speech.js";

export interface NavigationSuggestionSponsorRule {
  readonly priority: number;
  readonly radiusMeters: number;
}

export interface NavigationSuggestionPolicy {
  readonly warmupMs: number;
  readonly movementThresholdMeters: number;
  readonly defaultRadiusMeters: number;
  readonly minIntervalBetweenSuggestionsMs: number;
  readonly perPlaceCooldownMs: number;
  readonly sessionMaximum: number;
  readonly displayDurationMs: number;
  readonly enabledCategories: ReadonlySet<string>;
  readonly categoryPriority: Readonly<Record<string, number>>;
  readonly categoryRadius: Readonly<Record<string, number>>;
  readonly sponsors: ReadonlyMap<string, NavigationSuggestionSponsorRule>;
}

export interface NavigationSuggestionSelection {
  readonly placeName: string;
  readonly category: string;
  readonly distanceMeters: number;
  readonly sponsored: boolean;
}

export interface NavigationContextualSuggestion extends NavigationSuggestionSelection {
  readonly message: string;
}

export interface NavigationSuggestionSession {
  start(startedAt?: number): void;
  observe(
    location: BrowserLocation,
    now?: number,
  ): NavigationSuggestionSelection | null;
  stop(): void;
}

export interface NavigationContextualSuggestions {
  start(startedAt?: number): void;
  observe(
    location: BrowserLocation,
    now?: number,
  ): NavigationContextualSuggestion | null;
  stop(): void;
  destroy(): void;
}

const EARTH_RADIUS_METERS = 6_371_000;

/**
 * Source-exact active V1 policy recovered from canonical ZIP sourceCommit
 * 55acb639c1112a3c9a646dd103b01ad9cf5dd106:
 * `navigation-suggestions.js` + `navigation-sponsors.js`.
 *
 * The canonical SPONSORS array contains no active entries, therefore the
 * default sponsor map is intentionally empty while retaining V1's sponsor
 * priority/radius contract for injected policies and future configuration.
 */
export const NAVIGATION_SUGGESTION_V1_POLICY: NavigationSuggestionPolicy =
  Object.freeze({
    warmupMs: 20_000,
    movementThresholdMeters: 30,
    defaultRadiusMeters: 200,
    minIntervalBetweenSuggestionsMs: 60_000,
    perPlaceCooldownMs: 5 * 60_000,
    sessionMaximum: 10,
    displayDurationMs: 8_000,
    enabledCategories: new Set<string>([
      "restaurants",
      "shops",
      "attractions",
      "hotels",
      "nightlife",
      "tours",
    ]),
    categoryPriority: Object.freeze({
      restaurants: 1,
      attractions: 2,
      shops: 3,
      tours: 4,
      hotels: 5,
      nightlife: 6,
      emergencies: 0,
    }),
    categoryRadius: Object.freeze({
      emergencies: 500,
      restaurants: 200,
      shops: 150,
      attractions: 300,
      hotels: 250,
      nightlife: 200,
      tours: 300,
    }),
    sponsors: new Map<string, NavigationSuggestionSponsorRule>(),
  });

/** @deprecated Use NAVIGATION_SUGGESTION_V1_POLICY. */
export const NAVIGATION_SUGGESTION_FUNCTIONAL_POLICY =
  NAVIGATION_SUGGESTION_V1_POLICY;

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

export function navigationSuggestionDistanceMeters(
  left: Pick<BrowserLocation, "latitude" | "longitude">,
  right: Pick<MorroV1SearchCatalogItem, "latitude" | "longitude">,
): number {
  const latitudeDelta = toRadians(right.latitude - left.latitude);
  const longitudeDelta = toRadians(right.longitude - left.longitude);
  const leftLatitude = toRadians(left.latitude);
  const rightLatitude = toRadians(right.latitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(leftLatitude) *
      Math.cos(rightLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  return (
    EARTH_RADIUS_METERS *
    2 *
    Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)))
  );
}

export function navigationSuggestionMessage(
  language: NavigationSpeechLanguage,
  placeName: string,
  distanceMeters: number,
): string {
  const distance = Math.max(1, Math.round(distanceMeters));
  switch (language) {
    case "en":
      return `${placeName} is about ${distance} meters from you.`;
    case "es":
      return `${placeName} está a unos ${distance} metros de ti.`;
    case "he":
      return `${placeName} נמצא במרחק של כ-${distance} מטר ממך.`;
    default:
      return `${placeName} está a cerca de ${distance} metros de você.`;
  }
}

function normalizedSponsorName(value: string): string {
  return value.trim().toLocaleLowerCase("pt-BR");
}

function sponsorFor(
  place: MorroV1SearchCatalogItem,
  policy: NavigationSuggestionPolicy,
): NavigationSuggestionSponsorRule | null {
  const exact = policy.sponsors.get(place.name);
  if (exact) return exact;
  const normalized = normalizedSponsorName(place.name);
  for (const [name, sponsor] of policy.sponsors) {
    if (normalizedSponsorName(name) === normalized) return sponsor;
  }
  return null;
}

function organicPriority(
  category: string,
  policy: NavigationSuggestionPolicy,
): number {
  // V1 uses `(categoryPriority[category] || 5) + 10`.
  return (policy.categoryPriority[category] || 5) + 10;
}

function organicRadius(
  category: string,
  policy: NavigationSuggestionPolicy,
): number {
  return policy.categoryRadius[category] || policy.defaultRadiusMeters;
}

interface NavigationSuggestionCandidate {
  readonly place: MorroV1SearchCatalogItem;
  readonly distanceMeters: number;
  readonly priority: number;
  readonly sponsored: boolean;
}

function selectCandidate(input: {
  readonly location: BrowserLocation;
  readonly catalog: readonly MorroV1SearchCatalogItem[];
  readonly policy: NavigationSuggestionPolicy;
  readonly cooldownByPlace: ReadonlyMap<string, number>;
  readonly now: number;
}): NavigationSuggestionCandidate | null {
  const candidates: NavigationSuggestionCandidate[] = [];

  for (const place of input.catalog) {
    const sponsor = sponsorFor(place, input.policy);
    if (!sponsor && !input.policy.enabledCategories.has(place.category)) continue;

    const lastShownAt = input.cooldownByPlace.get(place.name) ?? 0;
    if (input.now - lastShownAt < input.policy.perPlaceCooldownMs) continue;

    const distanceMeters = navigationSuggestionDistanceMeters(
      input.location,
      place,
    );
    const radius = sponsor
      ? sponsor.radiusMeters || input.policy.defaultRadiusMeters
      : organicRadius(place.category, input.policy);
    if (distanceMeters > radius) continue;

    candidates.push({
      place,
      distanceMeters,
      priority: sponsor
        ? sponsor.priority || 1
        : organicPriority(place.category, input.policy),
      sponsored: sponsor !== null,
    });
  }

  candidates.sort((left, right) => {
    if (left.priority !== right.priority) return left.priority - right.priority;
    return left.distanceMeters - right.distanceMeters;
  });
  return candidates[0] ?? null;
}

export function createNavigationSuggestionSession(
  options: {
    readonly catalog?: readonly MorroV1SearchCatalogItem[];
    readonly policy?: NavigationSuggestionPolicy;
  } = {},
): NavigationSuggestionSession {
  const catalog = options.catalog ?? morroV1SearchCatalog;
  const policy = options.policy ?? NAVIGATION_SUGGESTION_V1_POLICY;
  const cooldownByPlace = new Map<string, number>();
  let startedAt: number | null = null;
  let lastEvaluationLocation: BrowserLocation | null = null;
  let lastSuggestionAt = 0;
  let emitted = 0;

  return Object.freeze({
    start(value: number = Date.now()): void {
      startedAt = value;
      lastEvaluationLocation = null;
      lastSuggestionAt = 0;
      emitted = 0;
      cooldownByPlace.clear();
    },
    observe(
      location: BrowserLocation,
      now: number = Date.now(),
    ): NavigationSuggestionSelection | null {
      if (
        startedAt === null ||
        emitted >= policy.sessionMaximum ||
        now - startedAt < policy.warmupMs ||
        now - lastSuggestionAt < policy.minIntervalBetweenSuggestionsMs
      ) {
        return null;
      }

      if (
        lastEvaluationLocation &&
        navigationSuggestionDistanceMeters(location, lastEvaluationLocation) <
          policy.movementThresholdMeters
      ) {
        return null;
      }
      // V1 updates the last checked position even when no candidate is found.
      lastEvaluationLocation = location;

      const selected = selectCandidate({
        location,
        catalog,
        policy,
        cooldownByPlace,
        now,
      });
      if (!selected) return null;

      cooldownByPlace.set(selected.place.name, now);
      lastSuggestionAt = now;
      emitted += 1;
      return Object.freeze({
        placeName: selected.place.name,
        category: selected.place.category,
        distanceMeters: selected.distanceMeters,
        sponsored: selected.sponsored,
      });
    },
    stop(): void {
      startedAt = null;
      lastEvaluationLocation = null;
      lastSuggestionAt = 0;
      emitted = 0;
      cooldownByPlace.clear();
    },
  });
}

export function createNavigationContextualSuggestions(options: {
  readonly document: Document;
  readonly speech: NavigationSpeech;
  readonly catalog?: readonly MorroV1SearchCatalogItem[];
  readonly policy?: NavigationSuggestionPolicy;
}): NavigationContextualSuggestions {
  const policy = options.policy ?? NAVIGATION_SUGGESTION_V1_POLICY;
  const session = createNavigationSuggestionSession({
    ...(options.catalog ? { catalog: options.catalog } : {}),
    policy,
  });
  const messages = createAssistantMessageDom({ document: options.document });
  let messageVisible = false;
  let clearTimer: number | null = null;
  let messageVersion = 0;
  let destroyed = false;

  function cancelClearTimer(): void {
    if (clearTimer === null) return;
    options.document.defaultView?.clearTimeout(clearTimer);
    clearTimer = null;
  }

  function clearMessage(): void {
    cancelClearTimer();
    if (!messageVisible) return;
    messages.clear(
      "navigation",
      (message) => message.messageType === "navigation_suggestion",
    );
    messageVisible = false;
  }

  function scheduleClear(version: number): void {
    cancelClearTimer();
    const view = options.document.defaultView;
    if (!view || policy.displayDurationMs <= 0) return;
    clearTimer = view.setTimeout(() => {
      clearTimer = null;
      if (version !== messageVersion) return;
      messages.clear(
        "navigation",
        (message) => message.messageType === "navigation_suggestion",
      );
      messageVisible = false;
    }, policy.displayDurationMs);
  }

  return Object.freeze({
    start(value: number = Date.now()): void {
      if (destroyed) return;
      clearMessage();
      messageVersion += 1;
      session.start(value);
    },
    observe(
      location: BrowserLocation,
      now: number = Date.now(),
    ): NavigationContextualSuggestion | null {
      if (destroyed) return null;
      const selected = session.observe(location, now);
      if (!selected) return null;

      const message = navigationSuggestionMessage(
        options.speech.language(),
        selected.placeName,
        selected.distanceMeters,
      );
      const suggestion: NavigationContextualSuggestion = Object.freeze({
        ...selected,
        message,
      });

      clearMessage();
      messages.append({
        sender: "assistant",
        area: "navigation",
        html: message,
        avoidDuplicate: false,
        messageType: "navigation_suggestion",
        customClass: "navigation-contextual-suggestion",
        speak: false,
        navigationActive: true,
      });
      messageVisible = true;
      const version = ++messageVersion;
      scheduleClear(version);
      options.speech.speak(message);
      options.document.defaultView?.dispatchEvent(
        new CustomEvent<NavigationContextualSuggestion>(
          "navigationContextualSuggestion",
          { detail: suggestion },
        ),
      );
      // Preserve the canonical V1 observable event name as a compatibility
      // surface while retaining the typed V2 event introduced by PR #60.
      options.document.defaultView?.dispatchEvent(
        new CustomEvent<NavigationContextualSuggestion>("navigationSuggestion", {
          detail: suggestion,
        }),
      );
      return suggestion;
    },
    stop(): void {
      session.stop();
      messageVersion += 1;
      clearMessage();
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      session.stop();
      messageVersion += 1;
      clearMessage();
    },
  });
}
