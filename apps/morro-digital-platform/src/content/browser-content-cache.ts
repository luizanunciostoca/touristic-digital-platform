import {
  isOfflineContentSnapshotFresh,
  parseOfflineContentSnapshot,
  type OfflineContentSnapshot,
} from "@touristic/content/public-projection";

export interface ContentSnapshotStorage {
  read(destinationId: string): OfflineContentSnapshot | null;
  write(snapshot: OfflineContentSnapshot): void;
  clear(destinationId: string): void;
}

export type ContentSnapshotLoadResult =
  | Readonly<{
      status: "network" | "cache";
      snapshot: OfflineContentSnapshot;
      stale: false;
    }>
  | Readonly<{
      status: "stale";
      snapshot: OfflineContentSnapshot;
      stale: true;
    }>
  | Readonly<{ status: "unavailable"; stale: true }>;

export interface LoadContentSnapshotOptions {
  readonly destinationId: string;
  readonly now: string;
  readonly storage: ContentSnapshotStorage;
  readonly fetchSnapshot: () => Promise<unknown>;
}

const STORAGE_PREFIX = "morro-content-snapshot-v1:";

function storageKey(destinationId: string): string {
  return `${STORAGE_PREFIX}${destinationId.trim()}`;
}

function safeParse(value: string | null): unknown {
  if (value === null) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

export function createBrowserContentSnapshotStorage(
  storage: Storage,
): ContentSnapshotStorage {
  return Object.freeze({
    read(destinationId: string): OfflineContentSnapshot | null {
      const normalizedDestinationId = destinationId.trim();
      if (!normalizedDestinationId) return null;

      try {
        const parsed = parseOfflineContentSnapshot(
          safeParse(storage.getItem(storageKey(normalizedDestinationId))),
        );
        if (
          !parsed ||
          parsed.destinationId !== normalizedDestinationId
        ) {
          return null;
        }
        return parsed;
      } catch {
        return null;
      }
    },

    write(snapshot: OfflineContentSnapshot): void {
      const parsed = parseOfflineContentSnapshot(snapshot);
      if (!parsed) return;

      try {
        storage.setItem(
          storageKey(parsed.destinationId),
          JSON.stringify(parsed),
        );
      } catch {
        // Offline content persistence is best-effort and must never break UX.
      }
    },

    clear(destinationId: string): void {
      const normalizedDestinationId = destinationId.trim();
      if (!normalizedDestinationId) return;

      try {
        storage.removeItem(storageKey(normalizedDestinationId));
      } catch {
        // Storage cleanup is best-effort.
      }
    },
  });
}

export async function loadContentSnapshot(
  options: LoadContentSnapshotOptions,
): Promise<ContentSnapshotLoadResult> {
  const destinationId = options.destinationId.trim();
  if (!destinationId) {
    return Object.freeze({ status: "unavailable", stale: true });
  }

  const cached = options.storage.read(destinationId);

  try {
    const networkValue = await options.fetchSnapshot();
    const networkSnapshot = parseOfflineContentSnapshot(networkValue);

    if (
      networkSnapshot &&
      networkSnapshot.destinationId === destinationId &&
      isOfflineContentSnapshotFresh(networkSnapshot, options.now)
    ) {
      options.storage.write(networkSnapshot);
      return Object.freeze({
        status: "network",
        snapshot: networkSnapshot,
        stale: false,
      });
    }
  } catch {
    // Network/provider failure falls through to validated cache.
  }

  if (!cached) {
    return Object.freeze({ status: "unavailable", stale: true });
  }

  if (isOfflineContentSnapshotFresh(cached, options.now)) {
    return Object.freeze({
      status: "cache",
      snapshot: cached,
      stale: false,
    });
  }

  return Object.freeze({
    status: "stale",
    snapshot: cached,
    stale: true,
  });
}
