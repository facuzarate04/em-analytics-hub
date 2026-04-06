import { describe, it, expect, vi } from "vitest";
import { handleStats } from "../routes/stats.js";
import { handleTopPages } from "../routes/top-pages.js";
import { handleReferrers } from "../routes/referrers.js";
import { handleCampaigns } from "../routes/campaigns.js";
import type { DailyStats } from "../types.js";
import { normalizeDailyStats } from "../helpers/aggregation.js";

function makeDailyStats(overrides: Partial<DailyStats> = {}): DailyStats {
	return normalizeDailyStats({
		pathname: "/blog/post",
		date: "2026-04-01",
		...overrides,
	});
}

function makeKv(overrides: Record<string, unknown> = {}) {
	const store: Record<string, unknown> = { ...overrides };
	return {
		get: vi.fn(async (key: string) => store[key] ?? null),
		set: vi.fn(),
	};
}

function makeStatsCollection(records: DailyStats[]) {
	return {
		get: vi.fn(),
		put: vi.fn(),
		query: vi.fn(async ({ cursor }: any) => {
			if (cursor) return { items: [], cursor: undefined };
			return {
				items: records.map((data) => ({ id: `${data.pathname}:${data.date}`, data })),
				cursor: undefined,
			};
		}),
		deleteMany: vi.fn(),
	};
}

function makeCtx(records: DailyStats[] = [], kvOverrides: Record<string, unknown> = {}) {
	return {
		kv: makeKv(kvOverrides),
		storage: {
			daily_stats: makeStatsCollection(records),
		},
	} as any;
}

function makeRouteCtx(url: string) {
	return {
		request: new Request(url),
	} as any;
}

// ─── handleStats ───────────────────────────────────────────────────────────

describe("handleStats route", () => {
	it("returns aggregated stats with plan", async () => {
		const ctx = makeCtx([
			makeDailyStats({ views: 50, visitors: ["a", "b"], reads: 10, referrers: { "google.com": 5 } }),
		]);
		const result = await handleStats(makeRouteCtx("https://example.com/stats?days=7"), ctx);

		expect(result.plan).toBe("free");
		expect(result.views).toBe(50);
		expect(result.visitors).toBe(2);
		expect(result.reads).toBe(10);
		expect(result.referrers).toEqual({ "google.com": 5 });
	});

	it("excludes countries on free plan", async () => {
		const ctx = makeCtx([
			makeDailyStats({ countries: { US: 10 } }),
		]);
		const result = await handleStats(makeRouteCtx("https://example.com/stats"), ctx);

		expect(result.countries).toBeUndefined();
	});

	it("includes countries on pro plan", async () => {
		const ctx = makeCtx(
			[makeDailyStats({ countries: { US: 10 } })],
			{ "state:license_cache": { plan: "pro", status: "active", instanceId: "x", siteUrl: "", validUntil: "", checkedAt: "", graceEndsAt: "" } },
		);
		const result = await handleStats(makeRouteCtx("https://example.com/stats"), ctx);

		expect(result.countries).toEqual({ US: 10 });
	});

	it("returns empty stats for no data", async () => {
		const ctx = makeCtx([]);
		const result = await handleStats(makeRouteCtx("https://example.com/stats"), ctx);

		expect(result.views).toBe(0);
		expect(result.visitors).toBe(0);
	});
});

// ─── handleTopPages ────────────────────────────────────────────────────────

describe("handleTopPages route", () => {
	it("returns ranked pages with plan", async () => {
		const ctx = makeCtx([
			makeDailyStats({ pathname: "/a", views: 5 }),
			makeDailyStats({ pathname: "/b", views: 20 }),
		]);
		const result = await handleTopPages(makeRouteCtx("https://example.com/top-pages"), ctx);

		expect(result.plan).toBe("free");
		expect((result.pages as any[])[0].pathname).toBe("/b");
		expect((result.pages as any[])[1].pathname).toBe("/a");
	});

	it("respects limit parameter", async () => {
		const ctx = makeCtx([
			makeDailyStats({ pathname: "/a", views: 5 }),
			makeDailyStats({ pathname: "/b", views: 20 }),
			makeDailyStats({ pathname: "/c", views: 10 }),
		]);
		const result = await handleTopPages(makeRouteCtx("https://example.com/top-pages?limit=2"), ctx);

		expect((result.pages as any[])).toHaveLength(2);
	});

	it("returns empty pages for no data", async () => {
		const ctx = makeCtx([]);
		const result = await handleTopPages(makeRouteCtx("https://example.com/top-pages"), ctx);

		expect(result.pages).toEqual([]);
	});
});

// ─── handleReferrers ───────────────────────────────────────────────────────

describe("handleReferrers route", () => {
	it("returns sorted referrers with plan", async () => {
		const ctx = makeCtx([
			makeDailyStats({ referrers: { "google.com": 10, "twitter.com": 30 } }),
		]);
		const result = await handleReferrers(makeRouteCtx("https://example.com/referrers"), ctx);

		expect(result.plan).toBe("free");
		const refs = result.referrers as any[];
		expect(refs[0]).toEqual({ domain: "twitter.com", count: 30 });
		expect(refs[1]).toEqual({ domain: "google.com", count: 10 });
	});

	it("respects limit parameter", async () => {
		const ctx = makeCtx([
			makeDailyStats({ referrers: { "a.com": 1, "b.com": 2, "c.com": 3 } }),
		]);
		const result = await handleReferrers(makeRouteCtx("https://example.com/referrers?limit=2"), ctx);

		expect((result.referrers as any[])).toHaveLength(2);
	});

	it("returns empty for no data", async () => {
		const ctx = makeCtx([]);
		const result = await handleReferrers(makeRouteCtx("https://example.com/referrers"), ctx);

		expect(result.referrers).toEqual([]);
	});
});

// ─── handleCampaigns ──────────────────────────────────────────────────────

describe("handleCampaigns route", () => {
	it("returns UTM breakdown with plan", async () => {
		const ctx = makeCtx([
			makeDailyStats({
				utmSources: { twitter: 10, newsletter: 20 },
				utmMediums: { social: 5 },
				utmCampaigns: { launch: 3 },
			}),
		]);
		const result = await handleCampaigns(makeRouteCtx("https://example.com/campaigns"), ctx);

		expect(result.plan).toBe("free");
		expect((result.sources as any[])[0]).toEqual({ name: "newsletter", count: 20 });
		expect((result.mediums as any[])[0]).toEqual({ name: "social", count: 5 });
		expect((result.campaigns as any[])[0]).toEqual({ name: "launch", count: 3 });
	});

	it("filters empty UTM keys", async () => {
		const ctx = makeCtx([
			makeDailyStats({ utmSources: { "": 5, twitter: 10 } }),
		]);
		const result = await handleCampaigns(makeRouteCtx("https://example.com/campaigns"), ctx);

		expect((result.sources as any[])).toHaveLength(1);
	});

	it("returns empty arrays for no data", async () => {
		const ctx = makeCtx([]);
		const result = await handleCampaigns(makeRouteCtx("https://example.com/campaigns"), ctx);

		expect(result.sources).toEqual([]);
		expect(result.mediums).toEqual([]);
		expect(result.campaigns).toEqual([]);
	});
});
