import { describe, it, expect, vi, beforeEach } from "vitest";
import { PortableIngestionBackend } from "../backends/portable/ingestion.js";
import { ingestEvent } from "../ingestion/service.js";
import type { IngestionStorage } from "../ingestion/types.js";
import type { NormalizedEvent } from "../capture/types.js";
import type { DailyStats, RawEvent, CustomEvent } from "../types.js";
import { normalizeDailyStats } from "../helpers/aggregation.js";

function makeStorage(): IngestionStorage & {
	written: { events: Array<{ id: string; data: RawEvent }>; custom: Array<{ id: string; data: CustomEvent }> };
	statsStore: Map<string, DailyStats>;
} {
	const written = {
		events: [] as Array<{ id: string; data: RawEvent }>,
		custom: [] as Array<{ id: string; data: CustomEvent }>,
	};
	const statsStore = new Map<string, DailyStats>();

	return {
		written,
		statsStore,
		events: {
			get: vi.fn(),
			put: vi.fn(async (id: string, data: RawEvent) => { written.events.push({ id, data }); }),
			query: vi.fn(),
			deleteMany: vi.fn(),
		},
		daily_stats: {
			get: vi.fn(async (id: string) => statsStore.get(id)),
			put: vi.fn(async (id: string, data: DailyStats) => { statsStore.set(id, data); }),
			query: vi.fn(),
			deleteMany: vi.fn(),
		},
		custom_events: {
			get: vi.fn(),
			put: vi.fn(async (id: string, data: CustomEvent) => { written.custom.push({ id, data }); }),
			query: vi.fn(),
			deleteMany: vi.fn(),
		},
	};
}

function makeEvent(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
	return {
		pathname: "/blog/post",
		type: "pageview",
		referrer: "google.com",
		visitorId: "abc123",
		country: "US",
		template: "post",
		collection: "blog",
		utmSource: "twitter",
		utmMedium: "social",
		utmCampaign: "launch",
		utmTerm: "",
		utmContent: "",
		seconds: 0,
		scrollDepth: 0,
		eventName: "",
		eventProps: "",
		createdAt: "2026-04-05T12:00:00.000Z",
		...overrides,
	};
}

function getStats(storage: ReturnType<typeof makeStorage>, pathname: string, date: string): DailyStats | undefined {
	return storage.statsStore.get(`${pathname}:${date}`);
}

// ─── PortableIngestionBackend ──────────────────────────────────────────────

describe("PortableIngestionBackend", () => {
	let backend: PortableIngestionBackend;
	let storage: ReturnType<typeof makeStorage>;

	beforeEach(() => {
		backend = new PortableIngestionBackend();
		storage = makeStorage();
	});

	describe("pageview", () => {
		it("persists raw event", async () => {
			const ev = makeEvent();
			await backend.ingest(ev, storage);

			expect(storage.written.events).toHaveLength(1);
			expect(storage.written.events[0].data.pathname).toBe("/blog/post");
			expect(storage.written.events[0].data.type).toBe("pageview");
		});

		it("updates daily stats views and visitors", async () => {
			const ev = makeEvent();
			await backend.ingest(ev, storage);

			const stats = getStats(storage, "/blog/post", expect.any(String) as any);
			const allStats = Array.from(storage.statsStore.values());
			expect(allStats).toHaveLength(1);
			expect(allStats[0].views).toBe(1);
			expect(allStats[0].visitors).toContain("abc123");
		});

		it("increments referrer counts", async () => {
			await backend.ingest(makeEvent(), storage);

			const stats = Array.from(storage.statsStore.values())[0];
			expect(stats.referrers["google.com"]).toBe(1);
		});

		it("increments country counts", async () => {
			await backend.ingest(makeEvent({ country: "AR" }), storage);

			const stats = Array.from(storage.statsStore.values())[0];
			expect(stats.countries["AR"]).toBe(1);
		});

		it("increments UTM source/medium/campaign", async () => {
			await backend.ingest(makeEvent(), storage);

			const stats = Array.from(storage.statsStore.values())[0];
			expect(stats.utmSources["twitter"]).toBe(1);
			expect(stats.utmMediums["social"]).toBe(1);
			expect(stats.utmCampaigns["launch"]).toBe(1);
		});

		it("does not duplicate visitor on repeated events", async () => {
			await backend.ingest(makeEvent(), storage);
			await backend.ingest(makeEvent(), storage);

			const stats = Array.from(storage.statsStore.values())[0];
			expect(stats.visitors).toHaveLength(1);
			expect(stats.views).toBe(2);
		});

		it("sets template and collection on stats", async () => {
			await backend.ingest(makeEvent({ template: "article", collection: "news" }), storage);

			const stats = Array.from(storage.statsStore.values())[0];
			expect(stats.template).toBe("article");
			expect(stats.collection).toBe("news");
		});
	});

	describe("custom event", () => {
		it("persists raw event and custom event", async () => {
			const props = JSON.stringify({ plan: "pro" });
			const ev = makeEvent({
				type: "custom",
				eventName: "signup",
				eventProps: props,
			});
			await backend.ingest(ev, storage);

			expect(storage.written.events).toHaveLength(1);
			expect(storage.written.custom).toHaveLength(1);
			expect(storage.written.custom[0].data.name).toBe("signup");
			expect(storage.written.custom[0].data.props).toEqual({ plan: "pro" });
		});

		it("handles invalid JSON in props gracefully", async () => {
			const ev = makeEvent({
				type: "custom",
				eventName: "click",
				eventProps: "not-json",
			});
			await backend.ingest(ev, storage);

			expect(storage.written.custom).toHaveLength(1);
			expect(storage.written.custom[0].data.props).toEqual({});
		});

		it("does not write custom event when eventName is empty", async () => {
			const ev = makeEvent({ type: "custom", eventName: "" });
			await backend.ingest(ev, storage);

			expect(storage.written.events).toHaveLength(1);
			expect(storage.written.custom).toHaveLength(0);
		});
	});

	describe("ping", () => {
		it("updates timeTotal and timeCount", async () => {
			await backend.ingest(makeEvent({ type: "ping", seconds: 30 }), storage);

			const stats = Array.from(storage.statsStore.values())[0];
			expect(stats.timeTotal).toBe(30);
			expect(stats.timeCount).toBe(1);
		});

		it("accumulates across multiple pings", async () => {
			await backend.ingest(makeEvent({ type: "ping", seconds: 10 }), storage);
			await backend.ingest(makeEvent({ type: "ping", seconds: 20 }), storage);

			const stats = Array.from(storage.statsStore.values())[0];
			expect(stats.timeTotal).toBe(30);
			expect(stats.timeCount).toBe(2);
		});

		it("ignores zero-second pings", async () => {
			await backend.ingest(makeEvent({ type: "ping", seconds: 0 }), storage);

			const stats = Array.from(storage.statsStore.values())[0];
			expect(stats.timeTotal).toBe(0);
			expect(stats.timeCount).toBe(0);
		});
	});

	describe("scroll", () => {
		it("increments scroll25", async () => {
			await backend.ingest(makeEvent({ type: "scroll", scrollDepth: 25 }), storage);
			expect(Array.from(storage.statsStore.values())[0].scroll25).toBe(1);
		});

		it("increments scroll50", async () => {
			await backend.ingest(makeEvent({ type: "scroll", scrollDepth: 50 }), storage);
			expect(Array.from(storage.statsStore.values())[0].scroll50).toBe(1);
		});

		it("increments scroll75", async () => {
			await backend.ingest(makeEvent({ type: "scroll", scrollDepth: 75 }), storage);
			expect(Array.from(storage.statsStore.values())[0].scroll75).toBe(1);
		});

		it("increments scroll100", async () => {
			await backend.ingest(makeEvent({ type: "scroll", scrollDepth: 100 }), storage);
			expect(Array.from(storage.statsStore.values())[0].scroll100).toBe(1);
		});

		it("ignores non-milestone depths", async () => {
			await backend.ingest(makeEvent({ type: "scroll", scrollDepth: 33 }), storage);
			const stats = Array.from(storage.statsStore.values())[0];
			expect(stats.scroll25 + stats.scroll50 + stats.scroll75 + stats.scroll100).toBe(0);
		});
	});

	describe("engaged", () => {
		it("increments engagedViews", async () => {
			await backend.ingest(makeEvent({ type: "engaged" }), storage);
			expect(Array.from(storage.statsStore.values())[0].engagedViews).toBe(1);
		});
	});

	describe("recirc", () => {
		it("increments recircs", async () => {
			await backend.ingest(makeEvent({ type: "recirc" }), storage);
			expect(Array.from(storage.statsStore.values())[0].recircs).toBe(1);
		});
	});

	describe("read", () => {
		it("increments reads", async () => {
			await backend.ingest(makeEvent({ type: "read" }), storage);
			expect(Array.from(storage.statsStore.values())[0].reads).toBe(1);
		});
	});
});

// ─── ingestEvent service ───────────────────────────────────────────────────

describe("ingestEvent", () => {
	it("delegates to the backend", async () => {
		const mockBackend = { ingest: vi.fn() };
		const ev = makeEvent();
		const storage = makeStorage();

		await ingestEvent(mockBackend, ev, storage);

		expect(mockBackend.ingest).toHaveBeenCalledWith(ev, storage);
	});
});
