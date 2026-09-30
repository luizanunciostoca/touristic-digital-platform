import { z } from "zod";
import type { AssistantToolDefinition, ToolExecutionContext } from "./tool-registry.js";
import { ok } from "../core/contracts.js";

export interface MockDomainDataset {
  readonly places: readonly Readonly<Record<string, unknown>>[];
  readonly businesses: readonly Readonly<Record<string, unknown>>[];
  readonly events: readonly Readonly<Record<string, unknown>>[];
  readonly weather: Readonly<Record<string, unknown>>;
  readonly offers: readonly Readonly<Record<string, unknown>>[];
  readonly tickets: readonly Readonly<Record<string, unknown>>[];
}

const AnyOutputSchema: z.ZodType<unknown> = z.json();
const QuerySchema = z.object({ query: z.string().min(1).max(200) }).strict();
const IdSchema = z.object({ id: z.string().min(1).max(160) }).strict();
const NearbySchema = z
  .object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    radiusMeters: z.number().positive().max(50000).default(3000),
    category: z.string().max(80).optional(),
  })
  .strict();
const LocationSchema = z
  .object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) })
  .strict();
const MapSchema = z.object({ id: z.string().min(1).max(160) }).strict();
const CategorySchema = z.object({ category: z.string().min(1).max(80) }).strict();
const FilterSchema = z.object({ filters: z.record(z.string(), z.json()) }).strict();
const PrepareNavSchema = z.object({ destinationId: z.string().min(1).max(160) }).strict();
const StatusSchema = z.object({ reference: z.string().min(1).max(160) }).strict();
const CountSchema = z
  .object({ eventId: z.string().min(1).max(160), quantity: z.number().int().min(1).max(20) })
  .strict();
const PreferenceSchema = z
  .object({ key: z.string().min(1).max(80), value: z.string().max(240) })
  .strict();
const EmptySchema = z.object({}).strict();

function evidence(name: string, sourceType: string, now: string) {
  return [{ id: name + ":" + now, source: "mock-domain", sourceType }];
}

function readTool<I>(args: {
  name: string;
  domain: string;
  sourceType: string;
  inputSchema: z.ZodType<I>;
  run: (input: I) => unknown;
  permissions?: readonly string[];
}): AssistantToolDefinition<I, unknown> {
  return {
    name: args.name,
    version: "1",
    description: "Isolated mock tool for " + args.name,
    effect: "read",
    domain: args.domain,
    inputSchema: args.inputSchema,
    outputSchema: AnyOutputSchema,
    permissions: args.permissions ?? [],
    timeoutMs: 2000,
    retryAttempts: 0,
    idempotent: true,
    offlineAllowed: false,
    execute(_context: ToolExecutionContext, input: I) {
      const now = new Date().toISOString();
      return Promise.resolve(
        ok({
          data: args.run(input),
          evidence: evidence(args.name, args.sourceType, now),
          observedAt: now,
        }),
      );
    },
  };
}

function prepareTool<I>(args: {
  name: string;
  domain: string;
  inputSchema: z.ZodType<I>;
  run: (input: I) => unknown;
}): AssistantToolDefinition<I, unknown> {
  return {
    name: args.name,
    version: "1",
    description: "Isolated PREPARE tool for " + args.name,
    effect: "prepare",
    domain: args.domain,
    inputSchema: args.inputSchema,
    outputSchema: AnyOutputSchema,
    permissions: [],
    timeoutMs: 2000,
    retryAttempts: 0,
    idempotent: true,
    offlineAllowed: false,
    execute(_context: ToolExecutionContext, input: I) {
      const now = new Date().toISOString();
      return Promise.resolve(ok({ data: args.run(input), evidence: [], observedAt: now }));
    },
  };
}

export function createMockDomainTools(
  dataset: MockDomainDataset,
): readonly AssistantToolDefinition<unknown, unknown>[] {
  const findById = (items: readonly Readonly<Record<string, unknown>>[], id: string) =>
    items.find((item) => item.id === id) ?? null;
  const search = (items: readonly Readonly<Record<string, unknown>>[], query: string) =>
    items.filter((item) => JSON.stringify(item).toLowerCase().includes(query.toLowerCase()));

  const tools = [
    readTool({
      name: "place.search",
      domain: "places",
      sourceType: "place",
      inputSchema: QuerySchema,
      run: (i) => search(dataset.places, i.query),
    }),
    readTool({
      name: "place.get",
      domain: "places",
      sourceType: "place",
      inputSchema: IdSchema,
      run: (i) => findById(dataset.places, i.id),
    }),
    readTool({
      name: "place.nearby",
      domain: "places",
      sourceType: "place",
      inputSchema: NearbySchema,
      permissions: ["context:location"],
      run: (i) => dataset.places.filter((item) => !i.category || item.category === i.category),
    }),
    readTool({
      name: "place.photos",
      domain: "places",
      sourceType: "place",
      inputSchema: IdSchema,
      run: (i) => findById(dataset.places, i.id)?.photos ?? [],
    }),
    readTool({
      name: "place.hours",
      domain: "places",
      sourceType: "place",
      inputSchema: IdSchema,
      run: (i) => findById(dataset.places, i.id)?.hours ?? null,
    }),

    readTool({
      name: "business.get",
      domain: "business",
      sourceType: "business",
      inputSchema: IdSchema,
      run: (i) => findById(dataset.businesses, i.id),
    }),
    readTool({
      name: "business.menu",
      domain: "business",
      sourceType: "business",
      inputSchema: IdSchema,
      run: (i) => findById(dataset.businesses, i.id)?.menu ?? [],
    }),
    readTool({
      name: "business.contact",
      domain: "business",
      sourceType: "business",
      inputSchema: IdSchema,
      run: (i) => findById(dataset.businesses, i.id)?.contact ?? null,
    }),
    readTool({
      name: "business.products",
      domain: "business",
      sourceType: "business",
      inputSchema: IdSchema,
      run: (i) => findById(dataset.businesses, i.id)?.products ?? [],
    }),
    readTool({
      name: "business.availability",
      domain: "business",
      sourceType: "business",
      inputSchema: IdSchema,
      run: (i) => findById(dataset.businesses, i.id)?.availability ?? null,
    }),

    readTool({
      name: "weather.current",
      domain: "weather",
      sourceType: "weather",
      inputSchema: LocationSchema,
      permissions: ["context:location"],
      run: () => dataset.weather.current ?? dataset.weather,
    }),
    readTool({
      name: "weather.forecast",
      domain: "weather",
      sourceType: "weather",
      inputSchema: LocationSchema,
      permissions: ["context:location"],
      run: () => dataset.weather.forecast ?? [],
    }),

    prepareTool({
      name: "map.show_place",
      domain: "map",
      inputSchema: MapSchema,
      run: (i) => ({ action: "show_place", ...i }),
    }),
    prepareTool({
      name: "map.show_category",
      domain: "map",
      inputSchema: CategorySchema,
      run: (i) => ({ action: "show_category", ...i }),
    }),
    prepareTool({
      name: "map.apply_filter",
      domain: "map",
      inputSchema: FilterSchema,
      run: (i) => ({ action: "apply_filter", ...i }),
    }),

    prepareTool({
      name: "navigation.prepare",
      domain: "navigation",
      inputSchema: PrepareNavSchema,
      run: (i) => ({ prepared: true, ...i }),
    }),
    prepareTool({
      name: "navigation.start",
      domain: "navigation",
      inputSchema: PrepareNavSchema,
      run: (i) => ({ sandbox: true, started: i.destinationId }),
    }),
    prepareTool({
      name: "navigation.stop",
      domain: "navigation",
      inputSchema: EmptySchema,
      run: () => ({ sandbox: true, stopped: true }),
    }),
    readTool({
      name: "navigation.status",
      domain: "navigation",
      sourceType: "navigation",
      inputSchema: EmptySchema,
      run: () => ({ active: false, phase: "idle" }),
    }),

    readTool({
      name: "content.search",
      domain: "content",
      sourceType: "content",
      inputSchema: QuerySchema,
      run: (i) => search(dataset.events, i.query),
    }),
    readTool({
      name: "content.destination_info",
      domain: "content",
      sourceType: "content",
      inputSchema: EmptySchema,
      run: () => ({ destination: "mock" }),
    }),
    readTool({
      name: "content.events",
      domain: "content",
      sourceType: "content",
      inputSchema: EmptySchema,
      run: () => dataset.events,
    }),

    readTool({
      name: "commerce.offers",
      domain: "commerce",
      sourceType: "commerce",
      inputSchema: EmptySchema,
      run: () => dataset.offers,
    }),
    readTool({
      name: "commerce.offer_details",
      domain: "commerce",
      sourceType: "commerce",
      inputSchema: IdSchema,
      run: (i) => findById(dataset.offers, i.id),
    }),
    prepareTool({
      name: "commerce.prepare_checkout",
      domain: "commerce",
      inputSchema: IdSchema,
      run: (i) => ({ sandbox: true, offerId: i.id }),
    }),

    readTool({
      name: "ticketing.events",
      domain: "ticketing",
      sourceType: "ticketing",
      inputSchema: EmptySchema,
      run: () => dataset.tickets,
    }),
    readTool({
      name: "ticketing.availability",
      domain: "ticketing",
      sourceType: "ticketing",
      inputSchema: IdSchema,
      run: (i) => findById(dataset.tickets, i.id)?.availability ?? null,
    }),
    prepareTool({
      name: "ticketing.prepare_order",
      domain: "ticketing",
      inputSchema: CountSchema,
      run: (i) => ({ sandbox: true, ...i }),
    }),
    readTool({
      name: "ticketing.order_status",
      domain: "ticketing",
      sourceType: "ticketing",
      inputSchema: StatusSchema,
      run: (i) => ({ reference: i.reference, status: "sandbox_pending" }),
    }),

    readTool({
      name: "payments.status",
      domain: "payments",
      sourceType: "payments",
      inputSchema: StatusSchema,
      run: (i) => ({ reference: i.reference, status: "sandbox" }),
    }),

    readTool({
      name: "profile.get",
      domain: "profile",
      sourceType: "profile",
      inputSchema: EmptySchema,
      permissions: ["context:profile"],
      run: () => ({ userType: "unknown" }),
    }),
    readTool({
      name: "profile.preferences.get",
      domain: "profile",
      sourceType: "profile",
      inputSchema: EmptySchema,
      permissions: ["context:profile"],
      run: () => ({}),
    }),
    prepareTool({
      name: "profile.preferences.prepare_update",
      domain: "profile",
      inputSchema: PreferenceSchema,
      run: (i) => ({ prepared: true, ...i }),
    }),

    readTool({
      name: "favorites.list",
      domain: "favorites",
      sourceType: "profile",
      inputSchema: EmptySchema,
      run: () => [],
    }),
    prepareTool({
      name: "favorites.prepare_add",
      domain: "favorites",
      inputSchema: IdSchema,
      run: (i) => ({ prepared: true, placeId: i.id }),
    }),
    prepareTool({
      name: "favorites.prepare_remove",
      domain: "favorites",
      inputSchema: IdSchema,
      run: (i) => ({ prepared: true, placeId: i.id }),
    }),

    prepareTool({
      name: "notifications.prepare_subscribe",
      domain: "notifications",
      inputSchema: IdSchema,
      run: (i) => ({ prepared: true, targetId: i.id }),
    }),
    prepareTool({
      name: "notifications.prepare_unsubscribe",
      domain: "notifications",
      inputSchema: IdSchema,
      run: (i) => ({ prepared: true, targetId: i.id }),
    }),

    readTool({
      name: "affiliate.context",
      domain: "affiliates",
      sourceType: "profile",
      inputSchema: EmptySchema,
      run: () => ({ attribution: null }),
    }),
    readTool({
      name: "support.context",
      domain: "support",
      sourceType: "profile",
      inputSchema: EmptySchema,
      run: () => ({ openCases: [] }),
    }),
    prepareTool({
      name: "support.prepare_request",
      domain: "support",
      inputSchema: QuerySchema,
      run: (i) => ({ prepared: true, message: i.query }),
    }),
  ];

  return tools as readonly AssistantToolDefinition<unknown, unknown>[];
}
