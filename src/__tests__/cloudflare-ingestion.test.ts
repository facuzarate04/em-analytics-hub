import { describe, it, expect, vi, beforeEach } from "vitest";
import {
	CloudflareIngestionBackend,
	serializeEvent,
} from "../backends/cloudflare/ingestion.js";
import type { AnalyticsEngineDataset } from "../backends/cloudflare/ingestion.js";
import type { NormalizedEvent } from "../capture/types.js";
import type { IngestionStorage } from "../ingestion/types.js";
import { createMockD1 } from "./helpers/mock-d1.js";
import { ensureD1Schema, resetD1SchemaFlag } from "../backends/cloudflare/d1.js";

function makeEvent(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
	return {
		pathname: "/blog/hello",
		type: "pageview",
		referrer: "https://google.com",
		visitorId: "v-123",
		country: "AR",
		template: "post",
		collection: "blog",
		utmSource: "twitter",
		utmMedium: "social",
		utmCampaign: "launch",
		utmTerm: "analytics",
		utmContent: "cta-button",
		seconds: 0,
		scrollDepth: 0,
		eventName: "",
		eventProps: "",
		createdAt: "2026-04-06T12:00:00Z",
		...overrides,
	};
}

function createMockStorage(): IngestionStorage {
	return {
		events: {
			get: vi.fn(),
			put: vi.fn().mockResolvedValue(undefined),
			query: vi.fn(),
			deleteMany: vi.fn(),
		},
		daily_stats: {
			get: vi.fn(),
			put: vi.fn().mockResolvedValue(undefined),
			query: vi.fn(),
			deleteMany: vi.fn(),
		},
		custom_events: {
			get: vi.fn(),
			put: vi.fn().mockResolvedValue(undefined),
			query: vi.fn(),
			deleteMany: vi.fn(),
		},
	} as any;
}

// ---------------------------------------------------------------------------
// serializeEvent (pure function)
// ---------------------------------------------------------------------------

describe("serializeEvent", () => {
	it("maps event type to indexes[0]", () => {
		const dp = serializeEvent(makeEvent({ type: "pageview" }));
		expect(dp.indexes).toEqual(["pageview"]);
	});

	it("maps all string fields to blobs in order", () => {
		const event = makeEvent();
		const dp = serializeEvent(event);
		expect(dp.blobs).toEqual([
			event.pathname,
			event.referrer,
			event.visitorId,
			event.country,
			event.template,
			event.collection,
			event.utmSource,
			event.utmMedium,
			event.utmCampaign,
			event.utmTerm,
			event.utmContent,
			event.eventName,
			event.eventProps,
			event.createdAt,
		]);
	});

	it("maps numeric fields to doubles", () => {
		const dp = serializeEvent(makeEvent({ seconds: 42, scrollDepth: 75 }));
		expect(dp.doubles).toEqual([42, 75]);
	});

	it("handles custom event with eventName and props", () => {
		const dp = serializeEvent(makeEvent({
			type: "custom",
			eventName: "signup",
			eventProps: '{"plan":"pro"}',
		}));
		expect(dp.indexes).toEqual(["custom"]);
		expect(dp.blobs![11]).toBe("signup");
		expect(dp.blobs![12]).toBe('{"plan":"pro"}');
	});

	it("handles empty strings gracefully", () => {
		const dp = serializeEvent(makeEvent({
			referrer: "",
			country: "",
			utmSource: "",
		}));
		expect(dp.blobs![1]).toBe("");
		expect(dp.blobs![3]).toBe("");
		expect(dp.blobs![6]).toBe("");
	});
});

// ---------------------------------------------------------------------------
// CloudflareIngestionBackend — AE + D1 + portable (events/custom_events only)
// ---------------------------------------------------------------------------

describe("CloudflareIngestionBackend", () => {
	let d1: ReturnType<typeof createMockD1>;

	beforeEach(async () => {
		resetD1SchemaFlag();
		d1 = createMockD1();
		await ensureD1Schema(d1);
	});

	it("writes to Analytics Engine", async () => {
		const writeDataPoint = vi.fn();
		const dataset: AnalyticsEngineDataset = { writeDataPoint };
		const backend = new CloudflareIngestionBackend(dataset, d1);
		const storage = createMockStorage();

		await backend.ingest(makeEvent(), storage);

		expect(writeDataPoint).toHaveBeenCalledOnce();
		const dp = writeDataPoint.mock.calls[0][0];
		expect(dp.indexes).toEqual(["pageview"]);
		expect(dp.blobs![0]).toBe("/blog/hello");
	});

	it("writes pageview to D1 daily_pages", async () => {
		const backend = new CloudflareIngestionBackend({ writeDataPoint: vi.fn() }, d1);
		const storage = createMockStorage();

		await backend.ingest(makeEvent({ type: "pageview" }), storage);

		const table = d1._tables.get("daily_pages");
		expect(table).toBeDefined();
		expect(table!.rows.length).toBe(1);
		expect(table!.rows[0].views).toBe(1);
		expect(table!.rows[0].pathname).toBe("/blog/hello");
		expect(table!.rows[0].template).toBe("post");
	});

	it("writes pageview visitor to D1 daily_visitors", async () => {
		const backend = new CloudflareIngestionBackend({ writeDataPoint: vi.fn() }, d1);
		const storage = createMockStorage();

		await backend.ingest(makeEvent({ type: "pageview", visitorId: "v-abc" }), storage);

		const visitors = d1._tables.get("daily_visitors");
		expect(visitors).toBeDefined();
		expect(visitors!.rows.length).toBe(1);
		expect(visitors!.rows[0].visitor_id).toBe("v-abc");
	});

	it("deduplicates visitors in D1", async () => {
		const backend = new CloudflareIngestionBackend({ writeDataPoint: vi.fn() }, d1);
		const storage = createMockStorage();

		await backend.ingest(makeEvent({ type: "pageview", visitorId: "v-same" }), storage);
		await backend.ingest(makeEvent({ type: "pageview", visitorId: "v-same" }), storage);

		const visitors = d1._tables.get("daily_visitors");
		expect(visitors!.rows.length).toBe(1);
	});

	it("writes referrer to D1 daily_referrers", async () => {
		const backend = new CloudflareIngestionBackend({ writeDataPoint: vi.fn() }, d1);
		const storage = createMockStorage();

		await backend.ingest(makeEvent({ type: "pageview", referrer: "https://example.com" }), storage);
		await backend.ingest(makeEvent({ type: "pageview", referrer: "https://example.com" }), storage);

		const referrers = d1._tables.get("daily_referrers");
		expect(referrers!.rows.length).toBe(1);
		expect(referrers!.rows[0].count).toBe(2);
	});

	it("writes country to D1 daily_countries", async () => {
		const backend = new CloudflareIngestionBackend({ writeDataPoint: vi.fn() }, d1);
		const storage = createMockStorage();

		await backend.ingest(makeEvent({ type: "pageview", country: "AR" }), storage);

		const countries = d1._tables.get("daily_countries");
		expect(countries!.rows.length).toBe(1);
		expect(countries!.rows[0].country).toBe("AR");
		expect(countries!.rows[0].count).toBe(1);
	});

	it("writes UTM campaigns to D1 daily_campaigns", async () => {
		const backend = new CloudflareIngestionBackend({ writeDataPoint: vi.fn() }, d1);
		const storage = createMockStorage();

		await backend.ingest(makeEvent({
			type: "pageview",
			utmSource: "twitter",
			utmMedium: "social",
			utmCampaign: "launch",
		}), storage);

		const campaigns = d1._tables.get("daily_campaigns");
		expect(campaigns!.rows.length).toBe(3);

		const source = campaigns!.rows.find((r) => r.dimension === "source");
		expect(source?.name).toBe("twitter");
		expect(source?.count).toBe(1);

		const medium = campaigns!.rows.find((r) => r.dimension === "medium");
		expect(medium?.name).toBe("social");

		const campaign = campaigns!.rows.find((r) => r.dimension === "campaign");
		expect(campaign?.name).toBe("launch");
	});

	it("writes scroll event to D1", async () => {
		const backend = new CloudflareIngestionBackend({ writeDataPoint: vi.fn() }, d1);
		const storage = createMockStorage();

		await backend.ingest(makeEvent({ type: "pageview" }), storage);
		await backend.ingest(makeEvent({ type: "scroll", scrollDepth: 50 }), storage);

		const pages = d1._tables.get("daily_pages");
		expect(pages!.rows[0].scroll50).toBe(1);
	});

	it("writes ping event to D1 (time tracking)", async () => {
		const backend = new CloudflareIngestionBackend({ writeDataPoint: vi.fn() }, d1);
		const storage = createMockStorage();

		await backend.ingest(makeEvent({ type: "pageview" }), storage);
		await backend.ingest(makeEvent({ type: "ping", seconds: 30 }), storage);

		const pages = d1._tables.get("daily_pages");
		expect(pages!.rows[0].time_total).toBe(30);
		expect(pages!.rows[0].time_count).toBe(1);
	});

	it("writes read event to D1", async () => {
		const backend = new CloudflareIngestionBackend({ writeDataPoint: vi.fn() }, d1);
		const storage = createMockStorage();

		await backend.ingest(makeEvent({ type: "pageview" }), storage);
		await backend.ingest(makeEvent({ type: "read" }), storage);

		const pages = d1._tables.get("daily_pages");
		expect(pages!.rows[0].reads).toBe(1);
	});

	it("writes engaged event to D1", async () => {
		const backend = new CloudflareIngestionBackend({ writeDataPoint: vi.fn() }, d1);
		const storage = createMockStorage();

		await backend.ingest(makeEvent({ type: "pageview" }), storage);
		await backend.ingest(makeEvent({ type: "engaged" }), storage);

		const pages = d1._tables.get("daily_pages");
		expect(pages!.rows[0].engaged_views).toBe(1);
	});

	it("writes recirc event to D1", async () => {
		const backend = new CloudflareIngestionBackend({ writeDataPoint: vi.fn() }, d1);
		const storage = createMockStorage();

		await backend.ingest(makeEvent({ type: "pageview" }), storage);
		await backend.ingest(makeEvent({ type: "recirc" }), storage);

		const pages = d1._tables.get("daily_pages");
		expect(pages!.rows[0].recircs).toBe(1);
	});

	// -----------------------------------------------------------------------
	// D1: custom events → daily_custom_events table
	// -----------------------------------------------------------------------

	it("writes custom event to D1 daily_custom_events", async () => {
		const backend = new CloudflareIngestionBackend({ writeDataPoint: vi.fn() }, d1);
		const storage = createMockStorage();

		await backend.ingest(makeEvent({
			type: "custom",
			eventName: "signup",
			eventProps: '{"plan":"pro"}',
		}), storage);

		const table = d1._tables.get("daily_custom_events");
		expect(table).toBeDefined();
		expect(table!.rows.length).toBe(1);
		expect(table!.rows[0].event_name).toBe("signup");
		expect(table!.rows[0].count).toBe(1);
	});

	it("aggregates custom event counts in D1", async () => {
		const backend = new CloudflareIngestionBackend({ writeDataPoint: vi.fn() }, d1);
		const storage = createMockStorage();

		await backend.ingest(makeEvent({ type: "custom", eventName: "click" }), storage);
		await backend.ingest(makeEvent({ type: "custom", eventName: "click" }), storage);
		await backend.ingest(makeEvent({ type: "custom", eventName: "signup" }), storage);

		const table = d1._tables.get("daily_custom_events");
		expect(table!.rows.length).toBe(2);
		const click = table!.rows.find((r) => r.event_name === "click");
		expect(click?.count).toBe(2);
		const signup = table!.rows.find((r) => r.event_name === "signup");
		expect(signup?.count).toBe(1);
	});

	it("does NOT write custom event to D1 when eventName is empty", async () => {
		const backend = new CloudflareIngestionBackend({ writeDataPoint: vi.fn() }, d1);
		const storage = createMockStorage();

		await backend.ingest(makeEvent({ type: "custom", eventName: "" }), storage);

		const table = d1._tables.get("daily_custom_events");
		expect(table?.rows.length ?? 0).toBe(0);
	});

	// -----------------------------------------------------------------------
	// D1: form submissions → daily_form_submissions table
	// -----------------------------------------------------------------------

	it("writes form_submit to D1 daily_form_submissions", async () => {
		const backend = new CloudflareIngestionBackend({ writeDataPoint: vi.fn() }, d1);
		const storage = createMockStorage();

		await backend.ingest(makeEvent({
			type: "custom",
			eventName: "form_submit",
			eventProps: '{"form":"newsletter"}',
		}), storage);

		const table = d1._tables.get("daily_form_submissions");
		expect(table).toBeDefined();
		expect(table!.rows.length).toBe(1);
		expect(table!.rows[0].form_name).toBe("newsletter");
		expect(table!.rows[0].count).toBe(1);
	});

	it("writes *_submit events to D1 daily_form_submissions", async () => {
		const backend = new CloudflareIngestionBackend({ writeDataPoint: vi.fn() }, d1);
		const storage = createMockStorage();

		await backend.ingest(makeEvent({
			type: "custom",
			eventName: "newsletter_submit",
			eventProps: '{"source":"sidebar"}',
		}), storage);

		const table = d1._tables.get("daily_form_submissions");
		expect(table!.rows.length).toBe(1);
		expect(table!.rows[0].form_name).toBe("sidebar");
	});

	it("falls back to pathname when form/source props missing", async () => {
		const backend = new CloudflareIngestionBackend({ writeDataPoint: vi.fn() }, d1);
		const storage = createMockStorage();

		await backend.ingest(makeEvent({
			type: "custom",
			eventName: "form_submit",
			eventProps: "{}",
			pathname: "/contact",
		}), storage);

		const table = d1._tables.get("daily_form_submissions");
		expect(table!.rows.length).toBe(1);
		expect(table!.rows[0].form_name).toBe("/contact");
	});

	it("aggregates form submission counts in D1", async () => {
		const backend = new CloudflareIngestionBackend({ writeDataPoint: vi.fn() }, d1);
		const storage = createMockStorage();

		await backend.ingest(makeEvent({ type: "custom", eventName: "form_submit", eventProps: '{"form":"contact"}' }), storage);
		await backend.ingest(makeEvent({ type: "custom", eventName: "form_submit", eventProps: '{"form":"contact"}' }), storage);

		const table = d1._tables.get("daily_form_submissions");
		expect(table!.rows.length).toBe(1);
		expect(table!.rows[0].count).toBe(2);
	});

	it("does NOT write to daily_form_submissions for non-submit events", async () => {
		const backend = new CloudflareIngestionBackend({ writeDataPoint: vi.fn() }, d1);
		const storage = createMockStorage();

		await backend.ingest(makeEvent({ type: "custom", eventName: "click", eventProps: '{"form":"test"}' }), storage);

		const table = d1._tables.get("daily_form_submissions");
		expect(table?.rows.length ?? 0).toBe(0);
	});

	// -----------------------------------------------------------------------
	// D1: visitor tracking → daily_custom_event_visitors + daily_form_visitors
	// -----------------------------------------------------------------------

	it("writes custom event visitor to D1 daily_custom_event_visitors", async () => {
		const backend = new CloudflareIngestionBackend({ writeDataPoint: vi.fn() }, d1);
		const storage = createMockStorage();

		await backend.ingest(makeEvent({
			type: "custom",
			eventName: "signup",
			visitorId: "v-abc",
		}), storage);

		const table = d1._tables.get("daily_custom_event_visitors");
		expect(table).toBeDefined();
		expect(table!.rows.length).toBe(1);
		expect(table!.rows[0].event_name).toBe("signup");
		expect(table!.rows[0].visitor_id).toBe("v-abc");
	});

	it("deduplicates custom event visitors per date+event", async () => {
		const backend = new CloudflareIngestionBackend({ writeDataPoint: vi.fn() }, d1);
		const storage = createMockStorage();

		await backend.ingest(makeEvent({ type: "custom", eventName: "signup", visitorId: "v-abc" }), storage);
		await backend.ingest(makeEvent({ type: "custom", eventName: "signup", visitorId: "v-abc" }), storage);
		await backend.ingest(makeEvent({ type: "custom", eventName: "signup", visitorId: "v-def" }), storage);

		const table = d1._tables.get("daily_custom_event_visitors");
		expect(table!.rows.length).toBe(2);
	});

	it("writes form visitor to D1 daily_form_visitors", async () => {
		const backend = new CloudflareIngestionBackend({ writeDataPoint: vi.fn() }, d1);
		const storage = createMockStorage();

		await backend.ingest(makeEvent({
			type: "custom",
			eventName: "form_submit",
			eventProps: '{"form":"newsletter"}',
			visitorId: "v-abc",
		}), storage);

		const table = d1._tables.get("daily_form_visitors");
		expect(table).toBeDefined();
		expect(table!.rows.length).toBe(1);
		expect(table!.rows[0].form_name).toBe("newsletter");
		expect(table!.rows[0].visitor_id).toBe("v-abc");
	});

	it("deduplicates form visitors per date+form", async () => {
		const backend = new CloudflareIngestionBackend({ writeDataPoint: vi.fn() }, d1);
		const storage = createMockStorage();

		await backend.ingest(makeEvent({ type: "custom", eventName: "form_submit", eventProps: '{"form":"contact"}', visitorId: "v-abc" }), storage);
		await backend.ingest(makeEvent({ type: "custom", eventName: "form_submit", eventProps: '{"form":"contact"}', visitorId: "v-abc" }), storage);

		const table = d1._tables.get("daily_form_visitors");
		expect(table!.rows.length).toBe(1);
	});

	// -----------------------------------------------------------------------
	// D1: form analytics → daily_form_analytics + daily_form_analytics_visitors
	// -----------------------------------------------------------------------

	it("writes form submission to D1 daily_form_analytics with event_name", async () => {
		const backend = new CloudflareIngestionBackend({ writeDataPoint: vi.fn() }, d1);
		const storage = createMockStorage();

		await backend.ingest(makeEvent({
			type: "custom",
			eventName: "form_submit",
			eventProps: '{"form":"newsletter"}',
			visitorId: "v-abc",
		}), storage);

		const table = d1._tables.get("daily_form_analytics");
		expect(table).toBeDefined();
		expect(table!.rows.length).toBe(1);
		expect(table!.rows[0].event_name).toBe("form_submit");
		expect(table!.rows[0].form_name).toBe("newsletter");
		expect(table!.rows[0].count).toBe(1);
	});

	it("writes form analytics visitor to D1 daily_form_analytics_visitors", async () => {
		const backend = new CloudflareIngestionBackend({ writeDataPoint: vi.fn() }, d1);
		const storage = createMockStorage();

		await backend.ingest(makeEvent({
			type: "custom",
			eventName: "newsletter_submit",
			eventProps: '{"source":"sidebar"}',
			visitorId: "v-xyz",
		}), storage);

		const table = d1._tables.get("daily_form_analytics_visitors");
		expect(table).toBeDefined();
		expect(table!.rows.length).toBe(1);
		expect(table!.rows[0].event_name).toBe("newsletter_submit");
		expect(table!.rows[0].form_name).toBe("sidebar");
		expect(table!.rows[0].visitor_id).toBe("v-xyz");
	});

	it("aggregates form analytics counts per event_name+form_name", async () => {
		const backend = new CloudflareIngestionBackend({ writeDataPoint: vi.fn() }, d1);
		const storage = createMockStorage();

		await backend.ingest(makeEvent({ type: "custom", eventName: "form_submit", eventProps: '{"form":"newsletter"}' }), storage);
		await backend.ingest(makeEvent({ type: "custom", eventName: "form_submit", eventProps: '{"form":"newsletter"}' }), storage);
		await backend.ingest(makeEvent({ type: "custom", eventName: "form_submit", eventProps: '{"form":"contact"}' }), storage);

		const table = d1._tables.get("daily_form_analytics");
		expect(table!.rows.length).toBe(2);
		const newsletter = table!.rows.find((r) => r.form_name === "newsletter");
		expect(newsletter?.count).toBe(2);
	});

	// -----------------------------------------------------------------------
	// D1: custom event props → daily_custom_event_props table
	// -----------------------------------------------------------------------

	it("writes custom event property key/value pairs to D1", async () => {
		const backend = new CloudflareIngestionBackend({ writeDataPoint: vi.fn() }, d1);
		const storage = createMockStorage();

		await backend.ingest(makeEvent({
			type: "custom",
			eventName: "signup",
			eventProps: '{"plan":"pro","source":"header"}',
		}), storage);

		const table = d1._tables.get("daily_custom_event_props");
		expect(table).toBeDefined();
		expect(table!.rows.length).toBe(2);
		const planRow = table!.rows.find((r) => r.prop_key === "plan");
		expect(planRow?.prop_value).toBe("pro");
		expect(planRow?.count).toBe(1);
		const sourceRow = table!.rows.find((r) => r.prop_key === "source");
		expect(sourceRow?.prop_value).toBe("header");
	});

	it("aggregates custom event prop counts in D1", async () => {
		const backend = new CloudflareIngestionBackend({ writeDataPoint: vi.fn() }, d1);
		const storage = createMockStorage();

		await backend.ingest(makeEvent({ type: "custom", eventName: "signup", eventProps: '{"plan":"pro"}' }), storage);
		await backend.ingest(makeEvent({ type: "custom", eventName: "signup", eventProps: '{"plan":"pro"}' }), storage);
		await backend.ingest(makeEvent({ type: "custom", eventName: "signup", eventProps: '{"plan":"free"}' }), storage);

		const table = d1._tables.get("daily_custom_event_props");
		expect(table!.rows.length).toBe(2);
		const proRow = table!.rows.find((r) => r.prop_value === "pro");
		expect(proRow?.count).toBe(2);
		const freeRow = table!.rows.find((r) => r.prop_value === "free");
		expect(freeRow?.count).toBe(1);
	});

	it("does NOT write props when eventProps is empty", async () => {
		const backend = new CloudflareIngestionBackend({ writeDataPoint: vi.fn() }, d1);
		const storage = createMockStorage();

		await backend.ingest(makeEvent({ type: "custom", eventName: "click", eventProps: "" }), storage);

		const table = d1._tables.get("daily_custom_event_props");
		expect(table?.rows.length ?? 0).toBe(0);
	});

	it("does NOT write props when eventProps is invalid JSON", async () => {
		const backend = new CloudflareIngestionBackend({ writeDataPoint: vi.fn() }, d1);
		const storage = createMockStorage();

		await backend.ingest(makeEvent({ type: "custom", eventName: "click", eventProps: "not json" }), storage);

		const table = d1._tables.get("daily_custom_event_props");
		expect(table?.rows.length ?? 0).toBe(0);
	});

	// -----------------------------------------------------------------------
	// Portable storage: events + custom_events written, daily_stats NOT written
	// -----------------------------------------------------------------------

	it("writes to portable events storage", async () => {
		const backend = new CloudflareIngestionBackend({ writeDataPoint: vi.fn() }, d1);
		const storage = createMockStorage();

		await backend.ingest(makeEvent({ type: "pageview" }), storage);

		expect(storage.events.put).toHaveBeenCalledOnce();
	});

	it("does NOT write to portable custom_events (migrated to D1)", async () => {
		const backend = new CloudflareIngestionBackend({ writeDataPoint: vi.fn() }, d1);
		const storage = createMockStorage();

		await backend.ingest(makeEvent({
			type: "custom",
			eventName: "signup",
			eventProps: '{"plan":"pro"}',
		}), storage);

		expect(storage.events.put).toHaveBeenCalledOnce();
		expect(storage.custom_events.put).not.toHaveBeenCalled();
	});

	it("does NOT write to portable daily_stats", async () => {
		const backend = new CloudflareIngestionBackend({ writeDataPoint: vi.fn() }, d1);
		const storage = createMockStorage();

		await backend.ingest(makeEvent({ type: "pageview" }), storage);
		await backend.ingest(makeEvent({ type: "scroll", scrollDepth: 50 }), storage);
		await backend.ingest(makeEvent({ type: "ping", seconds: 30 }), storage);
		await backend.ingest(makeEvent({ type: "custom", eventName: "click", eventProps: "{}" }), storage);

		expect(storage.daily_stats.put).not.toHaveBeenCalled();
		expect(storage.daily_stats.query).not.toHaveBeenCalled();
		expect(storage.daily_stats.get).not.toHaveBeenCalled();
	});

	it("writes in order: AE → D1 → portable", async () => {
		const callOrder: string[] = [];
		const writeDataPoint = vi.fn(() => callOrder.push("ae"));

		const origBatch = d1.batch.bind(d1);
		d1.batch = async (stmts) => {
			const result = await origBatch(stmts);
			callOrder.push("d1");
			return result;
		};

		const storage = createMockStorage();
		const origEventsPut = storage.events.put;
		(storage.events as any).put = vi.fn(async (...args: any[]) => {
			await (origEventsPut as any)(...args);
			callOrder.push("portable");
		});

		const backend = new CloudflareIngestionBackend({ writeDataPoint }, d1);
		await backend.ingest(makeEvent(), storage);

		expect(callOrder).toEqual(["ae", "d1", "portable"]);
	});
});
