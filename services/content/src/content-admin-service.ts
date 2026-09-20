import {
  contentKinds,
  contentStatuses,
  createContentDraft,
  reviseContent,
  transitionContent,
  type ContentDocument,
  type ContentKind,
  type ContentStatus,
} from "@touristic/content";

import {
  MySqlContentRepository,
  type ContentAdminListInput,
} from "./mysql-content-repository.js";

export interface ContentCreateInput {
  readonly id: unknown;
  readonly destinationId: unknown;
  readonly kind: unknown;
  readonly locale: unknown;
  readonly sourceReference?: unknown;
  readonly fields?: unknown;
}

export interface ContentTransitionCommand {
  readonly status: unknown;
  readonly scheduledFor?: unknown;
}

function contentKind(value: unknown): ContentKind | null {
  return typeof value === "string" &&
    contentKinds.includes(value as ContentKind)
    ? (value as ContentKind)
    : null;
}

function contentStatus(value: unknown): ContentStatus | null {
  return typeof value === "string" &&
    contentStatuses.includes(value as ContentStatus)
    ? (value as ContentStatus)
    : null;
}

function fields(
  value: unknown,
): Readonly<Record<string, unknown>> | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Readonly<Record<string, unknown>>;
}

export class ContentAdminApplicationService {
  public constructor(
    private readonly repository: MySqlContentRepository,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  public list(
    input: ContentAdminListInput = {},
  ): Promise<readonly ContentDocument[]> {
    return this.repository.list(input);
  }

  public read(id: string): Promise<ContentDocument | null> {
    return this.repository.get(id);
  }

  public async create(input: ContentCreateInput): Promise<ContentDocument> {
    const kind = contentKind(input.kind);
    const inputFields = fields(input.fields);
    if (
      typeof input.id !== "string" ||
      typeof input.destinationId !== "string" ||
      !kind ||
      typeof input.locale !== "string" ||
      (input.sourceReference !== undefined &&
        typeof input.sourceReference !== "string") ||
      (input.fields !== undefined && inputFields === undefined)
    ) {
      throw new Error("CONTENT_INVALID_INPUT");
    }

    const draft = createContentDraft({
      id: input.id,
      destinationId: input.destinationId,
      kind,
      locale: input.locale,
      ...(typeof input.sourceReference === "string"
        ? { sourceReference: input.sourceReference }
        : {}),
      ...(inputFields ? { fields: inputFields } : {}),
      createdAt: this.now(),
    });
    if (!draft) throw new Error("CONTENT_INVALID_INPUT");
    if (!(await this.repository.create(draft))) {
      throw new Error("CONTENT_ALREADY_EXISTS");
    }
    return draft;
  }

  public async revise(
    id: string,
    inputFields: unknown,
  ): Promise<ContentDocument> {
    const current = await this.repository.get(id);
    if (!current) throw new Error("CONTENT_NOT_FOUND");
    const normalizedFields = fields(inputFields);
    if (!normalizedFields) throw new Error("CONTENT_INVALID_FIELDS");
    const next = reviseContent(current, normalizedFields, this.now());
    if (!next) throw new Error("CONTENT_TRANSITION_INVALID");
    if (!(await this.repository.replace(current, next))) {
      throw new Error("CONTENT_CONCURRENT_UPDATE");
    }
    return next;
  }

  public async transition(
    id: string,
    command: ContentTransitionCommand,
  ): Promise<ContentDocument> {
    const current = await this.repository.get(id);
    if (!current) throw new Error("CONTENT_NOT_FOUND");
    const status = contentStatus(command.status);
    if (!status) throw new Error("CONTENT_INVALID_STATUS");
    if (
      command.scheduledFor !== undefined &&
      typeof command.scheduledFor !== "string"
    ) {
      throw new Error("CONTENT_INVALID_SCHEDULE");
    }
    const next = transitionContent(current, {
      status,
      transitionedAt: this.now(),
      ...(typeof command.scheduledFor === "string"
        ? { scheduledFor: command.scheduledFor }
        : {}),
    });
    if (!next) throw new Error("CONTENT_TRANSITION_INVALID");
    if (!(await this.repository.replace(current, next))) {
      throw new Error("CONTENT_CONCURRENT_UPDATE");
    }
    return next;
  }
}
