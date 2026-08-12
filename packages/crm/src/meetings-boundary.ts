import type { AuthSessionIdentity } from "@touristic/auth";

import {
  crmMeetingModalities,
  crmMeetingStatuses,
  normalizeCrmId,
  type CrmId,
  type CrmMeeting,
  type CrmMeetingModality,
  type CrmMeetingStatus,
} from "./index.js";
import {
  authorizeCrmAccess,
  type CrmAuthorizationReason,
} from "./authorization.js";

export type CrmMeetingBoundaryOperation =
  "meeting.list" | "meeting.create" | "meeting.update";

export interface CrmMeetingAuditEvent {
  readonly operation: CrmMeetingBoundaryOperation;
  readonly allowed: boolean;
  readonly reason: CrmAuthorizationReason | "invalid_input" | "not_found";
  readonly actorSubject: string | null;
  readonly meetingId: CrmId | null;
  readonly leadId: CrmId | null;
}

export interface CrmMeetingAuditPort {
  readonly record: (event: CrmMeetingAuditEvent) => Promise<void>;
}

export interface CrmMeetingCreateInput {
  readonly leadId: unknown;
  readonly title: unknown;
  readonly scheduledAt: unknown;
  readonly modality: unknown;
  readonly meetingLink?: unknown;
  readonly location?: unknown;
  readonly notes?: unknown;
}

export interface CrmMeetingUpdateInput {
  readonly id: unknown;
  readonly title?: unknown;
  readonly scheduledAt?: unknown;
  readonly modality?: unknown;
  readonly meetingLink?: unknown;
  readonly location?: unknown;
  readonly status?: unknown;
  readonly notes?: unknown;
}

export interface CrmMeetingCreateRecord {
  readonly leadId: CrmId;
  readonly title: string;
  readonly scheduledAt: Date;
  readonly modality: CrmMeetingModality;
  readonly meetingLink: string | null;
  readonly location: string | null;
  readonly status: "scheduled";
  readonly notes: string | null;
  readonly createdBySubject: string;
}

export interface CrmMeetingUpdateRecord {
  readonly title?: string;
  readonly scheduledAt?: Date;
  readonly modality?: CrmMeetingModality;
  readonly meetingLink?: string | null;
  readonly location?: string | null;
  readonly status?: CrmMeetingStatus;
  readonly notes?: string | null;
}

export interface CrmMeetingBoundaryRepository {
  readonly list: (leadId?: CrmId) => Promise<readonly CrmMeeting[]>;
  readonly findById: (id: CrmId) => Promise<CrmMeeting | null>;
  readonly leadExists: (leadId: CrmId) => Promise<boolean>;
  readonly create: (record: CrmMeetingCreateRecord) => Promise<CrmMeeting>;
  readonly update: (
    id: CrmId,
    patch: CrmMeetingUpdateRecord,
  ) => Promise<CrmMeeting>;
  readonly appendInteraction: (input: {
    readonly leadId: CrmId;
    readonly content: string;
    readonly actorSubject: string;
    readonly metadata?: Readonly<Record<string, string>>;
  }) => Promise<void>;
}

export type CrmMeetingBoundaryResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly reason: CrmAuthorizationReason | "invalid_input" | "not_found";
    };

function safeText(
  value: unknown,
  maxLength: number,
): string | null | undefined {
  if (value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const normalized = Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127 ? " " : character;
  })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}

function safeRequiredText(value: unknown, maxLength: number): string | null {
  const text = safeText(value, maxLength);
  return typeof text === "string" && text.length > 0 ? text : null;
}

function safeDate(value: unknown): Date | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return new Date(value.getTime());
  }
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function isMeetingModality(value: unknown): value is CrmMeetingModality {
  return (
    typeof value === "string" &&
    (crmMeetingModalities as readonly string[]).includes(value)
  );
}

function isMeetingStatus(value: unknown): value is CrmMeetingStatus {
  return (
    typeof value === "string" &&
    (crmMeetingStatuses as readonly string[]).includes(value)
  );
}

export class CrmMeetingServerBoundary {
  constructor(
    private readonly repository: CrmMeetingBoundaryRepository,
    private readonly audit: CrmMeetingAuditPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async authorize(
    operation: CrmMeetingBoundaryOperation,
    session: AuthSessionIdentity | null,
    mutation: boolean,
    meetingId: CrmId | null = null,
    leadId: CrmId | null = null,
  ): Promise<CrmMeetingBoundaryResult<true>> {
    const auth = authorizeCrmAccess(session, {
      mutation,
      nowEpochSeconds: Math.floor(this.now().getTime() / 1000),
    });
    if (!auth.allowed) {
      await this.audit.record({
        operation,
        allowed: false,
        reason: auth.reason,
        actorSubject: session?.subject ?? null,
        meetingId,
        leadId,
      });
      return { ok: false, reason: auth.reason };
    }
    return { ok: true, value: true };
  }

  private async reject(
    operation: CrmMeetingBoundaryOperation,
    session: AuthSessionIdentity | null,
    reason: "invalid_input" | "not_found",
    meetingId: CrmId | null = null,
    leadId: CrmId | null = null,
  ): Promise<CrmMeetingBoundaryResult<never>> {
    await this.audit.record({
      operation,
      allowed: false,
      reason,
      actorSubject: session?.subject ?? null,
      meetingId,
      leadId,
    });
    return { ok: false, reason };
  }

  async list(
    session: AuthSessionIdentity | null,
    leadIdValue?: unknown,
  ): Promise<CrmMeetingBoundaryResult<readonly CrmMeeting[]>> {
    const leadId =
      leadIdValue === undefined ? undefined : normalizeCrmId(leadIdValue);
    const auth = await this.authorize(
      "meeting.list",
      session,
      false,
      null,
      leadId ?? null,
    );
    if (!auth.ok) return auth;
    if (leadIdValue !== undefined && !leadId) {
      return this.reject("meeting.list", session, "invalid_input");
    }
    return { ok: true, value: await this.repository.list(leadId) };
  }

  async create(
    session: AuthSessionIdentity | null,
    input: CrmMeetingCreateInput,
  ): Promise<CrmMeetingBoundaryResult<CrmMeeting>> {
    const leadId = normalizeCrmId(input.leadId);
    const auth = await this.authorize(
      "meeting.create",
      session,
      true,
      null,
      leadId,
    );
    if (!auth.ok) return auth;

    const title = safeRequiredText(input.title, 180);
    const scheduledAt = safeDate(input.scheduledAt);
    if (
      !session ||
      !leadId ||
      !title ||
      !scheduledAt ||
      !isMeetingModality(input.modality)
    ) {
      return this.reject(
        "meeting.create",
        session,
        "invalid_input",
        null,
        leadId,
      );
    }
    if (!(await this.repository.leadExists(leadId))) {
      return this.reject("meeting.create", session, "not_found", null, leadId);
    }

    const meetingLink =
      input.meetingLink === undefined ? null : safeText(input.meetingLink, 500);
    const location =
      input.location === undefined ? null : safeText(input.location, 300);
    const notes = input.notes === undefined ? null : safeText(input.notes, 4000);
    if (
      meetingLink === undefined ||
      location === undefined ||
      notes === undefined
    ) {
      return this.reject(
        "meeting.create",
        session,
        "invalid_input",
        null,
        leadId,
      );
    }

    const meeting = await this.repository.create({
      leadId,
      title,
      scheduledAt,
      modality: input.modality,
      meetingLink,
      location,
      status: "scheduled",
      notes,
      createdBySubject: session.subject,
    });
    await this.repository.appendInteraction({
      leadId,
      content: `Reunião "${title}" agendada`,
      actorSubject: session.subject,
      metadata: {
        meetingId: String(meeting.id),
        scheduledAt: scheduledAt.toISOString(),
        modality: input.modality,
      },
    });
    return { ok: true, value: meeting };
  }

  async update(
    session: AuthSessionIdentity | null,
    input: CrmMeetingUpdateInput,
  ): Promise<CrmMeetingBoundaryResult<CrmMeeting>> {
    const id = normalizeCrmId(input.id);
    const auth = await this.authorize("meeting.update", session, true, id);
    if (!auth.ok) return auth;
    if (!id) return this.reject("meeting.update", session, "invalid_input");

    const existing = await this.repository.findById(id);
    if (!existing) {
      return this.reject("meeting.update", session, "not_found", id);
    }

    const patch: {
      -readonly [K in keyof CrmMeetingUpdateRecord]?: CrmMeetingUpdateRecord[K];
    } = {};
    if (input.title !== undefined) {
      const title = safeRequiredText(input.title, 180);
      if (!title) {
        return this.reject(
          "meeting.update",
          session,
          "invalid_input",
          id,
          existing.leadId,
        );
      }
      patch.title = title;
    }
    if (input.scheduledAt !== undefined) {
      const scheduledAt = safeDate(input.scheduledAt);
      if (!scheduledAt) {
        return this.reject(
          "meeting.update",
          session,
          "invalid_input",
          id,
          existing.leadId,
        );
      }
      patch.scheduledAt = scheduledAt;
    }
    if (input.modality !== undefined) {
      if (!isMeetingModality(input.modality)) {
        return this.reject(
          "meeting.update",
          session,
          "invalid_input",
          id,
          existing.leadId,
        );
      }
      patch.modality = input.modality;
    }
    for (const [field, maxLength] of [
      ["meetingLink", 500],
      ["location", 300],
      ["notes", 4000],
    ] as const) {
      if (input[field] === undefined) continue;
      const value = safeText(input[field], maxLength);
      if (value === undefined) {
        return this.reject(
          "meeting.update",
          session,
          "invalid_input",
          id,
          existing.leadId,
        );
      }
      patch[field] = value;
    }
    if (input.status !== undefined) {
      if (!isMeetingStatus(input.status)) {
        return this.reject(
          "meeting.update",
          session,
          "invalid_input",
          id,
          existing.leadId,
        );
      }
      patch.status = input.status;
    }
    if (Object.keys(patch).length === 0) {
      return this.reject(
        "meeting.update",
        session,
        "invalid_input",
        id,
        existing.leadId,
      );
    }

    return { ok: true, value: await this.repository.update(id, patch) };
  }
}
