import { describe, it, expect } from "vitest";
import { aggregateStats, normalizeDailyStats } from "../helpers/aggregation.js";
import type { DailyStats } from "../types.js";

function makeDailyStats(overrides: Partial<DailyStats> = {}): DailyStats {
	return normalizeDailyStats({
		pathname: "/test",
		date: "2026-04-01",
		...overrides,
	});
}

describe("normalizeDailyStats", () => {
	it("fills defaults for missing fields", () => {
		const stats = normalizeDailyStats({ pathname: "/test", date: "2026-04-01" });
		expect(stats.views).toBe(0);
		expect(stats.visitors).toEqual([]);
		expect(stats.referrers).toEqual({});
		expect(stats.utmSources).toEqual({});
		expect(stats.template).toBe("");
	});

	it("preserves existing values", () => {
		const stats = normalizeDailyStats({
			pathname: "/test",
			date: "2026-04-01",
			views: 42,
			template: "blog-post",
		});
		expect(stats.views).toBe(42);
		expect(stats.template).toBe("blog-post");
	});
});

describe("aggregateStats", () => {
	it("returns zero totals for empty input", () => {
		const result = aggregateStats([]);
		expect(result.totalViews).toBe(0);
		expect(result.totalVisitors).toBe(0);
		expect(result.byPathname.size).toBe(0);
	});

	it("sums views across records", () => {
		const items = [
			{ id: "1", data: makeDailyStats({ views: 10 }) },
			{ id: "2", data: makeDailyStats({ views: 20, date: "2026-04-02" }) },
		];
		const result = aggregateStats(items);
		expect(result.totalViews).toBe(30);
	});

	it("deduplicates visitors globally", () => {
		const items = [
			{ id: "1", data: makeDailyStats({ visitors: ["a", "b"] }) },
			{ id: "2", data: makeDailyStats({ visitors: ["b", "c"], date: "2026-04-02" }) },
		];
		const result = aggregateStats(items);
		expect(result.totalVisitors).toBe(3);
	});

	it("aggregates by pathname", () => {
		const items = [
			{ id: "1", data: makeDailyStats({ pathname: "/a", views: 5 }) },
			{ id: "2", data: makeDailyStats({ pathname: "/b", views: 10 }) },
			{ id: "3", data: makeDailyStats({ pathname: "/a", views: 3, date: "2026-04-02" }) },
		];
		const result = aggregateStats(items);
		expect(result.byPathname.get("/a")?.views).toBe(8);
		expect(result.byPathname.get("/b")?.views).toBe(10);
	});

	it("aggregates by date", () => {
		const items = [
			{ id: "1", data: makeDailyStats({ date: "2026-04-01", views: 5 }) },
			{ id: "2", data: makeDailyStats({ pathname: "/b", date: "2026-04-01", views: 10 }) },
			{ id: "3", data: makeDailyStats({ date: "2026-04-02", views: 3 }) },
		];
		const result = aggregateStats(items);
		expect(result.byDate.get("2026-04-01")?.views).toBe(15);
		expect(result.byDate.get("2026-04-02")?.views).toBe(3);
	});

	it("merges referrers", () => {
		const items = [
			{ id: "1", data: makeDailyStats({ referrers: { "google.com": 5, "twitter.com": 2 } }) },
			{ id: "2", data: makeDailyStats({ referrers: { "google.com": 3 }, date: "2026-04-02" }) },
		];
		const result = aggregateStats(items);
		expect(result.referrers["google.com"]).toBe(8);
		expect(result.referrers["twitter.com"]).toBe(2);
	});

	it("merges UTM sources", () => {
		const items = [
			{ id: "1", data: makeDailyStats({ utmSources: { twitter: 5 } }) },
			{ id: "2", data: makeDailyStats({ utmSources: { twitter: 3, newsletter: 2 }, date: "2026-04-02" }) },
		];
		const result = aggregateStats(items);
		expect(result.utmSources["twitter"]).toBe(8);
		expect(result.utmSources["newsletter"]).toBe(2);
	});

	it("preserves template and collection from pathname stats", () => {
		const items = [
			{ id: "1", data: makeDailyStats({ template: "blog-post", collection: "blog" }) },
		];
		const result = aggregateStats(items);
		expect(result.byPathname.get("/test")?.template).toBe("blog-post");
		expect(result.byPathname.get("/test")?.collection).toBe("blog");
	});

	it("sums scroll depth milestones", () => {
		const items = [
			{ id: "1", data: makeDailyStats({ scroll25: 10, scroll50: 8, scroll75: 5, scroll100: 2 }) },
			{ id: "2", data: makeDailyStats({ scroll25: 5, scroll50: 4, scroll75: 3, scroll100: 1, date: "2026-04-02" }) },
		];
		const result = aggregateStats(items);
		expect(result.totalScroll25).toBe(15);
		expect(result.totalScroll50).toBe(12);
		expect(result.totalScroll75).toBe(8);
		expect(result.totalScroll100).toBe(3);
	});
});
