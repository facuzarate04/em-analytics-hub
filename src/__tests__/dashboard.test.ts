import { describe, it, expect, vi } from "vitest";
import { buildDashboard } from "../admin/dashboard.js";
import { buildWidget } from "../admin/widget.js";
import type { DailyStats, LicenseCache } from "../types.js";
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

function makeEmptyCollection() {
	return {
		get: vi.fn(async () => undefined),
		put: vi.fn(),
		query: vi.fn(async () => ({ items: [], cursor: undefined })),
		deleteMany: vi.fn(),
	};
}

function makeCtx(records: DailyStats[] = [], kvOverrides: Record<string, unknown> = {}) {
	return {
		kv: makeKv(kvOverrides),
		storage: {
			daily_stats: makeStatsCollection(records),
			events: makeEmptyCollection(),
			custom_events: makeEmptyCollection(),
		},
	} as any;
}

const freeLicense: LicenseCache = {
	plan: "free",
	validUntil: "",
	checkedAt: "",
	status: "inactive",
	instanceId: "",
	siteUrl: "",
	graceEndsAt: "",
};

const proLicense: LicenseCache = {
	plan: "pro",
	validUntil: "2027-01-01T00:00:00Z",
	checkedAt: "2026-04-05T00:00:00Z",
	status: "active",
	instanceId: "inst_123",
	siteUrl: "https://example.com",
	graceEndsAt: "",
};

// ─── buildDashboard ────────────────────────────────────────────────────────

describe("buildDashboard", () => {
	it("returns blocks for empty data", async () => {
		const ctx = makeCtx([]);
		const result = await buildDashboard(ctx, 7, freeLicense);

		expect(result.blocks).toBeDefined();
		expect(Array.isArray(result.blocks)).toBe(true);
		const blocks = result.blocks as any[];
		const noData = blocks.find((b: any) => b.type === "banner" && b.title === "No data yet");
		expect(noData).toBeTruthy();
	});

	it("builds overview stats from reporting data", async () => {
		const ctx = makeCtx([
			makeDailyStats({ views: 100, visitors: ["a", "b", "c"], reads: 30 }),
		]);
		const result = await buildDashboard(ctx, 7, freeLicense);

		const blocks = result.blocks as any[];
		const statsBlocks = blocks.filter((b: any) => b.type === "stats");
		expect(statsBlocks.length).toBeGreaterThan(0);

		const firstStats = statsBlocks[0].items;
		expect(firstStats[0].label).toBe("Views");
		expect(firstStats[0].value).toBe("100");
	});

	it("includes referrers from reporting", async () => {
		const ctx = makeCtx([
			makeDailyStats({ views: 50, referrers: { "google.com": 30, "twitter.com": 10 } }),
		]);
		const result = await buildDashboard(ctx, 7, freeLicense);

		const blocks = result.blocks as any[];
		const referrerHeader = blocks.find((b: any) => b.type === "header" && b.text === "Referrers");
		expect(referrerHeader).toBeTruthy();
	});

	it("includes top pages from reporting", async () => {
		const ctx = makeCtx([
			makeDailyStats({ pathname: "/blog", views: 50 }),
			makeDailyStats({ pathname: "/about", views: 20 }),
		]);
		const result = await buildDashboard(ctx, 7, freeLicense);

		const blocks = result.blocks as any[];
		const topPagesHeader = blocks.find((b: any) => b.type === "header" && b.text === "Top Pages");
		expect(topPagesHeader).toBeTruthy();
	});

	it("includes campaigns section on free plan", async () => {
		const ctx = makeCtx([
			makeDailyStats({ views: 50, utmSources: { twitter: 10 } }),
		]);
		const result = await buildDashboard(ctx, 7, freeLicense);

		const blocks = result.blocks as any[];
		const campaignHeader = blocks.find((b: any) => b.type === "header" && b.text === "Campaigns");
		expect(campaignHeader).toBeTruthy();
	});

	it("excludes countries on free plan", async () => {
		const ctx = makeCtx([
			makeDailyStats({ views: 50, countries: { US: 10 } }),
		]);
		const result = await buildDashboard(ctx, 7, freeLicense);

		const blocks = result.blocks as any[];
		const countriesHeader = blocks.find((b: any) => b.type === "header" && b.text === "Countries");
		expect(countriesHeader).toBeUndefined();
	});

	it("includes countries on pro plan", async () => {
		const ctx = makeCtx([
			makeDailyStats({ views: 50, countries: { US: 10, AR: 5 } }),
		]);
		const result = await buildDashboard(ctx, 7, proLicense);

		const blocks = result.blocks as any[];
		const countriesHeader = blocks.find((b: any) => b.type === "header" && b.text === "Countries");
		expect(countriesHeader).toBeTruthy();
	});

});

// ─── buildWidget ───────────────────────────────────────────────────────────

describe("buildWidget", () => {
	it("returns blocks with stats and top pages", async () => {
		const ctx = makeCtx([
			makeDailyStats({ pathname: "/blog", views: 50, visitors: ["a", "b"] }),
			makeDailyStats({ pathname: "/about", views: 20, visitors: ["c"] }),
		]);
		const result = await buildWidget(ctx, freeLicense);

		expect(result.blocks).toBeDefined();
		const blocks = result.blocks as any[];
		expect(blocks).toHaveLength(2);

		const statsB = blocks[0];
		expect(statsB.type).toBe("stats");
		expect(statsB.items[0].label).toBe("Views (7d)");

		const tableB = blocks[1];
		expect(tableB.type).toBe("table");
	});

	it("returns zeroes for empty data", async () => {
		const ctx = makeCtx([]);
		const result = await buildWidget(ctx, freeLicense);

		const blocks = result.blocks as any[];
		const statsB = blocks[0];
		expect(statsB.items[0].value).toBe("0");
	});
});
