import { describe, it, expect, vi } from "vitest";
import { handleAdmin } from "../routes/admin.js";
import type { DailyStats, CustomEvent } from "../types.js";
import { normalizeDailyStats } from "../helpers/aggregation.js";

function makeDailyStats(overrides: Partial<DailyStats> = {}): DailyStats {
	return normalizeDailyStats({ pathname: "/test", date: "2026-04-01", ...overrides });
}

function makeKv(overrides: Record<string, unknown> = {}) {
	const store: Record<string, unknown> = { ...overrides };
	return {
		get: vi.fn(async (key: string) => store[key] ?? null),
		set: vi.fn(async (key: string, value: unknown) => { store[key] = value; }),
	};
}

function makeCollection(items: any[] = []) {
	return {
		get: vi.fn(async () => undefined),
		put: vi.fn(),
		query: vi.fn(async ({ cursor }: any) => {
			if (cursor) return { items: [], cursor: undefined };
			return { items: items.map((data, i) => ({ id: String(i), data })), cursor: undefined };
		}),
		deleteMany: vi.fn(),
	};
}

function makeCtx(opts: {
	stats?: DailyStats[];
	customEvents?: CustomEvent[];
	kvOverrides?: Record<string, unknown>;
} = {}) {
	return {
		kv: makeKv(opts.kvOverrides ?? {}),
		storage: {
			daily_stats: makeCollection(opts.stats ?? []),
			events: makeCollection([]),
			custom_events: makeCollection(opts.customEvents ?? []),
		},
	} as any;
}

function makeRouteCtx(input: Record<string, unknown>) {
	return {
		request: new Request("https://example.com/admin"),
		input,
	} as any;
}

// ─── handleAdmin — page loads ──────────────────────────────────────────────

describe("handleAdmin", () => {
	it("returns dashboard blocks for /analytics", async () => {
		const ctx = makeCtx({ stats: [makeDailyStats({ views: 10, visitors: ["a"] })] });
		const result = await handleAdmin(
			makeRouteCtx({ type: "page_load", page: "/analytics" }),
			ctx,
		);

		expect(result.blocks).toBeDefined();
		expect(Array.isArray(result.blocks)).toBe(true);
	});

	it("returns widget blocks for widget:site-overview", async () => {
		const ctx = makeCtx({ stats: [makeDailyStats({ views: 5 })] });
		const result = await handleAdmin(
			makeRouteCtx({ type: "page_load", page: "widget:site-overview" }),
			ctx,
		);

		expect(result.blocks).toBeDefined();
	});

	it("returns goals page directly", async () => {
		const ctx = makeCtx({
			stats: [makeDailyStats({ pathname: "/pricing" })],
			customEvents: [{ name: "signup", pathname: "/pricing", props: {}, visitorId: "a", createdAt: "2026-04-01T00:00:00Z" }],
		});
		const result = await handleAdmin(
			makeRouteCtx({ type: "page_load", page: "/analytics/goals" }),
			ctx,
		);

		const blocks = result.blocks as any[];
		const goalsHeader = blocks.find((b: any) => b.type === "header" && b.text === "Goals");
		expect(goalsHeader).toBeTruthy();
	});

	it("returns funnels page directly", async () => {
		const ctx = makeCtx({
			stats: [makeDailyStats({ pathname: "/blog" })],
		});
		const result = await handleAdmin(
			makeRouteCtx({ type: "page_load", page: "/analytics/funnels" }),
			ctx,
		);

		const blocks = result.blocks as any[];
		const funnelsHeader = blocks.find((b: any) => b.type === "header" && b.text === "Funnels");
		expect(funnelsHeader).toBeTruthy();
	});

	it("handles date range change", async () => {
		const ctx = makeCtx({ stats: [makeDailyStats({ views: 50 })] });
		const result = await handleAdmin(
			makeRouteCtx({ type: "form_submit", action_id: "apply_range", values: { range: "30" } }),
			ctx,
		);

		expect(result.blocks).toBeDefined();
	});

	it("returns empty blocks for unknown interaction", async () => {
		const ctx = makeCtx();
		const result = await handleAdmin(
			makeRouteCtx({ type: "unknown_action" }),
			ctx,
		);

		expect(result).toEqual({ blocks: [] });
	});
});
