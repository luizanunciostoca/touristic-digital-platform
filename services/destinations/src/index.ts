import mysql, { type Pool } from "mysql2/promise";
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
  | Readonly<{
      status: "found" | "created" | "updated";
      data: DestinationDocument;
    }>
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
    if (!normalized)
      return { status: "invalid", error: "DESTINATION_INVALID_ID" };
    const document = await this.repository.get(normalized);
    return document
      ? { status: "found", data: document }
      : { status: "not_found" };
  }

  public async create(
    input: Readonly<Record<string, unknown>>,
  ): Promise<DestinationAdminResult> {
    const clean = sanitizeDestinationInput(input);
    if (!clean)
      return { status: "invalid", error: "DESTINATION_INVALID_REQUEST" };
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
    if (!normalized)
      return { status: "invalid", error: "DESTINATION_INVALID_ID" };
    const current = await this.repository.get(normalized);
    if (!current) return { status: "not_found" };
    const clean = sanitizeDestinationInput({ ...input, id: normalized });
    if (!clean)
      return { status: "invalid", error: "DESTINATION_INVALID_REQUEST" };
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
    if (!normalized)
      return { status: "invalid", error: "DESTINATION_INVALID_ID" };
    const current = await this.repository.get(normalized);
    if (!current) return { status: "not_found" };
    return this.replace(normalized, { ...current, status });
  }
}

export class MemoryDestinationRepository implements DestinationRepository {
  private readonly documents = new Map<string, DestinationDocument>();

  public get(id: string): Promise<DestinationDocument | null> {
    return Promise.resolve(this.documents.get(id) ?? null);
  }

  public list(): Promise<readonly DestinationDocument[]> {
    return Promise.resolve(
      Object.freeze(
        [...this.documents.values()].sort((a, b) => a.id.localeCompare(b.id)),
      ),
    );
  }

  public create(document: DestinationDocument): Promise<boolean> {
    if (this.documents.has(document.id)) return Promise.resolve(false);
    this.documents.set(document.id, document);
    return Promise.resolve(true);
  }

  public replace(
    expected: DestinationDocument,
    next: DestinationDocument,
  ): Promise<boolean> {
    const current = this.documents.get(expected.id);
    if (!current || current.version !== expected.version) return Promise.resolve(false);
    this.documents.set(next.id, next);
    return Promise.resolve(true);
  }
}

export * from "./mysql-destination-repository.js";
export * from "./schema.js";

import { MySqlDestinationRepository } from "./mysql-destination-repository.js";
import { destinationsSchemaSql } from "./schema.js";

export function createDestinationsMySqlPool(
  databaseUrl = process.env.DESTINATIONS_DATABASE_URL,
): Pool {
  if (!databaseUrl) throw new Error("DESTINATIONS_DATABASE_URL_REQUIRED");
  const connectionLimit = Number(
    process.env.DESTINATIONS_DATABASE_POOL_SIZE ?? 6,
  );
  if (
    !Number.isInteger(connectionLimit) ||
    connectionLimit < 1 ||
    connectionLimit > 64
  ) {
    throw new Error("DESTINATIONS_DATABASE_POOL_SIZE_INVALID");
  }
  return mysql.createPool({
    uri: databaseUrl,
    connectionLimit,
    waitForConnections: true,
    timezone: "Z",
  });
}

export async function applyDestinationsSchema(pool: Pool): Promise<void> {
  await pool.query(destinationsSchemaSql);
}

export function createDestinationAdminService(
  pool: Pool,
): DestinationAdminService {
  return new DestinationAdminService(new MySqlDestinationRepository(pool));
}

export const morroDeSaoPauloDestinationBootstrap = Object.freeze({
  id: "morro-de-sao-paulo",
  status: "active",
  locale: "pt-BR",
  timezone: "America/Bahia",
  currency: "BRL",
  branding: Object.freeze({
    name: "Morro de São Paulo",
    shortName: "Morro",
    tagline: "Descubra Morro de São Paulo",
  }),
  center: Object.freeze({
    lat: -13.3833,
    lng: -38.9167,
    zoom: 13,
  }),
  modules: Object.freeze([
    "marketplace",
    "map",
    "navigation",
    "assistant",
    "businessPortal",
    "adminCrm",
  ]),
  featureFlags: Object.freeze({
    marketplace: true,
    map: true,
    navigation: true,
    assistant: true,
    businessPortal: true,
    adminCrm: true,
    booking: false,
    payments: false,
    affiliates: false,
  }),
});

export async function bootstrapMorroDeSaoPauloDestination(
  service: DestinationAdminService,
): Promise<DestinationAdminResult> {
  const current = await service.read(morroDeSaoPauloDestinationBootstrap.id);
  if (current.status === "found") return current;
  if (current.status !== "not_found") return current;
  return service.create(morroDeSaoPauloDestinationBootstrap);
}
