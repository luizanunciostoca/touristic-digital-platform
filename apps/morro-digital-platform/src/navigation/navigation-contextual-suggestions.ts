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

export interface NavigationSuggestionPolicy {
  readonly warmupMs: number;
  readonly movementThresholdMeters: number;
  readonly proximityMeters: number;
  readonly perPlaceCooldownMs: number;
  readonly sessionMaximum: number;
  readonly categoryPriority: Readonly<Record<string, number>>;
  readonly sponsoredNames: ReadonlySet<string>;
}

export interface NavigationSuggestionSelection {
  readonly placeName: string;
  readonly category: string;
  readonly distanceMeters: number;
  readonly sponsored: boolean;
}

export interface NavigationContextualSuggestion
  extends NavigationSuggestionSelection {
  readonly message: string;
}

export interface NavigationSuggestionSession {
  start(startedAt?: number): void;
  observe(location: BrowserLocation, now?: number): NavigationSuggestionSelection | null;
  stop(): void;
}

export interface NavigationContextualSuggestions {
  start(startedAt?: number): void;
  observe(location: BrowserLocation, now?: number): NavigationContextualSuggestion | null;
  stop(): void;
  destroy(): void;
}

const EARTH_RADIUS_METERS = 6_371_000;

/**
 * Functional defaults used while the exact constants from ZIP 55acb639... are
 * unavailable to the live repository connection. They are intentionally
 * centralized so V1 exact values can replace them without changing lifecycle
 * or ranking code.
 */
export const NAVIGATION_SUGGESTION_FUNCTIONAL_POLICY: NavigationSuggestionPolicy =
  Object.freeze({
    warmupMs: 30_000,
    movementThresholdMeters: 20,
    proximityMeters: 80,
    perPlaceCooldownMs: 10 * 60_000,
    sessionMaximum: 3,
    categoryPriority: Object.freeze({
      emergencies: 100,
      attractions: 80,
      beaches: 70,
      restaurants: 60,
      nightlife: 50,
      hotels: 40,
      shops: 30,
    }),
    sponsoredNames: new Set<string>(),
  });

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
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(a)));
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

function priorityFor(
  place: MorroV1SearchCatalogItem,
  policy: NavigationSuggestionPolicy,
): number {
  const sponsored = policy.sponsoredNames.has(place.name) ? 10_000 : 0;
  return sponsored + (policy.categoryPriority[place.category] ?? 0);
}

function selectCandidate(input: {
  readonly location: BrowserLocation;
  readonly catalog: readonly MorroV1SearchCatalogItem[];
  readonly policy: NavigationSuggestionPolicy;
  readonly cooldownByPlace: ReadonlyMap<string, number>;
  readonly now: number;
}): { place: MorroV1SearchCatalogItem; distanceMeters: number } | null {
  const candidates = input.catalog
    .map((place) => ({
      place,
      distanceMeters: navigationSuggestionDistanceMeters(input.location, place),
    }))
    .filter(({ place, distanceMeters }) => {
      if (distanceMeters > input.policy.proximityMeters) return false;
      const lastShownAt = input.cooldownByPlace.get(place.name);
      return (
        lastShownAt === undefined ||
        input.now - lastShownAt >= input.policy.perPlaceCooldownMs
      );
    })
    .sort((left, right) => {
      const byPriority =
        priorityFor(right.place, input.policy) -
        priorityFor(left.place, input.policy);
      if (byPriority !== 0) return byPriority;
      const byDistance = left.distanceMeters - right.distanceMeters;
      if (byDistance !== 0) return byDistance;
      return left.place.name.localeCompare(right.place.name, "pt-BR");
    });
  return candidates[0] ?? null;
}

export function createNavigationSuggestionSession(options: {
  readonly catalog?: readonly MorroV1SearchCatalogItem[];
  readonly policy?: NavigationSuggestionPolicy;
} = {}): NavigationSuggestionSession {
  const catalog = options.catalog ?? morroV1SearchCatalog;
  const policy = options.policy ?? NAVIGATION_SUGGESTION_FUNCTIONAL_POLICY;
  const cooldownByPlace = new Map<string, number>();
  let startedAt: number | null = null;
  let lastEvaluationLocation: BrowserLocation | null = null;
  let emitted = 0;

  return Object.freeze({
    start(value = Date.now()): void {
      startedAt = value;
      lastEvaluationLocation = null;
      emitted = 0;
      cooldownByPlace.clear();
    },
    observe(location, now = Date.now()): NavigationSuggestionSelection | null {
      if (
        startedAt === null ||
        emitted >= policy.sessionMaximum ||
        now - startedAt < policy.warmupMs
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
      emitted += 1;
      return Object.freeze({
        placeName: selected.place.name,
        category: selected.place.category,
        distanceMeters: selected.distanceMeters,
        sponsored: policy.sponsoredNames.has(selected.place.name),
      });
    },
    stop(): void {
      startedAt = null;
      lastEvaluationLocation = null;
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
  const session = createNavigationSuggestionSession({
    ...(options.catalog ? { catalog: options.catalog } : {}),
    ...(options.policy ? { policy: options.policy } : {}),
  });
  const messages = createAssistantMessageDom({ document: options.document });
  let messageVisible = false;
  let destroyed = false;

  function clearMessage(): void {
    if (!messageVisible) return;
    messages.clear(
      "navigation",
      (message) => message.messageType === "navigation_suggestion",
    );
    messageVisible = false;
  }

  return Object.freeze({
    start(value = Date.now()): void {
      if (destroyed) return;
      clearMessage();
      session.start(value);
    },
    observe(location, now = Date.now()): NavigationContextualSuggestion | null {
      if (destroyed) return null;
      const selected = session.observe(location, now);
      if (!selected) return null;

      const message = navigationSuggestionMessage(
        options.speech.language(),
        selected.placeName,
        selected.distanceMeters,
      );
      const suggestion = Object.freeze({ ...selected, message });

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
      options.speech.speak(message);
      options.document.defaultView?.dispatchEvent(
        new CustomEvent("navigationContextualSuggestion", {
          detail: suggestion,
        }),
      );
      return suggestion;
    },
    stop(): void {
      session.stop();
      clearMessage();
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      session.stop();
      clearMessage();
    },
  });
}
