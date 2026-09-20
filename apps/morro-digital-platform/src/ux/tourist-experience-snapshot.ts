export type TouristExperienceMode =
  "discover" | "place" | "assistant" | "commerce";

export type TouristExperienceSheetState = "peek" | "half" | "full";

export interface TouristExperienceSnapshot {
  readonly version: 1;
  readonly mode: TouristExperienceMode;
  readonly placeId?: string;
  readonly category?: string;
  readonly locale: string;
  readonly mapCenter?: readonly [number, number];
  readonly mapZoom?: number;
  readonly mapBearing?: number;
  readonly mapPitch?: number;
  readonly assistantContextId?: string;
  readonly sheetState?: TouristExperienceSheetState;
  readonly scrollKey?: string;
  readonly scrollY?: number;
  readonly createdAt: number;
}

export interface TouristExperienceExploreState {
  readonly category: string | null;
  readonly place: string | null;
  readonly stage: string;
}

export interface TouristExperienceMapCamera {
  getCenter?(): Readonly<{ lng: number; lat: number }>;
  getZoom?(): number;
  getBearing?(): number;
  getPitch?(): number;
  setCenter?(center: [number, number]): void;
  setZoom?(zoom: number): void;
  jumpTo?(options: {
    readonly center?: [number, number];
    readonly zoom?: number;
    readonly bearing?: number;
    readonly pitch?: number;
  }): void;
}

export const TOURIST_EXPERIENCE_SNAPSHOT_STORAGE_KEY =
  "morro_tourist_experience_v1";
export const TOURIST_EXPERIENCE_SNAPSHOT_TTL_MS = 6 * 60 * 60 * 1000;

const modes = new Set<TouristExperienceMode>([
  "discover",
  "place",
  "assistant",
  "commerce",
]);
const sheetStates = new Set<TouristExperienceSheetState>([
  "peek",
  "half",
  "full",
]);
const safeLocalePattern = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/u;

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function boundedString(value: unknown, maxLength = 160): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : undefined;
}

function validCenter(value: unknown): readonly [number, number] | undefined {
  if (!Array.isArray(value) || value.length !== 2) return undefined;
  const longitude = finiteNumber(value[0]);
  const latitude = finiteNumber(value[1]);
  if (
    longitude === undefined ||
    latitude === undefined ||
    longitude < -180 ||
    longitude > 180 ||
    latitude < -90 ||
    latitude > 90
  ) {
    return undefined;
  }
  return Object.freeze([longitude, latitude] as const);
}

function validZoom(value: unknown): number | undefined {
  const zoom = finiteNumber(value);
  return zoom !== undefined && zoom >= 0 && zoom <= 24 ? zoom : undefined;
}

function validBearing(value: unknown): number | undefined {
  const bearing = finiteNumber(value);
  return bearing !== undefined && bearing >= -360 && bearing <= 360
    ? bearing
    : undefined;
}

function validPitch(value: unknown): number | undefined {
  const pitch = finiteNumber(value);
  return pitch !== undefined && pitch >= 0 && pitch <= 85 ? pitch : undefined;
}

function safeMode(
  document: Document,
  explore: TouristExperienceExploreState,
): TouristExperienceMode {
  if (explore.stage === "detail" && explore.place) return "place";
  const candidate = document.body.dataset.mdMode;
  return modes.has(candidate as TouristExperienceMode)
    ? (candidate as TouristExperienceMode)
    : "discover";
}

function storageFromWindow(
  window: Window,
  storage?: Storage,
): Storage | undefined {
  if (storage) return storage;
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

export function parseTouristExperienceSnapshot(
  raw: unknown,
  now = Date.now(),
): TouristExperienceSnapshot | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const candidate = raw as Record<string, unknown>;
  if (candidate.version !== 1) return null;

  const mode = candidate.mode;
  const locale = boundedString(candidate.locale, 35);
  const createdAt = finiteNumber(candidate.createdAt);
  if (
    !modes.has(mode as TouristExperienceMode) ||
    !locale ||
    !safeLocalePattern.test(locale) ||
    createdAt === undefined ||
    createdAt > now + 60_000 ||
    now - createdAt > TOURIST_EXPERIENCE_SNAPSHOT_TTL_MS
  ) {
    return null;
  }

  const placeId = boundedString(candidate.placeId);
  const category = boundedString(candidate.category, 80);
  const mapCenter = validCenter(candidate.mapCenter);
  const mapZoom = validZoom(candidate.mapZoom);
  const mapBearing = validBearing(candidate.mapBearing);
  const mapPitch = validPitch(candidate.mapPitch);
  const assistantContextId = boundedString(candidate.assistantContextId, 160);
  const scrollKey = boundedString(candidate.scrollKey, 160);
  const scrollYValue = finiteNumber(candidate.scrollY);
  const scrollY =
    scrollYValue !== undefined && scrollYValue >= 0 && scrollYValue <= 1_000_000
      ? scrollYValue
      : undefined;
  const sheetState = sheetStates.has(
    candidate.sheetState as TouristExperienceSheetState,
  )
    ? (candidate.sheetState as TouristExperienceSheetState)
    : undefined;

  return Object.freeze({
    version: 1 as const,
    mode: mode as TouristExperienceMode,
    ...(placeId ? { placeId } : {}),
    ...(category ? { category } : {}),
    locale,
    ...(mapCenter ? { mapCenter } : {}),
    ...(mapZoom !== undefined ? { mapZoom } : {}),
    ...(mapBearing !== undefined ? { mapBearing } : {}),
    ...(mapPitch !== undefined ? { mapPitch } : {}),
    ...(assistantContextId ? { assistantContextId } : {}),
    ...(sheetState ? { sheetState } : {}),
    ...(scrollKey ? { scrollKey } : {}),
    ...(scrollY !== undefined ? { scrollY } : {}),
    createdAt,
  });
}

export function readTouristExperienceSnapshot(
  storage: Storage | undefined,
  now = Date.now(),
): TouristExperienceSnapshot | null {
  if (!storage) return null;
  try {
    const serialized = storage.getItem(TOURIST_EXPERIENCE_SNAPSHOT_STORAGE_KEY);
    if (!serialized) return null;
    const snapshot = parseTouristExperienceSnapshot(
      JSON.parse(serialized) as unknown,
      now,
    );
    if (!snapshot) {
      storage.removeItem(TOURIST_EXPERIENCE_SNAPSHOT_STORAGE_KEY);
    }
    return snapshot;
  } catch {
    try {
      storage.removeItem(TOURIST_EXPERIENCE_SNAPSHOT_STORAGE_KEY);
    } catch {
      // Storage can be unavailable or blocked; restoration remains fail-closed.
    }
    return null;
  }
}

export function writeTouristExperienceSnapshot(
  storage: Storage | undefined,
  snapshot: TouristExperienceSnapshot,
): boolean {
  if (!storage) return false;
  const validated = parseTouristExperienceSnapshot(
    snapshot,
    snapshot.createdAt,
  );
  if (!validated) return false;
  try {
    storage.setItem(
      TOURIST_EXPERIENCE_SNAPSHOT_STORAGE_KEY,
      JSON.stringify(validated),
    );
    return true;
  } catch {
    return false;
  }
}

function currentSheetState(
  document: Document,
): TouristExperienceSheetState | undefined {
  const sheet = document.querySelector<HTMLElement>(
    ".md-bottom-sheet[data-sheet-state]",
  );
  const state = sheet?.dataset.sheetState;
  return sheetStates.has(state as TouristExperienceSheetState)
    ? (state as TouristExperienceSheetState)
    : undefined;
}

function currentAssistantContextId(document: Document): string | undefined {
  return boundedString(
    document.querySelector<HTMLElement>("[data-assistant-context-id]")?.dataset
      .assistantContextId,
  );
}

function currentScrollKey(document: Document): string | undefined {
  return boundedString(
    document.querySelector<HTMLElement>(
      "[data-md-scroll-key][data-md-scroll-active]",
    )?.dataset.mdScrollKey,
  );
}

export function captureTouristExperienceSnapshot(input: {
  readonly document: Document;
  readonly window: Window;
  readonly explore: TouristExperienceExploreState;
  readonly map?: TouristExperienceMapCamera;
  readonly storage?: Storage;
  readonly now?: () => number;
}): TouristExperienceSnapshot {
  const center = input.map?.getCenter?.();
  const zoom = input.map?.getZoom?.();
  const bearing = input.map?.getBearing?.();
  const pitch = input.map?.getPitch?.();
  const mapCenter =
    center &&
    Number.isFinite(center.lng) &&
    Number.isFinite(center.lat) &&
    center.lng >= -180 &&
    center.lng <= 180 &&
    center.lat >= -90 &&
    center.lat <= 90
      ? ([center.lng, center.lat] as const)
      : undefined;
  const mapZoom = validZoom(zoom);
  const mapBearing = validBearing(bearing);
  const mapPitch = validPitch(pitch);
  const locale =
    boundedString(input.document.documentElement.lang, 35) ?? "pt-BR";
  const sheetState = currentSheetState(input.document);
  const assistantContextId = currentAssistantContextId(input.document);
  const scrollKey = currentScrollKey(input.document);
  const snapshot = Object.freeze({
    version: 1 as const,
    mode: safeMode(input.document, input.explore),
    ...(input.explore.place ? { placeId: input.explore.place } : {}),
    ...(input.explore.category ? { category: input.explore.category } : {}),
    locale,
    ...(mapCenter ? { mapCenter } : {}),
    ...(mapZoom !== undefined ? { mapZoom } : {}),
    ...(mapBearing !== undefined ? { mapBearing } : {}),
    ...(mapPitch !== undefined ? { mapPitch } : {}),
    ...(assistantContextId ? { assistantContextId } : {}),
    ...(sheetState ? { sheetState } : {}),
    ...(scrollKey ? { scrollKey } : {}),
    ...(Number.isFinite(input.window.scrollY) && input.window.scrollY >= 0
      ? { scrollY: input.window.scrollY }
      : {}),
    createdAt: input.now?.() ?? Date.now(),
  }) satisfies TouristExperienceSnapshot;

  writeTouristExperienceSnapshot(
    storageFromWindow(input.window, input.storage),
    snapshot,
  );
  return snapshot;
}

function restoreCamera(
  map: TouristExperienceMapCamera | undefined,
  snapshot: TouristExperienceSnapshot,
): void {
  if (!map || !snapshot.mapCenter) return;
  const center: [number, number] = [
    snapshot.mapCenter[0],
    snapshot.mapCenter[1],
  ];
  if (map.jumpTo) {
    map.jumpTo({
      center,
      ...(snapshot.mapZoom !== undefined ? { zoom: snapshot.mapZoom } : {}),
      ...(snapshot.mapBearing !== undefined
        ? { bearing: snapshot.mapBearing }
        : {}),
      ...(snapshot.mapPitch !== undefined ? { pitch: snapshot.mapPitch } : {}),
    });
    return;
  }
  map.setCenter?.(center);
  if (snapshot.mapZoom !== undefined) map.setZoom?.(snapshot.mapZoom);
}

export async function restoreTouristExperienceSnapshot(input: {
  readonly document: Document;
  readonly window: Window;
  readonly map?: TouristExperienceMapCamera;
  readonly storage?: Storage;
  readonly restorePlace: (place: string, category?: string) => Promise<boolean>;
  readonly restoreCategory: (category: string) => Promise<boolean>;
  readonly now?: () => number;
}): Promise<boolean> {
  const snapshot = readTouristExperienceSnapshot(
    storageFromWindow(input.window, input.storage),
    input.now?.() ?? Date.now(),
  );
  if (!snapshot) return false;

  let restoredExplore = false;
  if (snapshot.placeId) {
    restoredExplore = await input.restorePlace(
      snapshot.placeId,
      snapshot.category,
    );
  }
  if (!restoredExplore && snapshot.category) {
    restoredExplore = await input.restoreCategory(snapshot.category);
  }

  restoreCamera(input.map, snapshot);

  if (snapshot.sheetState) {
    const sheet = input.document.querySelector<HTMLElement>(".md-bottom-sheet");
    if (sheet) sheet.dataset.sheetState = snapshot.sheetState;
  }

  if (snapshot.scrollY !== undefined) {
    input.window.scrollTo({ top: snapshot.scrollY, behavior: "auto" });
  }

  input.document.body.dataset.mdContextRestored = "true";
  input.document.body.dataset.mdContextRestoredMode = snapshot.mode;
  const restored = restoredExplore || Boolean(snapshot.mapCenter);
  if (restored) {
    try {
      storageFromWindow(input.window, input.storage)?.removeItem(
        TOURIST_EXPERIENCE_SNAPSHOT_STORAGE_KEY,
      );
    } catch {
      // One-shot context consumption is best-effort when browser storage is blocked.
    }
  }
  return restored;
}

export function installTouristExperienceSnapshotCapture(input: {
  readonly document: Document;
  readonly window: Window;
  readonly getExploreState: () => TouristExperienceExploreState;
  readonly getMap: () => TouristExperienceMapCamera | undefined;
  readonly storage?: Storage;
  readonly now?: () => number;
}): Readonly<{ capture(): TouristExperienceSnapshot; destroy(): void }> {
  const capture = (): TouristExperienceSnapshot => {
    const map = input.getMap();
    return captureTouristExperienceSnapshot({
      document: input.document,
      window: input.window,
      explore: input.getExploreState(),
      ...(map ? { map } : {}),
      ...(input.storage ? { storage: input.storage } : {}),
      ...(input.now ? { now: input.now } : {}),
    });
  };

  const onCommerceHandoff = (): void => {
    capture();
  };

  input.document.addEventListener(
    "morro:commerce-cta-activated",
    onCommerceHandoff,
    true,
  );

  return Object.freeze({
    capture,
    destroy() {
      input.document.removeEventListener(
        "morro:commerce-cta-activated",
        onCommerceHandoff,
        true,
      );
    },
  });
}
