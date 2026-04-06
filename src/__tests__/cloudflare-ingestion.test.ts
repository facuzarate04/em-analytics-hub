import { describe, it, expect, vi } from "vitest";
import {
	CloudflareIngestionBackend,
	serializeEvent,
} from "../backends/cloudflare/ingestion.js";
import type { AnalyticsEngineDataset } from "../backends/cloudflare/ingestion.js";
import type { NormalizedEvent } from "../capture/types.js";
import type { AnalyticsIngestionBackend, IngestionStorage } from "../ingestion/types.js";

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
// serializeEvent (pure function — no behavioral changes from dual-write)
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
// CloudflareIngestionBackend — dual-write behavior
// ---------------------------------------------------------------------------

describe("CloudflareIngestionBackend", () => {
	it("writes to Analytics Engine", async () => {
		const writeDataPoint = vi.fn();
		const dataset: AnalyticsEngineDataset = { writeDataPoint };
		const portable = createMockPortable();
		const backend = new CloudflareIngestionBackend(dataset, portable);

		await backend.ingest(makeEvent(), dummyStorage);

		expect(writeDataPoint).toHaveBeenCalledOnce();
		const dp = writeDataPoint.mock.calls[0][0];
		expect(dp.indexes).toEqual(["pageview"]);
		expect(dp.blobs![0]).toBe("/blog/hello");
		expect(dp.doubles).toEqual([0, 0]);
	});

	it("delegates to portable backend for storage writes", async () => {
		const writeDataPoint = vi.fn();
		const dataset: AnalyticsEngineDataset = { writeDataPoint };
		const portable = createMockPortable();
		const backend = new CloudflareIngestionBackend(dataset, portable);
		const event = makeEvent();

		await backend.ingest(event, dummyStorage);

		expect(portable.ingest).toHaveBeenCalledOnce();
		expect(portable.ingest).toHaveBeenCalledWith(event, dummyStorage);
	});

	it("dual-writes: both AE and portable receive the event", async () => {
		const writeDataPoint = vi.fn();
		const dataset: AnalyticsEngineDataset = { writeDataPoint };
		const portable = createMockPortable();
		const backend = new CloudflareIngestionBackend(dataset, portable);

		await backend.ingest(makeEvent({ type: "scroll", scrollDepth: 75 }), dummyStorage);

		expect(writeDataPoint).toHaveBeenCalledOnce();
		expect(portable.ingest).toHaveBeenCalledOnce();
		expect(writeDataPoint.mock.calls[0][0].indexes).toEqual(["scroll"]);
	});

	it("passes storage through to portable for pageviews (daily_stats update)", async () => {
		const writeDataPoint = vi.fn();
		const dataset: AnalyticsEngineDataset = { writeDataPoint };
		const portable = createMockPortable();
		const backend = new CloudflareIngestionBackend(dataset, portable);
		const storage = { events: {}, daily_stats: {}, custom_events: {} } as unknown as IngestionStorage;
		const event = makeEvent({ type: "pageview" });

		await backend.ingest(event, storage);

		// Portable receives actual storage reference so it can update daily_stats
		expect(portable.ingest).toHaveBeenCalledWith(event, storage);
	});

	it("passes custom events through to portable (custom_events collection)", async () => {
		const writeDataPoint = vi.fn();
		const dataset: AnalyticsEngineDataset = { writeDataPoint };
		const portable = createMockPortable();
		const backend = new CloudflareIngestionBackend(dataset, portable);
		const event = makeEvent({
			type: "custom",
			eventName: "signup",
			eventProps: '{"plan":"pro"}',
		});

		await backend.ingest(event, dummyStorage);

		// AE gets the custom event serialized
		expect(writeDataPoint.mock.calls[0][0].indexes).toEqual(["custom"]);
		expect(writeDataPoint.mock.calls[0][0].blobs![11]).toBe("signup");

		// Portable also gets it (writes to custom_events collection)
		expect(portable.ingest).toHaveBeenCalledWith(event, dummyStorage);
	});

	it("handles multiple sequential ingestions", async () => {
		const writeDataPoint = vi.fn();
		const dataset: AnalyticsEngineDataset = { writeDataPoint };
		const portable = createMockPortable();
		const backend = new CloudflareIngestionBackend(dataset, portable);

		await backend.ingest(makeEvent({ type: "pageview" }), dummyStorage);
		await backend.ingest(makeEvent({ type: "scroll", scrollDepth: 50 }), dummyStorage);
		await backend.ingest(makeEvent({ type: "custom", eventName: "click" }), dummyStorage);

		expect(writeDataPoint).toHaveBeenCalledTimes(3);
		expect(portable.ingest).toHaveBeenCalledTimes(3);

		expect(writeDataPoint.mock.calls[0][0].indexes).toEqual(["pageview"]);
		expect(writeDataPoint.mock.calls[1][0].indexes).toEqual(["scroll"]);
		expect(writeDataPoint.mock.calls[2][0].indexes).toEqual(["custom"]);
	});

	it("writes to AE first, then delegates to portable", async () => {
		const callOrder: string[] = [];
		const writeDataPoint = vi.fn(() => callOrder.push("ae"));
		const dataset: AnalyticsEngineDataset = { writeDataPoint };
		const portable: AnalyticsIngestionBackend = {
			ingest: vi.fn(async () => { callOrder.push("portable"); }),
		};
		const backend = new CloudflareIngestionBackend(dataset, portable);

		await backend.ingest(makeEvent(), dummyStorage);

		expect(callOrder).toEqual(["ae", "portable"]);
	});
});
