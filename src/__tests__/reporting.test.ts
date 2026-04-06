import { describe, it, expect, vi, beforeEach } from "vitest";
import { PortableReportingBackend } from "../backends/portable/reporting.js";
import { getStatsReport, getTopPagesReport, getReferrersReport, getCampaignsReport, getCampaignIntelligenceReport, getCustomEventsReport, getDetectedFormsReport } from "../reporting/service.js";
import type { ReportingStorage } from "../reporting/types.js";
import type { DailyStats } from "../types.js";
import { normalizeDailyStats } from "../helpers/aggregation.js";

function makeDailyStats(overrides: Partial<DailyStats> = {}): DailyStats {
	return normalizeDailyStats({
		pathname: "/blog/post",
		date: "2026-04-01",
		...overrides,
	});
}

function makeStorage(records: DailyStats[], customEvents: any[] = []): ReportingStorage {
	return {
		daily_stats: {
			get: vi.fn(),
			put: vi.fn(),
			query: vi.fn(async ({ where, cursor }: any) => {
				if (cursor) return { items: [], cursor: undefined };
				return {
					items: records.map((data, i) => ({ id: `${data.pathname}:${data.date}`, data })),
					cursor: undefined,
				};
			}),
			deleteMany: vi.fn(),
		},
		custom_events: {
			get: vi.fn(),
			put: vi.fn(),
			query: vi.fn(async ({ cursor }: any) => {
				if (cursor) return { items: [], cursor: undefined };
				return {
					items: customEvents.map((data, i) => ({ id: String(i), data })),
					cursor: undefined,
				};
			}),
			deleteMany: vi.fn(),
		},
	} as any;
}

// ─── PortableReportingBackend ──────────────────────────────────────────────

describe("PortableReportingBackend", () => {
	let backend: PortableReportingBackend;

	beforeEach(() => {
		backend = new PortableReportingBackend();
	});

	describe("getStats", () => {
		it("returns zeroes for empty data", async () => {
			const storage = makeStorage([]);
			const report = await backend.getStats({ dateFrom: "2026-04-01", dateTo: "2026-04-07" }, storage);

			expect(report.views).toBe(0);
			expect(report.visitors).toBe(0);
			expect(report.reads).toBe(0);
			expect(report.readRate).toBe(0);
			expect(report.avgTimeSeconds).toBe(0);
			expect(report.engagedViews).toBe(0);
			expect(report.recircs).toBe(0);
		});

		it("aggregates views and visitors", async () => {
			const storage = makeStorage([
				makeDailyStats({ views: 10, visitors: ["a", "b"] }),
				makeDailyStats({ views: 20, visitors: ["b", "c"], date: "2026-04-02" }),
			]);
			const report = await backend.getStats({ dateFrom: "2026-04-01", dateTo: "2026-04-07" }, storage);

			expect(report.views).toBe(30);
			expect(report.visitors).toBe(3);
		});

		it("computes readRate as percentage", async () => {
			const storage = makeStorage([
				makeDailyStats({ views: 100, reads: 40 }),
			]);
			const report = await backend.getStats({ dateFrom: "2026-04-01", dateTo: "2026-04-07" }, storage);

			expect(report.readRate).toBe(40);
		});

		it("computes avgTimeSeconds", async () => {
			const storage = makeStorage([
				makeDailyStats({ timeTotal: 600, timeCount: 10 }),
			]);
			const report = await backend.getStats({ dateFrom: "2026-04-01", dateTo: "2026-04-07" }, storage);

			expect(report.avgTimeSeconds).toBe(60);
		});

		it("computes engagedRate and recircRate", async () => {
			const storage = makeStorage([
				makeDailyStats({ views: 200, engagedViews: 50, recircs: 20 }),
			]);
			const report = await backend.getStats({ dateFrom: "2026-04-01", dateTo: "2026-04-07" }, storage);

			expect(report.engagedRate).toBe(25);
			expect(report.recircRate).toBe(10);
		});

		it("includes scroll depth milestones", async () => {
			const storage = makeStorage([
				makeDailyStats({ scroll25: 10, scroll50: 8, scroll75: 5, scroll100: 2 }),
			]);
			const report = await backend.getStats({ dateFrom: "2026-04-01", dateTo: "2026-04-07" }, storage);

			expect(report.scrollDepth).toEqual({ "25": 10, "50": 8, "75": 5, "100": 2 });
		});

		it("merges referrers", async () => {
			const storage = makeStorage([
				makeDailyStats({ referrers: { "google.com": 5, "twitter.com": 3 } }),
				makeDailyStats({ referrers: { "google.com": 2 }, date: "2026-04-02" }),
			]);
			const report = await backend.getStats({ dateFrom: "2026-04-01", dateTo: "2026-04-07" }, storage);

			expect(report.referrers["google.com"]).toBe(7);
			expect(report.referrers["twitter.com"]).toBe(3);
		});

		it("merges UTM sources/mediums/campaigns", async () => {
			const storage = makeStorage([
				makeDailyStats({ utmSources: { twitter: 5 }, utmMediums: { social: 3 }, utmCampaigns: { launch: 2 } }),
			]);
			const report = await backend.getStats({ dateFrom: "2026-04-01", dateTo: "2026-04-07" }, storage);

			expect(report.utmSources["twitter"]).toBe(5);
			expect(report.utmMediums["social"]).toBe(3);
			expect(report.utmCampaigns["launch"]).toBe(2);
		});

		it("includes countries", async () => {
			const storage = makeStorage([
				makeDailyStats({ countries: { US: 10, AR: 5 } }),
			]);
			const report = await backend.getStats({ dateFrom: "2026-04-01", dateTo: "2026-04-07" }, storage);

			expect(report.countries).toEqual({ US: 10, AR: 5 });
		});

		it("includes daily breakdown", async () => {
			const storage = makeStorage([
				makeDailyStats({ date: "2026-04-01", views: 10, visitors: ["a"], reads: 2, engagedViews: 1 }),
				makeDailyStats({ date: "2026-04-02", views: 20, visitors: ["b"], reads: 5, engagedViews: 3 }),
			]);
			const report = await backend.getStats({ dateFrom: "2026-04-01", dateTo: "2026-04-07" }, storage);

			expect(report.daily["2026-04-01"]).toEqual({ views: 10, visitors: 1, reads: 2, engagedViews: 1 });
			expect(report.daily["2026-04-02"]).toEqual({ views: 20, visitors: 1, reads: 5, engagedViews: 3 });
		});
	});

	describe("getTopPages", () => {
		it("returns empty for no data", async () => {
			const storage = makeStorage([]);
			const pages = await backend.getTopPages({ dateFrom: "2026-04-01", dateTo: "2026-04-07", limit: 10 }, storage);

			expect(pages).toEqual([]);
		});

		it("ranks pages by views descending", async () => {
			const storage = makeStorage([
				makeDailyStats({ pathname: "/a", views: 5 }),
				makeDailyStats({ pathname: "/b", views: 20 }),
				makeDailyStats({ pathname: "/c", views: 10 }),
			]);
			const pages = await backend.getTopPages({ dateFrom: "2026-04-01", dateTo: "2026-04-07", limit: 10 }, storage);

			expect(pages[0].pathname).toBe("/b");
			expect(pages[1].pathname).toBe("/c");
			expect(pages[2].pathname).toBe("/a");
		});

		it("respects limit", async () => {
			const storage = makeStorage([
				makeDailyStats({ pathname: "/a", views: 5 }),
				makeDailyStats({ pathname: "/b", views: 20 }),
				makeDailyStats({ pathname: "/c", views: 10 }),
			]);
			const pages = await backend.getTopPages({ dateFrom: "2026-04-01", dateTo: "2026-04-07", limit: 2 }, storage);

			expect(pages).toHaveLength(2);
		});

		it("includes template and collection", async () => {
			const storage = makeStorage([
				makeDailyStats({ pathname: "/blog/x", template: "post", collection: "blog", views: 1 }),
			]);
			const pages = await backend.getTopPages({ dateFrom: "2026-04-01", dateTo: "2026-04-07", limit: 10 }, storage);

			expect(pages[0].template).toBe("post");
			expect(pages[0].collection).toBe("blog");
		});

		it("computes per-page rates", async () => {
			const storage = makeStorage([
				makeDailyStats({ pathname: "/a", views: 100, reads: 30, engagedViews: 40, recircs: 10, timeTotal: 300, timeCount: 5 }),
			]);
			const pages = await backend.getTopPages({ dateFrom: "2026-04-01", dateTo: "2026-04-07", limit: 10 }, storage);

			expect(pages[0].readRate).toBe(30);
			expect(pages[0].engagedRate).toBe(40);
			expect(pages[0].recircRate).toBe(10);
			expect(pages[0].avgTime).toBe(60);
		});
	});

	describe("getReferrers", () => {
		it("returns empty for no data", async () => {
			const storage = makeStorage([]);
			const referrers = await backend.getReferrers({ dateFrom: "2026-04-01", dateTo: "2026-04-07", limit: 20 }, storage);

			expect(referrers).toEqual([]);
		});

		it("sorts by count descending", async () => {
			const storage = makeStorage([
				makeDailyStats({ referrers: { "google.com": 10, "twitter.com": 30, "github.com": 20 } }),
			]);
			const referrers = await backend.getReferrers({ dateFrom: "2026-04-01", dateTo: "2026-04-07", limit: 20 }, storage);

			expect(referrers[0]).toEqual({ domain: "twitter.com", count: 30 });
			expect(referrers[1]).toEqual({ domain: "github.com", count: 20 });
			expect(referrers[2]).toEqual({ domain: "google.com", count: 10 });
		});

		it("respects limit", async () => {
			const storage = makeStorage([
				makeDailyStats({ referrers: { "a.com": 1, "b.com": 2, "c.com": 3 } }),
			]);
			const referrers = await backend.getReferrers({ dateFrom: "2026-04-01", dateTo: "2026-04-07", limit: 2 }, storage);

			expect(referrers).toHaveLength(2);
		});
	});

	describe("getCampaigns", () => {
		it("returns empty arrays for no data", async () => {
			const storage = makeStorage([]);
			const report = await backend.getCampaigns({ dateFrom: "2026-04-01", dateTo: "2026-04-07" }, storage);

			expect(report.sources).toEqual([]);
			expect(report.mediums).toEqual([]);
			expect(report.campaigns).toEqual([]);
		});

		it("sorts sources by count descending", async () => {
			const storage = makeStorage([
				makeDailyStats({ utmSources: { twitter: 10, newsletter: 30 } }),
			]);
			const report = await backend.getCampaigns({ dateFrom: "2026-04-01", dateTo: "2026-04-07" }, storage);

			expect(report.sources[0]).toEqual({ name: "newsletter", count: 30 });
			expect(report.sources[1]).toEqual({ name: "twitter", count: 10 });
		});

		it("filters out empty-string UTM keys", async () => {
			const storage = makeStorage([
				makeDailyStats({ utmSources: { "": 5, twitter: 10 } }),
			]);
			const report = await backend.getCampaigns({ dateFrom: "2026-04-01", dateTo: "2026-04-07" }, storage);

			expect(report.sources).toHaveLength(1);
			expect(report.sources[0].name).toBe("twitter");
		});

		it("includes mediums and campaigns", async () => {
			const storage = makeStorage([
				makeDailyStats({
					utmSources: { twitter: 5 },
					utmMediums: { social: 3, email: 7 },
					utmCampaigns: { launch: 2 },
				}),
			]);
			const report = await backend.getCampaigns({ dateFrom: "2026-04-01", dateTo: "2026-04-07" }, storage);

			expect(report.mediums[0]).toEqual({ name: "email", count: 7 });
			expect(report.mediums[1]).toEqual({ name: "social", count: 3 });
			expect(report.campaigns[0]).toEqual({ name: "launch", count: 2 });
		});
	});

	describe("getCampaignIntelligence", () => {
		it("returns empty for no data", async () => {
			const storage = makeStorage([]);
			const result = await backend.getCampaignIntelligence({ dateFrom: "2026-04-01", dateTo: "2026-04-07", dimension: "source" }, storage);

			expect(result).toEqual([]);
		});

		it("returns source-level metrics sorted by views", async () => {
			const storage = makeStorage([
				makeDailyStats({
					views: 100,
					visitors: ["a", "b"],
					reads: 40,
					engagedViews: 20,
					recircs: 5,
					utmSources: { twitter: 60, newsletter: 40 },
				}),
			]);
			const result = await backend.getCampaignIntelligence({ dateFrom: "2026-04-01", dateTo: "2026-04-07", dimension: "source" }, storage);

			expect(result.length).toBe(2);
			expect(result[0].name).toBe("twitter");
			expect(result[0].views).toBe(60);
			expect(result[1].name).toBe("newsletter");
			expect(result[1].views).toBe(40);
		});

		it("computes proportional engagement metrics", async () => {
			const storage = makeStorage([
				makeDailyStats({
					views: 100,
					visitors: ["a"],
					reads: 50,
					engagedViews: 30,
					utmSources: { twitter: 100 },
				}),
			]);
			const result = await backend.getCampaignIntelligence({ dateFrom: "2026-04-01", dateTo: "2026-04-07", dimension: "source" }, storage);

			expect(result[0].reads).toBe(50);
			expect(result[0].readRate).toBe(50);
			expect(result[0].engagedViews).toBe(30);
		});
	});

	describe("getCustomEvents", () => {
		it("returns empty for no custom events", async () => {
			const storage = makeStorage([], []);
			const result = await backend.getCustomEvents({ dateFrom: "2026-04-01", dateTo: "2026-04-07", limit: 10 }, storage);
			expect(result.events).toEqual([]);
			expect(result.trends).toEqual({});
		});

		it("returns events sorted by count descending", async () => {
			const events = [
				{ name: "click", pathname: "/p", props: {}, visitorId: "v1", createdAt: "2026-04-01T12:00:00.000Z" },
				{ name: "click", pathname: "/p", props: {}, visitorId: "v2", createdAt: "2026-04-01T13:00:00.000Z" },
				{ name: "signup", pathname: "/p", props: {}, visitorId: "v1", createdAt: "2026-04-01T14:00:00.000Z" },
			];
			const storage = makeStorage([], events);
			const result = await backend.getCustomEvents({ dateFrom: "2026-04-01", dateTo: "2026-04-07", limit: 10 }, storage);
			expect(result.events[0]).toEqual({ name: "click", count: 2 });
			expect(result.events[1]).toEqual({ name: "signup", count: 1 });
		});

		it("respects limit", async () => {
			const events = [
				{ name: "a", pathname: "/p", props: {}, visitorId: "v1", createdAt: "2026-04-01T12:00:00.000Z" },
				{ name: "b", pathname: "/p", props: {}, visitorId: "v1", createdAt: "2026-04-01T13:00:00.000Z" },
				{ name: "c", pathname: "/p", props: {}, visitorId: "v1", createdAt: "2026-04-01T14:00:00.000Z" },
			];
			const storage = makeStorage([], events);
			const result = await backend.getCustomEvents({ dateFrom: "2026-04-01", dateTo: "2026-04-07", limit: 2 }, storage);
			expect(result.events).toHaveLength(2);
		});

		it("returns trends for top events", async () => {
			const events = [
				{ name: "click", pathname: "/p", props: {}, visitorId: "v1", createdAt: "2026-04-01T10:00:00.000Z" },
				{ name: "click", pathname: "/p", props: {}, visitorId: "v1", createdAt: "2026-04-02T10:00:00.000Z" },
			];
			const storage = makeStorage([], events);
			const result = await backend.getCustomEvents({ dateFrom: "2026-04-01", dateTo: "2026-04-07", limit: 10 }, storage);
			expect(result.trends["click"]).toBeDefined();
			expect(result.trends["click"]).toHaveLength(2);
		});
	});

	describe("getDetectedForms", () => {
		it("returns empty for no data", async () => {
			const storage = makeStorage([], []);
			const result = await backend.getDetectedForms({ dateFrom: "2026-04-01", dateTo: "2026-04-07", limit: 50 }, storage);
			expect(result).toEqual([]);
		});

		it("detects form_submit events with props.form", async () => {
			const events = [
				{ name: "form_submit", pathname: "/contact", props: { form: "newsletter" }, visitorId: "v1", createdAt: "2026-04-01T12:00:00.000Z" },
				{ name: "form_submit", pathname: "/signup", props: { form: "signup" }, visitorId: "v2", createdAt: "2026-04-01T13:00:00.000Z" },
			];
			const storage = makeStorage([], events);
			const result = await backend.getDetectedForms({ dateFrom: "2026-04-01", dateTo: "2026-04-07", limit: 50 }, storage);
			expect(result).toContain("newsletter");
			expect(result).toContain("signup");
		});

		it("detects *_submit events with props.source", async () => {
			const events = [
				{ name: "newsletter_submit", pathname: "/page", props: { source: "sidebar" }, visitorId: "v1", createdAt: "2026-04-01T12:00:00.000Z" },
			];
			const storage = makeStorage([], events);
			const result = await backend.getDetectedForms({ dateFrom: "2026-04-01", dateTo: "2026-04-07", limit: 50 }, storage);
			expect(result).toEqual(["sidebar"]);
		});

		it("falls back to pathname when form/source props missing", async () => {
			const events = [
				{ name: "form_submit", pathname: "/contact", props: {}, visitorId: "v1", createdAt: "2026-04-01T12:00:00.000Z" },
			];
			const storage = makeStorage([], events);
			const result = await backend.getDetectedForms({ dateFrom: "2026-04-01", dateTo: "2026-04-07", limit: 50 }, storage);
			expect(result).toEqual(["/contact"]);
		});

		it("ignores non-submit events", async () => {
			const events = [
				{ name: "click", pathname: "/page", props: { form: "test" }, visitorId: "v1", createdAt: "2026-04-01T12:00:00.000Z" },
			];
			const storage = makeStorage([], events);
			const result = await backend.getDetectedForms({ dateFrom: "2026-04-01", dateTo: "2026-04-07", limit: 50 }, storage);
			expect(result).toEqual([]);
		});

		it("deduplicates form names", async () => {
			const events = [
				{ name: "form_submit", pathname: "/p", props: { form: "newsletter" }, visitorId: "v1", createdAt: "2026-04-01T12:00:00.000Z" },
				{ name: "form_submit", pathname: "/p", props: { form: "newsletter" }, visitorId: "v2", createdAt: "2026-04-01T13:00:00.000Z" },
			];
			const storage = makeStorage([], events);
			const result = await backend.getDetectedForms({ dateFrom: "2026-04-01", dateTo: "2026-04-07", limit: 50 }, storage);
			expect(result).toEqual(["newsletter"]);
		});
	});
});

// ─── Reporting service ─────────────────────────────────────────────────────

describe("reporting service", () => {
	it("getStatsReport delegates to backend", async () => {
		const mockBackend = { getStats: vi.fn().mockResolvedValue({ views: 42 }), getTopPages: vi.fn(), getReferrers: vi.fn(), getCampaigns: vi.fn(), getCampaignIntelligence: vi.fn(), getCustomEvents: vi.fn(), getDetectedForms: vi.fn() };
		const storage = makeStorage([]);
		const result = await getStatsReport(mockBackend, { dateFrom: "2026-04-01", dateTo: "2026-04-07" }, storage);

		expect(mockBackend.getStats).toHaveBeenCalled();
		expect(result).toEqual({ views: 42 });
	});

	it("getTopPagesReport delegates to backend", async () => {
		const mockBackend = { getStats: vi.fn(), getTopPages: vi.fn().mockResolvedValue([]), getReferrers: vi.fn(), getCampaigns: vi.fn(), getCampaignIntelligence: vi.fn(), getCustomEvents: vi.fn(), getDetectedForms: vi.fn() };
		const storage = makeStorage([]);
		const result = await getTopPagesReport(mockBackend, { dateFrom: "2026-04-01", dateTo: "2026-04-07", limit: 10 }, storage);

		expect(mockBackend.getTopPages).toHaveBeenCalled();
		expect(result).toEqual([]);
	});

	it("getReferrersReport delegates to backend", async () => {
		const mockBackend = { getStats: vi.fn(), getTopPages: vi.fn(), getReferrers: vi.fn().mockResolvedValue([]), getCampaigns: vi.fn(), getCampaignIntelligence: vi.fn(), getCustomEvents: vi.fn(), getDetectedForms: vi.fn() };
		const storage = makeStorage([]);
		const result = await getReferrersReport(mockBackend, { dateFrom: "2026-04-01", dateTo: "2026-04-07", limit: 20 }, storage);

		expect(mockBackend.getReferrers).toHaveBeenCalled();
		expect(result).toEqual([]);
	});

	it("getCampaignsReport delegates to backend", async () => {
		const mockBackend = { getStats: vi.fn(), getTopPages: vi.fn(), getReferrers: vi.fn(), getCampaigns: vi.fn().mockResolvedValue({ sources: [], mediums: [], campaigns: [] }), getCampaignIntelligence: vi.fn(), getCustomEvents: vi.fn(), getDetectedForms: vi.fn() };
		const storage = makeStorage([]);
		const result = await getCampaignsReport(mockBackend, { dateFrom: "2026-04-01", dateTo: "2026-04-07" }, storage);

		expect(mockBackend.getCampaigns).toHaveBeenCalled();
		expect(result).toEqual({ sources: [], mediums: [], campaigns: [] });
	});

	it("getCampaignIntelligenceReport delegates to backend", async () => {
		const mockBackend = { getStats: vi.fn(), getTopPages: vi.fn(), getReferrers: vi.fn(), getCampaigns: vi.fn(), getCampaignIntelligence: vi.fn().mockResolvedValue([]), getCustomEvents: vi.fn(), getDetectedForms: vi.fn() };
		const storage = makeStorage([]);
		const result = await getCampaignIntelligenceReport(mockBackend, { dateFrom: "2026-04-01", dateTo: "2026-04-07", dimension: "source" }, storage);

		expect(mockBackend.getCampaignIntelligence).toHaveBeenCalled();
		expect(result).toEqual([]);
	});

	it("getCustomEventsReport delegates to backend", async () => {
		const mockBackend = { getStats: vi.fn(), getTopPages: vi.fn(), getReferrers: vi.fn(), getCampaigns: vi.fn(), getCampaignIntelligence: vi.fn(), getCustomEvents: vi.fn().mockResolvedValue({ events: [], trends: {} }), getDetectedForms: vi.fn() };
		const storage = makeStorage([]);
		const result = await getCustomEventsReport(mockBackend, { dateFrom: "2026-04-01", dateTo: "2026-04-07", limit: 10 }, storage);

		expect(mockBackend.getCustomEvents).toHaveBeenCalled();
		expect(result).toEqual({ events: [], trends: {} });
	});

	it("getDetectedFormsReport delegates to backend", async () => {
		const mockBackend = { getStats: vi.fn(), getTopPages: vi.fn(), getReferrers: vi.fn(), getCampaigns: vi.fn(), getCampaignIntelligence: vi.fn(), getCustomEvents: vi.fn(), getDetectedForms: vi.fn().mockResolvedValue(["newsletter", "contact"]) };
		const storage = makeStorage([]);
		const result = await getDetectedFormsReport(mockBackend, { dateFrom: "2026-04-01", dateTo: "2026-04-07", limit: 50 }, storage);

		expect(mockBackend.getDetectedForms).toHaveBeenCalled();
		expect(result).toEqual(["newsletter", "contact"]);
	});
});
