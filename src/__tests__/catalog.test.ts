import { describe, it, expect, vi } from "vitest";
import { extractPages, extractForms, extractEventNames, buildCatalogFromStorage } from "../admin/catalog.js";
import type { DailyStats, CustomEvent } from "../types.js";
import { normalizeDailyStats } from "../helpers/aggregation.js";

function makeDailyStats(overrides: Partial<DailyStats> = {}): DailyStats {
	return normalizeDailyStats({ pathname: "/test", date: "2026-04-01", ...overrides });
}

function makeCustomEvent(overrides: Partial<CustomEvent> = {}): CustomEvent {
	return {
		name: "click",
		pathname: "/page",
		props: {},
		visitorId: "abc",
		createdAt: "2026-04-01T12:00:00.000Z",
		...overrides,
	};
}

// ─── extractPages ──────────────────────────────────────────────────────────

describe("extractPages", () => {
	it("extracts unique pathnames", () => {
		const items = [
			{ id: "1", data: makeDailyStats({ pathname: "/a" }) },
			{ id: "2", data: makeDailyStats({ pathname: "/b" }) },
			{ id: "3", data: makeDailyStats({ pathname: "/a" }) },
		];
		expect(extractPages(items)).toEqual(["/a", "/b"]);
	});

	it("filters empty pathnames", () => {
		const items = [
			{ id: "1", data: makeDailyStats({ pathname: "" }) },
			{ id: "2", data: makeDailyStats({ pathname: "/valid" }) },
		];
		expect(extractPages(items)).toEqual(["/valid"]);
	});

	it("respects limit", () => {
		const items = Array.from({ length: 60 }, (_, i) => ({
			id: String(i),
			data: makeDailyStats({ pathname: `/page-${i}` }),
		}));
		expect(extractPages(items, 10)).toHaveLength(10);
	});

	it("returns empty for no data", () => {
		expect(extractPages([])).toEqual([]);
	});
});

// ─── extractForms ──────────────────────────────────────────────────────────

describe("extractForms", () => {
	it("extracts form_submit events", () => {
		const items = [
			{ id: "1", data: makeCustomEvent({ name: "form_submit", props: { form: "newsletter" } }) },
			{ id: "2", data: makeCustomEvent({ name: "form_submit", props: { form: "contact" } }) },
		];
		expect(extractForms(items)).toEqual(["newsletter", "contact"]);
	});

	it("extracts *_submit events", () => {
		const items = [
			{ id: "1", data: makeCustomEvent({ name: "newsletter_submit", props: { source: "sidebar" } }) },
		];
		expect(extractForms(items)).toEqual(["sidebar"]);
	});

	it("deduplicates forms", () => {
		const items = [
			{ id: "1", data: makeCustomEvent({ name: "form_submit", props: { form: "newsletter" } }) },
			{ id: "2", data: makeCustomEvent({ name: "form_submit", props: { form: "newsletter" } }) },
		];
		expect(extractForms(items)).toEqual(["newsletter"]);
	});

	it("ignores non-submit events", () => {
		const items = [
			{ id: "1", data: makeCustomEvent({ name: "click", props: { form: "newsletter" } }) },
		];
		expect(extractForms(items)).toEqual([]);
	});

	it("falls back to pathname when form/source props missing", () => {
		const items = [
			{ id: "1", data: makeCustomEvent({ name: "form_submit", pathname: "/contact", props: {} }) },
		];
		expect(extractForms(items)).toEqual(["/contact"]);
	});

	it("returns empty for no data", () => {
		expect(extractForms([])).toEqual([]);
	});
});

// ──��� extractEventNames ─────────────────────────────────────────────────────

describe("extractEventNames", () => {
	it("extracts unique event names", () => {
		const items = [
			{ id: "1", data: makeCustomEvent({ name: "signup" }) },
			{ id: "2", data: makeCustomEvent({ name: "click" }) },
			{ id: "3", data: makeCustomEvent({ name: "signup" }) },
		];
		expect(extractEventNames(items)).toEqual(["signup", "click"]);
	});

	it("filters empty names", () => {
		const items = [
			{ id: "1", data: makeCustomEvent({ name: "" }) },
			{ id: "2", data: makeCustomEvent({ name: "valid" }) },
		];
		expect(extractEventNames(items)).toEqual(["valid"]);
	});

	it("respects limit", () => {
		const items = Array.from({ length: 60 }, (_, i) => ({
			id: String(i),
			data: makeCustomEvent({ name: `event_${i}` }),
		}));
		expect(extractEventNames(items, 10)).toHaveLength(10);
	});

	it("returns empty for no data", () => {
		expect(extractEventNames([])).toEqual([]);
	});
});

// ─── buildCatalogFromStorage ───────────────────────────────────────────────

describe("buildCatalogFromStorage", () => {
	function makeCtx(stats: DailyStats[], customEvents: CustomEvent[]) {
		return {
			kv: { get: vi.fn(async () => null), set: vi.fn() },
			storage: {
				daily_stats: {
					get: vi.fn(),
					put: vi.fn(),
					query: vi.fn(async ({ cursor }: any) => {
						if (cursor) return { items: [], cursor: undefined };
						return {
							items: stats.map((data, i) => ({ id: String(i), data })),
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
			},
		} as any;
	}

	it("builds catalog from stats and custom events", async () => {
		const ctx = makeCtx(
			[
				makeDailyStats({ pathname: "/blog" }),
				makeDailyStats({ pathname: "/about" }),
			],
			[
				makeCustomEvent({ name: "form_submit", props: { form: "newsletter" } }),
				makeCustomEvent({ name: "signup" }),
			],
		);
		const catalog = await buildCatalogFromStorage(ctx);

		expect(catalog.pages).toContain("/about");
		expect(catalog.pages).toContain("/blog");
		expect(catalog.forms).toContain("newsletter");
		expect(catalog.events).toContain("signup");
		expect(catalog.events).toContain("form_submit");
	});

	it("returns empty catalog for no data", async () => {
		const ctx = makeCtx([], []);
		const catalog = await buildCatalogFromStorage(ctx);

		expect(catalog.pages).toEqual([]);
		expect(catalog.forms).toEqual([]);
		expect(catalog.events).toEqual([]);
	});

	it("sorts entries alphabetically", async () => {
		const ctx = makeCtx(
			[
				makeDailyStats({ pathname: "/z" }),
				makeDailyStats({ pathname: "/a" }),
				makeDailyStats({ pathname: "/m" }),
			],
			[],
		);
		const catalog = await buildCatalogFromStorage(ctx);

		expect(catalog.pages).toEqual(["/a", "/m", "/z"]);
	});
});
