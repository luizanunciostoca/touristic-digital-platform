import type { Result } from "../core/contracts.js";
import { err, ok } from "../core/contracts.js";
import type { Clock, IdGenerator } from "../core/runtime.js";

export const MEMORY_LAYERS = ["L0", "L1", "L2", "L3", "L4", "L5"] as const;
export type MemoryLayer = (typeof MEMORY_LAYERS)[number];
export type MemorySensitivity = "public" | "internal" | "personal" | "sensitive";
export type MemoryOwnership =
  | "turn"
  | "session"
  | "device"
  | "account"
  | "user-consented"
  | "journey";

export interface MemoryRecord<T = unknown> {
  readonly id: string;
  readonly layer: MemoryLayer;
  readonly scope: string;
  readonly owner: MemoryOwnership;
  readonly source: string;
  readonly createdAt: string;
  readonly expiresAt?: string;
  readonly sensitivity: MemorySensitivity;
  readonly retentionPolicy: string;
  readonly writable: boolean;
  readonly payload: T;
}

export interface MemoryQuery {
  readonly layers?: readonly MemoryLayer[];
  readonly scope?: string;
  readonly limit?: number;
}

export interface AssistantMemoryStore {
  put(record: MemoryRecord): Promise<Result<void>>;
  get(id: string): Promise<Result<MemoryRecord>>;
  query(query: MemoryQuery): Promise<Result<readonly MemoryRecord[]>>;
  purge(
    criteria: Readonly<{ scope?: string; layers?: readonly MemoryLayer[]; before?: string }>,
  ): Promise<Result<number>>;
}

export class InMemoryAssistantMemoryStore implements AssistantMemoryStore {
  private readonly records = new Map<string, MemoryRecord>();

  constructor(private readonly clock: Clock) {}

  put(record: MemoryRecord): Promise<Result<void>> {
    if (!record.writable)
      return Promise.resolve(err("POLICY_DENIED", "Memory record is read-only"));
    this.records.set(record.id, structuredClone(record));
    return Promise.resolve(ok(undefined));
  }

  get(id: string): Promise<Result<MemoryRecord>> {
    this.purgeExpired();
    const value = this.records.get(id);
    return Promise.resolve(
      value ? ok(structuredClone(value)) : err("NOT_FOUND", "Memory record not found"),
    );
  }

  query(query: MemoryQuery): Promise<Result<readonly MemoryRecord[]>> {
    this.purgeExpired();
    const layers = query.layers ? new Set(query.layers) : null;
    const values = [...this.records.values()]
      .filter(
        (record) =>
          (!layers || layers.has(record.layer)) && (!query.scope || record.scope === query.scope),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, Math.min(query.limit ?? 50, 100))
      .map((record) => structuredClone(record));
    return Promise.resolve(ok(values));
  }

  purge(
    criteria: Readonly<{ scope?: string; layers?: readonly MemoryLayer[]; before?: string }>,
  ): Promise<Result<number>> {
    const layers = criteria.layers ? new Set(criteria.layers) : null;
    let removed = 0;
    for (const [id, record] of this.records.entries()) {
      const matchesScope = !criteria.scope || record.scope === criteria.scope;
      const matchesLayer = !layers || layers.has(record.layer);
      const matchesTime = !criteria.before || record.createdAt < criteria.before;
      if (matchesScope && matchesLayer && matchesTime) {
        this.records.delete(id);
        removed += 1;
      }
    }
    return Promise.resolve(ok(removed));
  }

  private purgeExpired(): void {
    const now = this.clock.now().getTime();
    for (const [id, record] of this.records.entries()) {
      if (record.expiresAt && new Date(record.expiresAt).getTime() <= now) this.records.delete(id);
    }
  }
}

export class AssistantMemoryService {
  constructor(
    private readonly store: AssistantMemoryStore,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async remember<T>(
    input: Readonly<{
      layer: MemoryLayer;
      scope: string;
      owner: MemoryOwnership;
      source: string;
      sensitivity: MemorySensitivity;
      retentionPolicy: string;
      ttlMs?: number;
      writable?: boolean;
      payload: T;
    }>,
  ): Promise<Result<MemoryRecord<T>>> {
    if (
      (input.layer === "L3" || input.layer === "L4" || input.layer === "L5") &&
      input.sensitivity === "sensitive"
    ) {
      return err("POLICY_DENIED", "Sensitive durable memory requires a dedicated approved adapter");
    }
    const createdAt = this.clock.now();
    const record: MemoryRecord<T> = {
      id: this.ids.next("mem"),
      layer: input.layer,
      scope: input.scope,
      owner: input.owner,
      source: input.source,
      createdAt: createdAt.toISOString(),
      ...(input.ttlMs !== undefined
        ? { expiresAt: new Date(createdAt.getTime() + input.ttlMs).toISOString() }
        : {}),
      sensitivity: input.sensitivity,
      retentionPolicy: input.retentionPolicy,
      writable: input.writable ?? true,
      payload: structuredClone(input.payload),
    };
    const saved = await this.store.put(record);
    if (!saved.ok) return saved;
    return ok(record);
  }
}
