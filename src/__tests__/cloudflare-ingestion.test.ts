import { describe, it, expect, vi, beforeEach } from "vitest";
import {
	CloudflareIngestionBackend,
	serializeEvent,
} from "../backends/cloudflare/ingestion.js";
import type { AnalyticsEngineDataset } from "../backends/cloudflare/ingestion.js";
import type { NormalizedEvent } from "../capture/types.js";
import type { AnalyticsIngestionBackend, IngestionStorage } from "../ingestion/types.js";
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

function createMockPortable(): AnalyticsIngestionBackend & { ingest: ReturnType<typeof vi.fn> } {
	return { ingest: vi.fn().mockResolvedValue(undefined) };
}

const dummyStorage = {} as IngestionStorage;

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
// CloudflareIngestionBackend — triple-write behavior (AE + D1 + portable)
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
		const portable = createMockPortable();
		const backend = new CloudflareIngestionBackend(dataset, d1, portable);

		await backend.ingest(makeEvent(), dummyStorage);

		expect(writeDataPoint).toHaveBeenCalledOnce();
		const dp = writeDataPoint.mock.calls[0][0];
		expect(dp.indexes).toEqual(["pageview"]);
		expect(dp.blobs![0]).toBe("/blog/hello");
	});

	it("delegates to portable backend", async () => {
		const writeDataPoint = vi.fn();
		const dataset: AnalyticsEngineDataset = { writeDataPoint };
		const portable = createMockPortable();
		const backend = new CloudflareIngestionBackend(dataset, d1, portable);
		const event = makeEvent();

		await backend.ingest(event, dummyStorage);

		expect(portable.ingest).toHaveBeenCalledOnce();
		expect(portable.ingest).toHaveBeenCalledWith(event, dummyStorage);
	});

	it("writes pageview to D1 daily_pages", async () => {
		const writeDataPoint = vi.fn();
		const portable = createMockPortable();
		const backend = new CloudflareIngestionBackend({ writeDataPoint }, d1, portable);

		await backend.ingest(makeEvent({ type: "pageview" }), dummyStorage);

		const table = d1._tables.get("daily_pages");
		expect(table).toBeDefined();
		expect(table!.rows.length).toBe(1);
		expect(table!.rows[0].views).toBe(1);
		expect(table!.rows[0].pathname).toBe("/blog/hello");
		expect(table!.rows[0].template).toBe("post");
	});

	it("writes pageview visitor to D1 daily_visitors", async () => {
		const writeDataPoint = vi.fn();
		const portable = createMockPortable();
		const backend = new CloudflareIngestionBackend({ writeDataPoint }, d1, portable);

		await backend.ingest(makeEvent({ type: "pageview", visitorId: "v-abc" }), dummyStorage);

		const visitors = d1._tables.get("daily_visitors");
		expect(visitors).toBeDefined();
		expect(visitors!.rows.length).toBe(1);
		expect(visitors!.rows[0].visitor_id).toBe("v-abc");
	});

	it("deduplicates visitors in D1", async () => {
		const writeDataPoint = vi.fn();
		const portable = createMockPortable();
		const backend = new CloudflareIngestionBackend({ writeDataPoint }, d1, portable);

		await backend.ingest(makeEvent({ type: "pageview", visitorId: "v-same" }), dummyStorage);
		await backend.ingest(makeEvent({ type: "pageview", visitorId: "v-same" }), dummyStorage);

		const visitors = d1._tables.get("daily_visitors");
		expect(visitors!.rows.length).toBe(1);
	});

	it("writes referrer to D1 daily_referrers", async () => {
		const writeDataPoint = vi.fn();
		const portable = createMockPortable();
		const backend = new CloudflareIngestionBackend({ writeDataPoint }, d1, portable);

		await backend.ingest(makeEvent({ type: "pageview", referrer: "https://example.com" }), dummyStorage);
		await backend.ingest(makeEvent({ type: "pageview", referrer: "https://example.com" }), dummyStorage);

		const referrers = d1._tables.get("daily_referrers");
		expect(referrers!.rows.length).toBe(1);
		expect(referrers!.rows[0].count).toBe(2);
	});

	it("writes country to D1 daily_countries", async () => {
		const writeDataPoint = vi.fn();
		const portable = createMockPortable();
		const backend = new CloudflareIngestionBackend({ writeDataPoint }, d1, portable);

		await backend.ingest(makeEvent({ type: "pageview", country: "AR" }), dummyStorage);

		const countries = d1._tables.get("daily_countries");
		expect(countries!.rows.length).toBe(1);
		expect(countries!.rows[0].country).toBe("AR");
		expect(countries!.rows[0].count).toBe(1);
	});

	it("writes UTM campaigns to D1 daily_campaigns", async () => {
		const writeDataPoint = vi.fn();
		const portable = createMockPortable();
		const backend = new CloudflareIngestionBackend({ writeDataPoint }, d1, portable);

		await backend.ingest(makeEvent({
			type: "pageview",
			utmSource: "twitter",
			utmMedium: "social",
			utmCampaign: "launch",
		}), dummyStorage);

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
		const writeDataPoint = vi.fn();
		const portable = createMockPortable();
		const backend = new CloudflareIngestionBackend({ writeDataPoint }, d1, portable);

		// First create the page row with a pageview
		await backend.ingest(makeEvent({ type: "pageview" }), dummyStorage);
		// Then scroll
		await backend.ingest(makeEvent({ type: "scroll", scrollDepth: 50 }), dummyStorage);

		const pages = d1._tables.get("daily_pages");
		expect(pages!.rows[0].scroll50).toBe(1);
	});

	it("writes ping event to D1 (time tracking)", async () => {
		const writeDataPoint = vi.fn();
		const portable = createMockPortable();
		const backend = new CloudflareIngestionBackend({ writeDataPoint }, d1, portable);

		await backend.ingest(makeEvent({ type: "pageview" }), dummyStorage);
		await backend.ingest(makeEvent({ type: "ping", seconds: 30 }), dummyStorage);

		const pages = d1._tables.get("daily_pages");
		expect(pages!.rows[0].time_total).toBe(30);
		expect(pages!.rows[0].time_count).toBe(1);
	});

	it("writes read event to D1", async () => {
		const writeDataPoint = vi.fn();
		const portable = createMockPortable();
		const backend = new CloudflareIngestionBackend({ writeDataPoint }, d1, portable);

		await backend.ingest(makeEvent({ type: "pageview" }), dummyStorage);
		await backend.ingest(makeEvent({ type: "read" }), dummyStorage);

		const pages = d1._tables.get("daily_pages");
		expect(pages!.rows[0].reads).toBe(1);
	});

	it("writes engaged event to D1", async () => {
		const writeDataPoint = vi.fn();
		const portable = createMockPortable();
		const backend = new CloudflareIngestionBackend({ writeDataPoint }, d1, portable);

		await backend.ingest(makeEvent({ type: "pageview" }), dummyStorage);
		await backend.ingest(makeEvent({ type: "engaged" }), dummyStorage);

		const pages = d1._tables.get("daily_pages");
		expect(pages!.rows[0].engaged_views).toBe(1);
	});

	it("writes recirc event to D1", async () => {
		const writeDataPoint = vi.fn();
		const portable = createMockPortable();
		const backend = new CloudflareIngestionBackend({ writeDataPoint }, d1, portable);

		await backend.ingest(makeEvent({ type: "pageview" }), dummyStorage);
		await backend.ingest(makeEvent({ type: "recirc" }), dummyStorage);

		const pages = d1._tables.get("daily_pages");
		expect(pages!.rows[0].recircs).toBe(1);
	});

	it("triple-writes: AE + D1 + portable all receive the event", async () => {
		const writeDataPoint = vi.fn();
		const portable = createMockPortable();
		const backend = new CloudflareIngestionBackend({ writeDataPoint }, d1, portable);

		await backend.ingest(makeEvent({ type: "pageview" }), dummyStorage);

		expect(writeDataPoint).toHaveBeenCalledOnce();
		expect(portable.ingest).toHaveBeenCalledOnce();
		expect(d1._tables.get("daily_pages")!.rows.length).toBe(1);
	});

	it("writes in order: AE → D1 → portable", async () => {
		const callOrder: string[] = [];
		const writeDataPoint = vi.fn(() => callOrder.push("ae"));
		const portable: AnalyticsIngestionBackend = {
			ingest: vi.fn(async () => { callOrder.push("portable"); }),
		};

		// Wrap D1 batch to track order
		const origBatch = d1.batch.bind(d1);
		d1.batch = async (stmts) => {
			const result = await origBatch(stmts);
			callOrder.push("d1");
			return result;
		};

		const backend = new CloudflareIngestionBackend({ writeDataPoint }, d1, portable);
		await backend.ingest(makeEvent(), dummyStorage);

		expect(callOrder).toEqual(["ae", "d1", "portable"]);
	});
});
