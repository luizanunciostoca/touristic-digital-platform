import type { AnalyticsIngestionService } from "@touristic/analytics/ingestion";

export const analyticsHttpPath = "/api/analytics/v1/events";

export interface AnalyticsHttpRequest {
  readonly method: string;
  readonly pathname: string;
  readonly body?: unknown;
}

export interface AnalyticsHttpResponse {
  readonly status: number;
  readonly body: Readonly<Record<string, unknown>>;
}

function response(
  status: number,
  body: Readonly<Record<string, unknown>>,
): AnalyticsHttpResponse {
  return Object.freeze({
    status,
    body: Object.freeze({ ...body }),
  });
}

export class AnalyticsHttpTransport {
  constructor(private readonly ingestion: AnalyticsIngestionService) {}

  matches(pathname: string): boolean {
    return pathname === analyticsHttpPath;
  }

  async handle(request: AnalyticsHttpRequest): Promise<AnalyticsHttpResponse> {
    if (!this.matches(request.pathname)) {
      return response(404, { error: "NOT_FOUND" });
    }
    if (request.method.toUpperCase() !== "POST") {
      return response(405, { error: "METHOD_NOT_ALLOWED" });
    }

    try {
      const result = await this.ingestion.ingest(request.body);
      return response(result.status === "stored" ? 201 : 200, {
        data: {
          eventId: result.event.eventId,
          status: result.status,
        },
      });
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (code === "ANALYTICS_EVENT_INVALID") {
        return response(400, { error: code });
      }
      if (code === "ANALYTICS_EVENT_ID_CONFLICT") {
        return response(409, { error: code });
      }
      return response(503, { error: "ANALYTICS_UNAVAILABLE" });
    }
  }
}
