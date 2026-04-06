import { describe, it, expect, beforeEach } from "vitest";
import { CloudflareReportingBackend } from "../backends/cloudflare/reporting.js";
import { ensureD1Schema, resetD1SchemaFlag } from "../backends/cloudflare/d1.js";
import { createMockD1 } from "./helpers/mock-d1.js";
import type { ReportingStorage } from "../reporting/types.js";

const dummyStorage = {} as ReportingStorage;

/**
 * Helper to populate D1 tables with test data via raw inserts.
 */
async function seedData(db: ReturnType<typeof createMockD1>, data: {
	pages?: Array<{
		date: string; pathname: string; template?: string; collection?: string;
		views?: number; reads?: number; time_total?: number; time_count?: number;
		scroll25?: number; scroll50?: number; scroll75?: number; scroll100?: number;
		engaged_views?: number; recircs?: number;
	}>;
	visitors?: Array<{ date: string; pathname: string; visitor_id: string }>;
	referrers?: Array<{ date: string; referrer: string; count: number }>;
	countries?: Array<{ date: string; country: string; count: number }>;
	campaigns?: Array<{ date: string; dimension: string; name: string; count: number }>;
	customEvents?: Array<{ date: string; event_name: string; count: number }>;
	formSubmissions?: Array<{ date: string; form_name: string; count: number }>;
	eventProps?: Array<{ date: string; event_name: string; prop_key: string; prop_value: string; count: number }>;
	eventVisitors?: Array<{ date: string; event_name: string; visitor_id: string }>;
	formVisitors?: Array<{ date: string; form_name: string; visitor_id: string }>;
}) {
	for (const p of data.pages ?? []) {
		await db.prepare(
			`INSERT INTO daily_pages (date, pathname, template, collection, views, reads, time_total, time_count, scroll25, scroll50, scroll75, scroll100, engaged_views, recircs)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).bind(
			p.date, p.pathname, p.template ?? "", p.collection ?? "",
			p.views ?? 0, p.reads ?? 0, p.time_total ?? 0, p.time_count ?? 0,
			p.scroll25 ?? 0, p.scroll50 ?? 0, p.scroll75 ?? 0, p.scroll100 ?? 0,
			p.engaged_views ?? 0, p.recircs ?? 0,
		).run();
	}
	for (const v of data.visitors ?? []) {
		await db.prepare(
			`INSERT OR IGNORE INTO daily_visitors (date, pathname, visitor_id) VALUES (?, ?, ?)`,
		).bind(v.date, v.pathname, v.visitor_id).run();
	}
	for (const r of data.referrers ?? []) {
		await db.prepare(
			`INSERT INTO daily_referrers (date, referrer, count) VALUES (?, ?, ?)`,
		).bind(r.date, r.referrer, r.count).run();
	}
	for (const c of data.countries ?? []) {
		await db.prepare(
			`INSERT INTO daily_countries (date, country, count) VALUES (?, ?, ?)`,
		).bind(c.date, c.country, c.count).run();
	}
	for (const c of data.campaigns ?? []) {
		await db.prepare(
			`INSERT INTO daily_campaigns (date, dimension, name, count) VALUES (?, ?, ?, ?)`,
		).bind(c.date, c.dimension, c.name, c.count).run();
	}
	for (const ce of data.customEvents ?? []) {
		await db.prepare(
			`INSERT INTO daily_custom_events (date, event_name, count) VALUES (?, ?, ?)`,
		).bind(ce.date, ce.event_name, ce.count).run();
	}
	for (const fs of data.formSubmissions ?? []) {
		await db.prepare(
			`INSERT INTO daily_form_submissions (date, form_name, count) VALUES (?, ?, ?)`,
		).bind(fs.date, fs.form_name, fs.count).run();
	}
	for (const ep of data.eventProps ?? []) {
		await db.prepare(
			`INSERT INTO daily_custom_event_props (date, event_name, prop_key, prop_value, count) VALUES (?, ?, ?, ?, ?)`,
		).bind(ep.date, ep.event_name, ep.prop_key, ep.prop_value, ep.count).run();
	}
	for (const ev of data.eventVisitors ?? []) {
		await db.prepare(
			`INSERT OR IGNORE INTO daily_custom_event_visitors (date, event_name, visitor_id) VALUES (?, ?, ?)`,
		).bind(ev.date, ev.event_name, ev.visitor_id).run();
	}
	for (const fv of data.formVisitors ?? []) {
		await db.prepare(
			`INSERT OR IGNORE INTO daily_form_visitors (date, form_name, visitor_id) VALUES (?, ?, ?)`,
		).bind(fv.date, fv.form_name, fv.visitor_id).run();
	}
}

describe("CloudflareReportingBackend", () => {
	let db: ReturnType<typeof createMockD1>;
	let backend: CloudflareReportingBackend;

	beforeEach(async () => {
		resetD1SchemaFlag();
		db = createMockD1();
		await ensureD1Schema(db);
		backend = new CloudflareReportingBackend(db);
	});

	// -----------------------------------------------------------------------
	// getStats
	// -----------------------------------------------------------------------

	describe("getStats", () => {
		it("returns zeros for empty database", async () => {
			const report = await backend.getStats(
				{ dateFrom: "2026-04-01", dateTo: "2026-04-07" },
				dummyStorage,
			);

			expect(report.views).toBe(0);
			expect(report.visitors).toBe(0);
			expect(report.reads).toBe(0);
			expect(report.readRate).toBe(0);
			expect(report.avgTimeSeconds).toBe(0);
			expect(report.engagedViews).toBe(0);
			expect(report.recircs).toBe(0);
		});

		it("aggregates views and engagement from daily_pages", async () => {
			await seedData(db, {
				pages: [
					{ date: "2026-04-01", pathname: "/a", views: 50, reads: 10, engaged_views: 20, recircs: 5, time_total: 300, time_count: 10 },
					{ date: "2026-04-02", pathname: "/b", views: 30, reads: 5, engaged_views: 10, recircs: 3, time_total: 200, time_count: 5 },
				],
				visitors: [
					{ date: "2026-04-01", pathname: "/a", visitor_id: "v1" },
					{ date: "2026-04-01", pathname: "/a", visitor_id: "v2" },
					{ date: "2026-04-02", pathname: "/b", visitor_id: "v1" },
					{ date: "2026-04-02", pathname: "/b", visitor_id: "v3" },
				],
			});

			const report = await backend.getStats(
				{ dateFrom: "2026-04-01", dateTo: "2026-04-07" },
				dummyStorage,
			);

			expect(report.views).toBe(80);
			expect(report.visitors).toBe(3); // v1, v2, v3 distinct
			expect(report.reads).toBe(15);
			expect(report.readRate).toBe(19); // 15/80 = 18.75 → 19
			expect(report.avgTimeSeconds).toBe(33); // 500/15
			expect(report.engagedViews).toBe(30);
			expect(report.engagedRate).toBe(38); // 30/80
			expect(report.recircs).toBe(8);
			expect(report.recircRate).toBe(10); // 8/80
		});

		it("returns scroll depth aggregated", async () => {
			await seedData(db, {
				pages: [
					{ date: "2026-04-01", pathname: "/a", views: 100, scroll25: 80, scroll50: 60, scroll75: 40, scroll100: 20 },
				],
			});

			const report = await backend.getStats(
				{ dateFrom: "2026-04-01", dateTo: "2026-04-01" },
				dummyStorage,
			);

			expect(report.scrollDepth).toEqual({ "25": 80, "50": 60, "75": 40, "100": 20 });
		});

		it("returns referrers distribution", async () => {
			await seedData(db, {
				pages: [{ date: "2026-04-01", pathname: "/a", views: 10 }],
				referrers: [
					{ date: "2026-04-01", referrer: "google.com", count: 5 },
					{ date: "2026-04-01", referrer: "twitter.com", count: 3 },
				],
			});

			const report = await backend.getStats(
				{ dateFrom: "2026-04-01", dateTo: "2026-04-01" },
				dummyStorage,
			);

			expect(report.referrers["google.com"]).toBe(5);
			expect(report.referrers["twitter.com"]).toBe(3);
		});

		it("returns countries distribution", async () => {
			await seedData(db, {
				pages: [{ date: "2026-04-01", pathname: "/a", views: 10 }],
				countries: [
					{ date: "2026-04-01", country: "AR", count: 4 },
					{ date: "2026-04-01", country: "US", count: 6 },
				],
			});

			const report = await backend.getStats(
				{ dateFrom: "2026-04-01", dateTo: "2026-04-01" },
				dummyStorage,
			);

			expect(report.countries["AR"]).toBe(4);
			expect(report.countries["US"]).toBe(6);
		});

		it("returns UTM distributions", async () => {
			await seedData(db, {
				pages: [{ date: "2026-04-01", pathname: "/a", views: 10 }],
				campaigns: [
					{ date: "2026-04-01", dimension: "source", name: "twitter", count: 5 },
					{ date: "2026-04-01", dimension: "medium", name: "social", count: 3 },
					{ date: "2026-04-01", dimension: "campaign", name: "launch", count: 2 },
				],
			});

			const report = await backend.getStats(
				{ dateFrom: "2026-04-01", dateTo: "2026-04-01" },
				dummyStorage,
			);

			expect(report.utmSources["twitter"]).toBe(5);
			expect(report.utmMediums["social"]).toBe(3);
			expect(report.utmCampaigns["launch"]).toBe(2);
		});

		it("returns daily timeseries", async () => {
			await seedData(db, {
				pages: [
					{ date: "2026-04-01", pathname: "/a", views: 10, reads: 2, engaged_views: 5 },
					{ date: "2026-04-02", pathname: "/a", views: 20, reads: 8, engaged_views: 10 },
				],
				visitors: [
					{ date: "2026-04-01", pathname: "/a", visitor_id: "v1" },
					{ date: "2026-04-02", pathname: "/a", visitor_id: "v2" },
					{ date: "2026-04-02", pathname: "/a", visitor_id: "v3" },
				],
			});

			const report = await backend.getStats(
				{ dateFrom: "2026-04-01", dateTo: "2026-04-02" },
				dummyStorage,
			);

			expect(report.daily["2026-04-01"]).toEqual({ views: 10, visitors: 1, reads: 2, engagedViews: 5 });
			expect(report.daily["2026-04-02"]).toEqual({ views: 20, visitors: 2, reads: 8, engagedViews: 10 });
		});

		it("filters by pathname when provided", async () => {
			await seedData(db, {
				pages: [
					{ date: "2026-04-01", pathname: "/a", views: 50 },
					{ date: "2026-04-01", pathname: "/b", views: 30 },
				],
				visitors: [
					{ date: "2026-04-01", pathname: "/a", visitor_id: "v1" },
					{ date: "2026-04-01", pathname: "/b", visitor_id: "v2" },
				],
			});

			const report = await backend.getStats(
				{ dateFrom: "2026-04-01", dateTo: "2026-04-01", pathname: "/a" },
				dummyStorage,
			);

			expect(report.views).toBe(50);
			expect(report.visitors).toBe(1);
		});
	});

	// -----------------------------------------------------------------------
	// getTopPages
	// -----------------------------------------------------------------------

	describe("getTopPages", () => {
		it("returns empty array for no data", async () => {
			const pages = await backend.getTopPages(
				{ dateFrom: "2026-04-01", dateTo: "2026-04-07", limit: 10 },
				dummyStorage,
			);
			expect(pages).toEqual([]);
		});

		it("returns pages ranked by views", async () => {
			await seedData(db, {
				pages: [
					{ date: "2026-04-01", pathname: "/a", template: "post", collection: "blog", views: 100, reads: 20, engaged_views: 30, recircs: 5 },
					{ date: "2026-04-01", pathname: "/b", template: "page", collection: "", views: 50, reads: 10, engaged_views: 15, recircs: 2 },
				],
				visitors: [
					{ date: "2026-04-01", pathname: "/a", visitor_id: "v1" },
					{ date: "2026-04-01", pathname: "/a", visitor_id: "v2" },
					{ date: "2026-04-01", pathname: "/b", visitor_id: "v1" },
				],
			});

			const pages = await backend.getTopPages(
				{ dateFrom: "2026-04-01", dateTo: "2026-04-07", limit: 10 },
				dummyStorage,
			);

			expect(pages.length).toBe(2);
			expect(pages[0].pathname).toBe("/a");
			expect(pages[0].views).toBe(100);
			expect(pages[0].visitors).toBe(2);
			expect(pages[0].template).toBe("post");
			expect(pages[0].readRate).toBe(20); // 20/100
			expect(pages[0].engagedRate).toBe(30); // 30/100
			expect(pages[1].pathname).toBe("/b");
			expect(pages[1].views).toBe(50);
		});

		it("respects limit", async () => {
			await seedData(db, {
				pages: [
					{ date: "2026-04-01", pathname: "/a", views: 100 },
					{ date: "2026-04-01", pathname: "/b", views: 50 },
					{ date: "2026-04-01", pathname: "/c", views: 30 },
				],
			});

			const pages = await backend.getTopPages(
				{ dateFrom: "2026-04-01", dateTo: "2026-04-01", limit: 2 },
				dummyStorage,
			);

			expect(pages.length).toBe(2);
			expect(pages[0].pathname).toBe("/a");
			expect(pages[1].pathname).toBe("/b");
		});

		it("aggregates across multiple dates", async () => {
			await seedData(db, {
				pages: [
					{ date: "2026-04-01", pathname: "/a", views: 50, reads: 10 },
					{ date: "2026-04-02", pathname: "/a", views: 30, reads: 5 },
				],
			});

			const pages = await backend.getTopPages(
				{ dateFrom: "2026-04-01", dateTo: "2026-04-02", limit: 10 },
				dummyStorage,
			);

			expect(pages.length).toBe(1);
			expect(pages[0].views).toBe(80);
			expect(pages[0].reads).toBe(15);
		});
	});

	// -----------------------------------------------------------------------
	// getReferrers
	// -----------------------------------------------------------------------

	describe("getReferrers", () => {
		it("returns empty array for no data", async () => {
			const referrers = await backend.getReferrers(
				{ dateFrom: "2026-04-01", dateTo: "2026-04-07", limit: 10 },
				dummyStorage,
			);
			expect(referrers).toEqual([]);
		});

		it("returns referrers ranked by count", async () => {
			await seedData(db, {
				referrers: [
					{ date: "2026-04-01", referrer: "google.com", count: 10 },
					{ date: "2026-04-01", referrer: "twitter.com", count: 5 },
					{ date: "2026-04-02", referrer: "google.com", count: 8 },
				],
			});

			const referrers = await backend.getReferrers(
				{ dateFrom: "2026-04-01", dateTo: "2026-04-02", limit: 10 },
				dummyStorage,
			);

			expect(referrers.length).toBe(2);
			expect(referrers[0].domain).toBe("google.com");
			expect(referrers[0].count).toBe(18);
			expect(referrers[1].domain).toBe("twitter.com");
			expect(referrers[1].count).toBe(5);
		});

		it("respects limit", async () => {
			await seedData(db, {
				referrers: [
					{ date: "2026-04-01", referrer: "a.com", count: 10 },
					{ date: "2026-04-01", referrer: "b.com", count: 5 },
					{ date: "2026-04-01", referrer: "c.com", count: 3 },
				],
			});

			const referrers = await backend.getReferrers(
				{ dateFrom: "2026-04-01", dateTo: "2026-04-01", limit: 2 },
				dummyStorage,
			);

			expect(referrers.length).toBe(2);
		});
	});

	// -----------------------------------------------------------------------
	// getCampaigns
	// -----------------------------------------------------------------------

	describe("getCampaigns", () => {
		it("returns empty report for no data", async () => {
			const report = await backend.getCampaigns(
				{ dateFrom: "2026-04-01", dateTo: "2026-04-07" },
				dummyStorage,
			);

			expect(report.sources).toEqual([]);
			expect(report.mediums).toEqual([]);
			expect(report.campaigns).toEqual([]);
		});

		it("returns campaign dimensions grouped correctly", async () => {
			await seedData(db, {
				campaigns: [
					{ date: "2026-04-01", dimension: "source", name: "twitter", count: 10 },
					{ date: "2026-04-01", dimension: "source", name: "facebook", count: 5 },
					{ date: "2026-04-01", dimension: "medium", name: "social", count: 12 },
					{ date: "2026-04-01", dimension: "medium", name: "email", count: 3 },
					{ date: "2026-04-01", dimension: "campaign", name: "launch", count: 8 },
				],
			});

			const report = await backend.getCampaigns(
				{ dateFrom: "2026-04-01", dateTo: "2026-04-01" },
				dummyStorage,
			);

			expect(report.sources.length).toBe(2);
			expect(report.sources[0]).toEqual({ name: "twitter", count: 10 });
			expect(report.sources[1]).toEqual({ name: "facebook", count: 5 });

			expect(report.mediums.length).toBe(2);
			expect(report.mediums[0]).toEqual({ name: "social", count: 12 });

			expect(report.campaigns.length).toBe(1);
			expect(report.campaigns[0]).toEqual({ name: "launch", count: 8 });
		});

		it("aggregates across dates", async () => {
			await seedData(db, {
				campaigns: [
					{ date: "2026-04-01", dimension: "source", name: "twitter", count: 10 },
					{ date: "2026-04-02", dimension: "source", name: "twitter", count: 7 },
				],
			});

			const report = await backend.getCampaigns(
				{ dateFrom: "2026-04-01", dateTo: "2026-04-02" },
				dummyStorage,
			);

			expect(report.sources[0].count).toBe(17);
		});
	});

	// -----------------------------------------------------------------------
	// getCampaignIntelligence
	// -----------------------------------------------------------------------

	describe("getCampaignIntelligence", () => {
		it("returns empty array for no data", async () => {
			const result = await backend.getCampaignIntelligence(
				{ dateFrom: "2026-04-01", dateTo: "2026-04-07", dimension: "source" },
				dummyStorage,
			);
			expect(result).toEqual([]);
		});

		it("returns campaign intelligence with proportional metrics", async () => {
			await seedData(db, {
				pages: [
					{ date: "2026-04-01", pathname: "/a", views: 100, reads: 40, engaged_views: 50, recircs: 10, time_total: 3000, time_count: 100 },
				],
				visitors: [
					{ date: "2026-04-01", pathname: "/a", visitor_id: "v1" },
					{ date: "2026-04-01", pathname: "/a", visitor_id: "v2" },
					{ date: "2026-04-01", pathname: "/a", visitor_id: "v3" },
					{ date: "2026-04-01", pathname: "/a", visitor_id: "v4" },
				],
				campaigns: [
					{ date: "2026-04-01", dimension: "source", name: "twitter", count: 60 },
					{ date: "2026-04-01", dimension: "source", name: "facebook", count: 40 },
				],
			});

			const result = await backend.getCampaignIntelligence(
				{ dateFrom: "2026-04-01", dateTo: "2026-04-01", dimension: "source" },
				dummyStorage,
			);

			expect(result.length).toBe(2);

			// twitter: 60/100 = 60% share
			expect(result[0].name).toBe("twitter");
			expect(result[0].views).toBe(60);
			expect(result[0].reads).toBe(24); // 40 * 0.6
			expect(result[0].engagedViews).toBe(30); // 50 * 0.6
			expect(result[0].recircs).toBe(6); // 10 * 0.6
			expect(result[0].readRate).toBe(40); // 24/60
			expect(result[0].engagedRate).toBe(50); // 30/60

			// facebook: 40/100 = 40% share
			expect(result[1].name).toBe("facebook");
			expect(result[1].views).toBe(40);
			expect(result[1].reads).toBe(16); // 40 * 0.4
		});
	});

	// -----------------------------------------------------------------------
	// getCustomEvents
	// -----------------------------------------------------------------------

	describe("getCustomEvents", () => {
		it("returns empty for no data", async () => {
			const result = await backend.getCustomEvents({ dateFrom: "2026-04-01", dateTo: "2026-04-07", limit: 10 }, dummyStorage);
			expect(result.events).toEqual([]);
			expect(result.trends).toEqual({});
		});

		it("returns events sorted by count descending", async () => {
			await seedData(db, {
				customEvents: [
					{ date: "2026-04-01", event_name: "signup", count: 5 },
					{ date: "2026-04-01", event_name: "click", count: 20 },
					{ date: "2026-04-01", event_name: "purchase", count: 3 },
				],
			});
			const result = await backend.getCustomEvents({ dateFrom: "2026-04-01", dateTo: "2026-04-07", limit: 10 }, dummyStorage);
			expect(result.events).toEqual([
				{ name: "click", count: 20 },
				{ name: "signup", count: 5 },
				{ name: "purchase", count: 3 },
			]);
		});

		it("respects limit", async () => {
			await seedData(db, {
				customEvents: [
					{ date: "2026-04-01", event_name: "a", count: 10 },
					{ date: "2026-04-01", event_name: "b", count: 5 },
					{ date: "2026-04-01", event_name: "c", count: 1 },
				],
			});
			const result = await backend.getCustomEvents({ dateFrom: "2026-04-01", dateTo: "2026-04-07", limit: 2 }, dummyStorage);
			expect(result.events).toHaveLength(2);
			expect(result.events[0].name).toBe("a");
			expect(result.events[1].name).toBe("b");
		});

		it("aggregates across multiple dates", async () => {
			await seedData(db, {
				customEvents: [
					{ date: "2026-04-01", event_name: "signup", count: 3 },
					{ date: "2026-04-02", event_name: "signup", count: 7 },
					{ date: "2026-04-02", event_name: "click", count: 2 },
				],
			});
			const result = await backend.getCustomEvents({ dateFrom: "2026-04-01", dateTo: "2026-04-07", limit: 10 }, dummyStorage);
			expect(result.events[0]).toEqual({ name: "signup", count: 10 });
			expect(result.events[1]).toEqual({ name: "click", count: 2 });
		});

		it("returns daily trends for top events", async () => {
			await seedData(db, {
				customEvents: [
					{ date: "2026-04-01", event_name: "signup", count: 3 },
					{ date: "2026-04-02", event_name: "signup", count: 7 },
					{ date: "2026-04-01", event_name: "click", count: 5 },
				],
			});
			const result = await backend.getCustomEvents({ dateFrom: "2026-04-01", dateTo: "2026-04-07", limit: 10 }, dummyStorage);

			expect(result.trends["signup"]).toBeDefined();
			expect(result.trends["signup"]).toHaveLength(2);
			// Sorted by date
			expect(result.trends["signup"][0][1]).toBe(3); // Apr 1
			expect(result.trends["signup"][1][1]).toBe(7); // Apr 2

			expect(result.trends["click"]).toBeDefined();
			expect(result.trends["click"]).toHaveLength(1);
			expect(result.trends["click"][0][1]).toBe(5);
		});

		it("filters by date range", async () => {
			await seedData(db, {
				customEvents: [
					{ date: "2026-03-31", event_name: "signup", count: 100 },
					{ date: "2026-04-01", event_name: "signup", count: 5 },
				],
			});
			const result = await backend.getCustomEvents({ dateFrom: "2026-04-01", dateTo: "2026-04-07", limit: 10 }, dummyStorage);
			expect(result.events).toEqual([{ name: "signup", count: 5 }]);
		});
	});

	// -----------------------------------------------------------------------
	// getDetectedForms
	// -----------------------------------------------------------------------

	describe("getDetectedForms", () => {
		it("returns empty for no data", async () => {
			const result = await backend.getDetectedForms({ dateFrom: "2026-04-01", dateTo: "2026-04-07", limit: 50 }, dummyStorage);
			expect(result).toEqual([]);
		});

		it("returns form names sorted by count descending", async () => {
			await seedData(db, {
				formSubmissions: [
					{ date: "2026-04-01", form_name: "contact", count: 5 },
					{ date: "2026-04-01", form_name: "newsletter", count: 20 },
					{ date: "2026-04-01", form_name: "signup", count: 3 },
				],
			});
			const result = await backend.getDetectedForms({ dateFrom: "2026-04-01", dateTo: "2026-04-07", limit: 50 }, dummyStorage);
			expect(result).toEqual(["newsletter", "contact", "signup"]);
		});

		it("respects limit", async () => {
			await seedData(db, {
				formSubmissions: [
					{ date: "2026-04-01", form_name: "a", count: 10 },
					{ date: "2026-04-01", form_name: "b", count: 5 },
					{ date: "2026-04-01", form_name: "c", count: 1 },
				],
			});
			const result = await backend.getDetectedForms({ dateFrom: "2026-04-01", dateTo: "2026-04-07", limit: 2 }, dummyStorage);
			expect(result).toHaveLength(2);
		});

		it("aggregates across multiple dates", async () => {
			await seedData(db, {
				formSubmissions: [
					{ date: "2026-04-01", form_name: "contact", count: 3 },
					{ date: "2026-04-02", form_name: "contact", count: 7 },
					{ date: "2026-04-01", form_name: "newsletter", count: 2 },
				],
			});
			const result = await backend.getDetectedForms({ dateFrom: "2026-04-01", dateTo: "2026-04-07", limit: 50 }, dummyStorage);
			expect(result).toEqual(["contact", "newsletter"]);
		});

		it("filters by date range", async () => {
			await seedData(db, {
				formSubmissions: [
					{ date: "2026-03-31", form_name: "old_form", count: 100 },
					{ date: "2026-04-01", form_name: "new_form", count: 1 },
				],
			});
			const result = await backend.getDetectedForms({ dateFrom: "2026-04-01", dateTo: "2026-04-07", limit: 50 }, dummyStorage);
			expect(result).toEqual(["new_form"]);
		});
	});

	// -----------------------------------------------------------------------
	// getPropertyBreakdowns
	// -----------------------------------------------------------------------

	describe("getPropertyBreakdowns", () => {
		it("returns empty for no data", async () => {
			const result = await backend.getPropertyBreakdowns(
				{ dateFrom: "2026-04-01", dateTo: "2026-04-07", eventName: "signup" },
				dummyStorage,
			);
			expect(result).toEqual({});
		});

		it("returns prop key/value counts for a specific event", async () => {
			await seedData(db, {
				eventProps: [
					{ date: "2026-04-01", event_name: "signup", prop_key: "plan", prop_value: "pro", count: 5 },
					{ date: "2026-04-01", event_name: "signup", prop_key: "plan", prop_value: "free", count: 3 },
					{ date: "2026-04-01", event_name: "signup", prop_key: "source", prop_value: "header", count: 2 },
				],
			});
			const result = await backend.getPropertyBreakdowns(
				{ dateFrom: "2026-04-01", dateTo: "2026-04-07", eventName: "signup" },
				dummyStorage,
			);
			expect(result.plan).toEqual({ pro: 5, free: 3 });
			expect(result.source).toEqual({ header: 2 });
		});

		it("filters by event name", async () => {
			await seedData(db, {
				eventProps: [
					{ date: "2026-04-01", event_name: "signup", prop_key: "plan", prop_value: "pro", count: 5 },
					{ date: "2026-04-01", event_name: "click", prop_key: "target", prop_value: "button", count: 10 },
				],
			});
			const result = await backend.getPropertyBreakdowns(
				{ dateFrom: "2026-04-01", dateTo: "2026-04-07", eventName: "signup" },
				dummyStorage,
			);
			expect(Object.keys(result)).toEqual(["plan"]);
		});

		it("aggregates across dates", async () => {
			await seedData(db, {
				eventProps: [
					{ date: "2026-04-01", event_name: "signup", prop_key: "plan", prop_value: "pro", count: 3 },
					{ date: "2026-04-02", event_name: "signup", prop_key: "plan", prop_value: "pro", count: 7 },
				],
			});
			const result = await backend.getPropertyBreakdowns(
				{ dateFrom: "2026-04-01", dateTo: "2026-04-07", eventName: "signup" },
				dummyStorage,
			);
			expect(result.plan.pro).toBe(10);
		});

		it("respects maxKeys limit", async () => {
			await seedData(db, {
				eventProps: [
					{ date: "2026-04-01", event_name: "signup", prop_key: "a", prop_value: "v1", count: 10 },
					{ date: "2026-04-01", event_name: "signup", prop_key: "b", prop_value: "v1", count: 5 },
					{ date: "2026-04-01", event_name: "signup", prop_key: "c", prop_value: "v1", count: 1 },
				],
			});
			const result = await backend.getPropertyBreakdowns(
				{ dateFrom: "2026-04-01", dateTo: "2026-04-07", eventName: "signup", maxKeys: 2 },
				dummyStorage,
			);
			expect(Object.keys(result).length).toBe(2);
		});

		it("respects maxValuesPerKey limit", async () => {
			await seedData(db, {
				eventProps: [
					{ date: "2026-04-01", event_name: "signup", prop_key: "plan", prop_value: "pro", count: 10 },
					{ date: "2026-04-01", event_name: "signup", prop_key: "plan", prop_value: "free", count: 5 },
					{ date: "2026-04-01", event_name: "signup", prop_key: "plan", prop_value: "trial", count: 1 },
				],
			});
			const result = await backend.getPropertyBreakdowns(
				{ dateFrom: "2026-04-01", dateTo: "2026-04-07", eventName: "signup", maxValuesPerKey: 2 },
				dummyStorage,
			);
			expect(Object.keys(result.plan).length).toBe(2);
			expect(result.plan.pro).toBe(10);
			expect(result.plan.free).toBe(5);
		});

		it("filters by date range", async () => {
			await seedData(db, {
				eventProps: [
					{ date: "2026-03-31", event_name: "signup", prop_key: "plan", prop_value: "old", count: 100 },
					{ date: "2026-04-01", event_name: "signup", prop_key: "plan", prop_value: "new", count: 1 },
				],
			});
			const result = await backend.getPropertyBreakdowns(
				{ dateFrom: "2026-04-01", dateTo: "2026-04-07", eventName: "signup" },
				dummyStorage,
			);
			expect(result.plan).toEqual({ new: 1 });
		});
	});

	// -----------------------------------------------------------------------
	// getGoals
	// -----------------------------------------------------------------------

	describe("getGoals", () => {
		it("returns empty for no data", async () => {
			const result = await backend.getGoals(
				{ dateFrom: "2026-04-01", dateTo: "2026-04-07", totalVisitors: 100, goals: [] },
				dummyStorage,
			);
			expect(result).toEqual([]);
		});

		// Auto-detect mode
		describe("auto-detect mode (empty goals array)", () => {
			it("detects goals from priority event names", async () => {
				await seedData(db, {
					customEvents: [
						{ date: "2026-04-01", event_name: "signup_submit", count: 10 },
						{ date: "2026-04-01", event_name: "purchase", count: 5 },
						{ date: "2026-04-01", event_name: "page_click", count: 20 }, // not a goal candidate
					],
					eventVisitors: [
						{ date: "2026-04-01", event_name: "signup_submit", visitor_id: "v1" },
						{ date: "2026-04-01", event_name: "signup_submit", visitor_id: "v2" },
						{ date: "2026-04-01", event_name: "purchase", visitor_id: "v1" },
					],
				});
				const result = await backend.getGoals(
					{ dateFrom: "2026-04-01", dateTo: "2026-04-07", totalVisitors: 100, goals: [] },
					dummyStorage,
				);
				expect(result.length).toBe(2);
				expect(result[0].completions).toBe(10);
				expect(result[0].visitors).toBe(2);
				expect(result[0].conversionRate).toBe(2);
				expect(result[1].completions).toBe(5);
			});

			it("detects *_submit and *_request patterns", async () => {
				await seedData(db, {
					customEvents: [
						{ date: "2026-04-01", event_name: "newsletter_submit", count: 3 },
						{ date: "2026-04-01", event_name: "demo_request", count: 2 },
					],
					eventVisitors: [
						{ date: "2026-04-01", event_name: "newsletter_submit", visitor_id: "v1" },
						{ date: "2026-04-01", event_name: "demo_request", visitor_id: "v2" },
					],
				});
				const result = await backend.getGoals(
					{ dateFrom: "2026-04-01", dateTo: "2026-04-07", totalVisitors: 50, goals: [] },
					dummyStorage,
				);
				expect(result.length).toBe(2);
			});

			it("limits to top 5 auto-detected goals", async () => {
				await seedData(db, {
					customEvents: Array.from({ length: 8 }, (_, i) => ({
						date: "2026-04-01",
						event_name: `goal_${i}_submit`,
						count: 10 - i,
					})),
				});
				const result = await backend.getGoals(
					{ dateFrom: "2026-04-01", dateTo: "2026-04-07", totalVisitors: 100, goals: [] },
					dummyStorage,
				);
				expect(result.length).toBe(5);
			});
		});

		// Configured goals
		describe("configured goals", () => {
			it("computes page goal from daily_pages + daily_visitors", async () => {
				await seedData(db, {
					pages: [{ date: "2026-04-01", pathname: "/thank-you", views: 15 }],
					visitors: [
						{ date: "2026-04-01", pathname: "/thank-you", visitor_id: "v1" },
						{ date: "2026-04-01", pathname: "/thank-you", visitor_id: "v2" },
						{ date: "2026-04-01", pathname: "/thank-you", visitor_id: "v3" },
					],
				});
				const result = await backend.getGoals({
					dateFrom: "2026-04-01",
					dateTo: "2026-04-07",
					totalVisitors: 100,
					goals: [{ id: "g1", name: "Thank You Page", type: "page", target: "/thank-you", active: true }],
				}, dummyStorage);
				expect(result.length).toBe(1);
				expect(result[0].goal).toBe("Thank You Page");
				expect(result[0].completions).toBe(15);
				expect(result[0].visitors).toBe(3);
				expect(result[0].conversionRate).toBe(3);
			});

			it("computes event goal from daily_custom_events + daily_custom_event_visitors", async () => {
				await seedData(db, {
					customEvents: [{ date: "2026-04-01", event_name: "cta_click", count: 8 }],
					eventVisitors: [
						{ date: "2026-04-01", event_name: "cta_click", visitor_id: "v1" },
						{ date: "2026-04-01", event_name: "cta_click", visitor_id: "v2" },
					],
				});
				const result = await backend.getGoals({
					dateFrom: "2026-04-01",
					dateTo: "2026-04-07",
					totalVisitors: 50,
					goals: [{ id: "g1", name: "CTA Click", type: "event", target: "cta_click", active: true }],
				}, dummyStorage);
				expect(result.length).toBe(1);
				expect(result[0].goal).toBe("CTA Click");
				expect(result[0].completions).toBe(8);
				expect(result[0].visitors).toBe(2);
			});

			it("computes form goal from daily_form_submissions + daily_form_visitors", async () => {
				await seedData(db, {
					formSubmissions: [{ date: "2026-04-01", form_name: "newsletter", count: 12 }],
					formVisitors: [
						{ date: "2026-04-01", form_name: "newsletter", visitor_id: "v1" },
						{ date: "2026-04-01", form_name: "newsletter", visitor_id: "v2" },
						{ date: "2026-04-01", form_name: "newsletter", visitor_id: "v3" },
						{ date: "2026-04-01", form_name: "newsletter", visitor_id: "v4" },
					],
				});
				const result = await backend.getGoals({
					dateFrom: "2026-04-01",
					dateTo: "2026-04-07",
					totalVisitors: 200,
					goals: [{ id: "g1", name: "Newsletter Signup", type: "form", target: "newsletter", active: true }],
				}, dummyStorage);
				expect(result.length).toBe(1);
				expect(result[0].goal).toBe("Newsletter Signup");
				expect(result[0].completions).toBe(12);
				expect(result[0].visitors).toBe(4);
				expect(result[0].conversionRate).toBe(2);
			});

			it("filters out goals with zero completions", async () => {
				const result = await backend.getGoals({
					dateFrom: "2026-04-01",
					dateTo: "2026-04-07",
					totalVisitors: 100,
					goals: [{ id: "g1", name: "Empty Goal", type: "event", target: "nonexistent", active: true }],
				}, dummyStorage);
				expect(result).toEqual([]);
			});

			it("skips inactive goals", async () => {
				await seedData(db, {
					customEvents: [{ date: "2026-04-01", event_name: "signup", count: 10 }],
				});
				const result = await backend.getGoals({
					dateFrom: "2026-04-01",
					dateTo: "2026-04-07",
					totalVisitors: 100,
					goals: [{ id: "g1", name: "Disabled", type: "event", target: "signup", active: false }],
				}, dummyStorage);
				expect(result).toEqual([]);
			});

			it("sorts by completions descending", async () => {
				await seedData(db, {
					customEvents: [
						{ date: "2026-04-01", event_name: "small", count: 2 },
						{ date: "2026-04-01", event_name: "big", count: 20 },
					],
				});
				const result = await backend.getGoals({
					dateFrom: "2026-04-01",
					dateTo: "2026-04-07",
					totalVisitors: 100,
					goals: [
						{ id: "g1", name: "Small Goal", type: "event", target: "small", active: true },
						{ id: "g2", name: "Big Goal", type: "event", target: "big", active: true },
					],
				}, dummyStorage);
				expect(result[0].goal).toBe("Big Goal");
				expect(result[1].goal).toBe("Small Goal");
			});

			it("handles mixed goal types", async () => {
				await seedData(db, {
					pages: [{ date: "2026-04-01", pathname: "/thanks", views: 5 }],
					visitors: [{ date: "2026-04-01", pathname: "/thanks", visitor_id: "v1" }],
					customEvents: [{ date: "2026-04-01", event_name: "purchase", count: 3 }],
					eventVisitors: [{ date: "2026-04-01", event_name: "purchase", visitor_id: "v2" }],
					formSubmissions: [{ date: "2026-04-01", form_name: "contact", count: 7 }],
					formVisitors: [{ date: "2026-04-01", form_name: "contact", visitor_id: "v3" }],
				});
				const result = await backend.getGoals({
					dateFrom: "2026-04-01",
					dateTo: "2026-04-07",
					totalVisitors: 100,
					goals: [
						{ id: "g1", name: "Thanks Page", type: "page", target: "/thanks", active: true },
						{ id: "g2", name: "Purchase", type: "event", target: "purchase", active: true },
						{ id: "g3", name: "Contact Form", type: "form", target: "contact", active: true },
					],
				}, dummyStorage);
				expect(result.length).toBe(3);
				// Sorted by completions: form(7) > page(5) > event(3)
				expect(result[0].goal).toBe("Contact Form");
				expect(result[1].goal).toBe("Thanks Page");
				expect(result[2].goal).toBe("Purchase");
			});
		});
	});
});
