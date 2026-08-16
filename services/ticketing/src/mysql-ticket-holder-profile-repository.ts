import type { Pool, RowDataPacket } from "mysql2/promise";

import type { TicketHolderProfilePort } from "./reservation-fulfillment-service.js";

const HOLDER_REFERENCE = /^[A-Za-z0-9@._:-]{2,120}$/u;
const HOLDER_NAME = /^[\p{L}][\p{L}\p{M}' .-]{1,159}$/u;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export interface TicketHolderProfile {
  readonly holderReference: string;
  readonly holderName: string;
  readonly email: string;
  readonly phone: string | null;
  readonly document: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface HolderRow extends RowDataPacket {
  holder_reference: string;
  holder_name: string;
  email: string;
  phone: string | null;
  document: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

function optionalText(value: unknown, max: number): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > max) return null;
  const invalid = [...normalized].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 31 || code === 127 || character === "<" || character === ">";
  });
  return invalid ? null : normalized;
}

function timestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export function normalizeTicketHolderProfile(input: {
  readonly holderReference: unknown;
  readonly holderName: unknown;
  readonly email: unknown;
  readonly phone?: unknown;
  readonly document?: unknown;
  readonly createdAt: unknown;
  readonly updatedAt?: unknown;
}): TicketHolderProfile | null {
  const holderReference =
    typeof input.holderReference === "string"
      ? input.holderReference.trim()
      : "";
  const holderName =
    typeof input.holderName === "string" ? input.holderName.trim() : "";
  const email =
    typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const phone = optionalText(input.phone, 40);
  const document = optionalText(input.document, 40);
  const createdAt = timestamp(input.createdAt);
  const updatedAt = timestamp(input.updatedAt ?? input.createdAt);
  if (
    !HOLDER_REFERENCE.test(holderReference) ||
    !HOLDER_NAME.test(holderName) ||
    !EMAIL.test(email) ||
    (input.phone !== undefined &&
      input.phone !== null &&
      input.phone !== "" &&
      !phone) ||
    (input.document !== undefined &&
      input.document !== null &&
      input.document !== "" &&
      !document) ||
    !createdAt ||
    !updatedAt ||
    Date.parse(updatedAt) < Date.parse(createdAt)
  ) {
    return null;
  }
  return Object.freeze({
    holderReference,
    holderName,
    email,
    phone,
    document,
    createdAt,
    updatedAt,
  });
}

function fromRow(row: HolderRow): TicketHolderProfile {
  const createdAt = new Date(row.created_at).toISOString();
  const updatedAt = new Date(row.updated_at).toISOString();
  const profile = normalizeTicketHolderProfile({
    holderReference: row.holder_reference,
    holderName: row.holder_name,
    email: row.email,
    phone: row.phone,
    document: row.document,
    createdAt,
    updatedAt,
  });
  if (!profile) throw new Error("TICKETING_INVALID_PERSISTED_HOLDER_PROFILE");
  return profile;
}

export class MySqlTicketHolderProfileRepository implements TicketHolderProfilePort {
  constructor(private readonly pool: Pool) {}

  async findByHolderReference(
    holderReferenceInput: unknown,
  ): Promise<TicketHolderProfile | null> {
    const holderReference =
      typeof holderReferenceInput === "string"
        ? holderReferenceInput.trim()
        : "";
    if (!HOLDER_REFERENCE.test(holderReference)) {
      throw new Error("TICKETING_HOLDER_REFERENCE_INVALID");
    }
    const [rows] = await this.pool.execute<HolderRow[]>(
      `SELECT holder_reference, holder_name, email, phone, document, created_at, updated_at
       FROM ticketing_holder_profiles
       WHERE holder_reference = ?
       LIMIT 1`,
      [holderReference],
    );
    return rows[0] ? fromRow(rows[0]) : null;
  }

  async resolveHolderName(holderReference: string): Promise<string | null> {
    return (
      (await this.findByHolderReference(holderReference))?.holderName ?? null
    );
  }

  async save(profileInput: TicketHolderProfile): Promise<TicketHolderProfile> {
    const profile = normalizeTicketHolderProfile(profileInput);
    if (!profile) throw new Error("TICKETING_HOLDER_PROFILE_INVALID");
    await this.pool.execute(
      `INSERT INTO ticketing_holder_profiles (
         holder_reference, holder_name, email, phone, document, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         holder_name = VALUES(holder_name),
         email = VALUES(email),
         phone = VALUES(phone),
         document = VALUES(document),
         updated_at = VALUES(updated_at)`,
      [
        profile.holderReference,
        profile.holderName,
        profile.email,
        profile.phone,
        profile.document,
        new Date(profile.createdAt),
        new Date(profile.updatedAt),
      ],
    );
    const persisted = await this.findByHolderReference(profile.holderReference);
    if (!persisted) throw new Error("TICKETING_HOLDER_PROFILE_NOT_PERSISTED");
    return persisted;
  }
}
