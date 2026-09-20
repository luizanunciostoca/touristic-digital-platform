import type {
  DestinationDocument,
  DestinationRepository,
  DestinationStatus,
} from "@touristic/destinations";
import {
  sanitizeDestinationId,
  sanitizeDestinationInput,
} from "@touristic/destinations";

export interface DestinationOwnerClock {
  now(): string;
}

export type DestinationAdminResult =
  | Readonly<{ status: "found" | "created" | "updated"; data: DestinationDocument }>
  | Readonly<{ status: "not_found" }>
  | Readonly<{ status: "conflict"; error: string }>
  | Readonly<{ status: "invalid"; error: string }>;

export class DestinationAdminService {
  public constructor(
    private readonly repository: DestinationRepository,
    private readonly clock: DestinationOwnerClock = {
      now: () => new Date().toISOString(),
    },
  ) {}

  public async list(): Promise<readonly DestinationDocument[]> {
    return this.repository.list();
  }

  public async read(id: unknown): Promise<DestinationAdminResult> {
    const normalized = sanitizeDestinationId(id);
    if (!normalized) return { status: "invalid", error: "DESTINATION_INVALID_ID" };
    const document = await this.repository.get(normalized);
    return document ? { status: "found", data: document } : { status: "not_found" };
  }

  public async create(
    input: Readonly<Record<string, unknown>>,
  ): Promise<DestinationAdminResult> {
    const clean = sanitizeDestinationInput(input);
    if (!clean) return { status: "invalid", error: "DESTINATION_INVALID_REQUEST" };
    const now = this.clock.now();
    const document: DestinationDocument = Object.freeze({
      ...clean,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    return (await this.repository.create(document))
      ? { status: "created", data: document }
      : { status: "conflict", error: "DESTINATION_ALREADY_EXISTS" };
  }

  public async replace(
    id: unknown,
    input: Readonly<Record<string, unknown>>,
  ): Promise<DestinationAdminResult> {
    const normalized = sanitizeDestinationId(id);
    if (!normalized) return { status: "invalid", error: "DESTINATION_INVALID_ID" };
    const current = await this.repository.get(normalized);
    if (!current) return { status: "not_found" };
    const clean = sanitizeDestinationInput({ ...input, id: normalized });
    if (!clean) return { status: "invalid", error: "DESTINATION_INVALID_REQUEST" };
    const next: DestinationDocument = Object.freeze({
      ...clean,
      id: normalized,
      version: current.version + 1,
      createdAt: current.createdAt,
      updatedAt: this.clock.now(),
    });
    return (await this.repository.replace(current, next))
      ? { status: "updated", data: next }
      : { status: "conflict", error: "DESTINATION_STALE_VERSION" };
  }

  public async setStatus(
    id: unknown,
    status: DestinationStatus,
  ): Promise<DestinationAdminResult> {
    const normalized = sanitizeDestinationId(id);
    if (!normalized) return { status: "invalid", error: "DESTINATION_INVALID_ID" };
    const current = await this.repository.get(normalized);
    if (!current) return { status: "not_found" };
    return this.replace(normalized, { ...current, status });
  }
}

export class MemoryDestinationRepository implements DestinationRepository {
  private readonly documents = new Map<string, DestinationDocument>();

  public async get(id: string): Promise<DestinationDocument | null> {
    return this.documents.get(id) ?? null;
  }

  public async list(): Promise<readonly DestinationDocument[]> {
    return Object.freeze(
      [...this.documents.values()].sort((a, b) => a.id.localeCompare(b.id)),
    );
  }

  public async create(document: DestinationDocument): Promise<boolean> {
    if (this.documents.has(document.id)) return false;
    this.documents.set(document.id, document);
    return true;
  }

  public async replace(
    expected: DestinationDocument,
    next: DestinationDocument,
  ): Promise<boolean> {
    const current = this.documents.get(expected.id);
    if (!current || current.version !== expected.version) return false;
    this.documents.set(next.id, next);
    return true;
  }
}
