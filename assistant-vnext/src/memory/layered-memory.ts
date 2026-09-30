import type { Result } from "../core/contracts.js";
import { err, ok } from "../core/contracts.js";
import type { AssistantMemoryStore, MemoryLayer, MemoryQuery, MemoryRecord } from "./memory.js";
import { MEMORY_LAYERS } from "./memory.js";

export class LayeredAssistantMemoryStore implements AssistantMemoryStore {
  constructor(private readonly stores: Readonly<Record<MemoryLayer, AssistantMemoryStore>>) {}

  put(record: MemoryRecord): Promise<Result<void>> {
    return this.stores[record.layer].put(record);
  }

  async get(id: string): Promise<Result<MemoryRecord>> {
    for (const layer of MEMORY_LAYERS) {
      const result = await this.stores[layer].get(id);
      if (result.ok) return result;
      if (result.error.code !== "NOT_FOUND") return result;
    }
    return err("NOT_FOUND", "Memory record not found");
  }

  async query(query: MemoryQuery): Promise<Result<readonly MemoryRecord[]>> {
    const layers = query.layers ?? MEMORY_LAYERS;
    const records: MemoryRecord[] = [];
    for (const layer of layers) {
      const result = await this.stores[layer].query({
        ...query,
        layers: [layer],
        limit: Math.min(query.limit ?? 50, 100),
      });
      if (!result.ok) return result;
      records.push(...result.value);
    }
    records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return ok(records.slice(0, Math.min(query.limit ?? 50, 100)));
  }

  async purge(
    criteria: Readonly<{ scope?: string; layers?: readonly MemoryLayer[]; before?: string }>,
  ): Promise<Result<number>> {
    const layers = criteria.layers ?? MEMORY_LAYERS;
    let removed = 0;
    for (const layer of layers) {
      const result = await this.stores[layer].purge({ ...criteria, layers: [layer] });
      if (!result.ok) return result;
      removed += result.value;
    }
    return ok(removed);
  }
}
