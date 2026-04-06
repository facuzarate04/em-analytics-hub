import { describe, it, expect, vi } from "vitest";
import { handleTrack } from "../routes/track.js";

function makeKv(overrides: Record<string, unknown> = {}) {
	const store: Record<string, unknown> = {
		"state:daily_salt": "test-salt",
		...overrides,
	};
	return {
		get: vi.fn(async (key: string) => store[key] ?? null),
		set: vi.fn(async (key: string, value: unknown) => { store[key] = value; }),
	};
}

function makeCollection() {
	const data = new Map<string, unknown>();
	return {
		get: vi.fn(async (id: string) => data.get(id)),
		put: vi.fn(async (id: string, value: unknown) => { data.set(id, value); }),
		query: vi.fn(async () => ({ items: [], cursor: undefined })),
		deleteMany: vi.fn(),
	};
}

function makeCtx(kvOverrides: Record<string, unknown> = {}) {
	return {
		kv: makeKv(kvOverrides),
		storage: {
			events: makeCollection(),
			daily_stats: makeCollection(),
			custom_events: makeCollection(),
		},
	} as any;
}

function makeRouteCtx(payload: Record<string, unknown>, headers: Record<string, string> = {}) {
	return {
		request: new Request("https://example.com/track", {
			method: "POST",
			headers: {
				"user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome/120",
				"cf-connecting-ip": "9.9.9.9",
				...headers,
			},
		}),
		input: payload,
	};
}

describe("handleTrack integration", () => {
	it("returns ok and persists for valid pageview", async () => {
		const ctx = makeCtx();
		const routeCtx = makeRouteCtx({ t: "pageview", p: "/blog" });

		const result = await handleTrack(routeCtx, ctx);

		expect(result).toEqual({ ok: true });
		expect(ctx.storage.events.put).toHaveBeenCalled();
		expect(ctx.storage.daily_stats.put).toHaveBeenCalled();
	});

	it("returns error for invalid payload", async () => {
		const ctx = makeCtx();
		const routeCtx = makeRouteCtx({ t: "unknown", p: "/blog" });

		const result = await handleTrack(routeCtx, ctx);

		expect(result).toEqual({ error: "Bad request" });
		expect(ctx.storage.events.put).not.toHaveBeenCalled();
	});

	it("returns ok silently for bots", async () => {
		const ctx = makeCtx();
		const routeCtx = makeRouteCtx(
			{ t: "pageview", p: "/" },
			{ "user-agent": "Googlebot/2.1" },
		);

		const result = await handleTrack(routeCtx, ctx);

		expect(result).toEqual({ ok: true });
		expect(ctx.storage.events.put).not.toHaveBeenCalled();
	});

	it("returns ok silently for excluded paths", async () => {
		const ctx = makeCtx();
		const routeCtx = makeRouteCtx({ t: "pageview", p: "/_emdash/settings" });

		const result = await handleTrack(routeCtx, ctx);

		expect(result).toEqual({ ok: true });
		expect(ctx.storage.events.put).not.toHaveBeenCalled();
	});

	it("returns ok silently for excluded IPs", async () => {
		const ctx = makeCtx({ "settings:excludedIPs": "9.9.9.9" });
		const routeCtx = makeRouteCtx({ t: "pageview", p: "/blog" });

		const result = await handleTrack(routeCtx, ctx);

		expect(result).toEqual({ ok: true });
		expect(ctx.storage.events.put).not.toHaveBeenCalled();
	});

	it("persists custom event to dedicated collection", async () => {
		const ctx = makeCtx();
		const routeCtx = makeRouteCtx({
			t: "custom",
			p: "/pricing",
			n: "signup",
			pr: '{"plan":"pro"}',
		});

		const result = await handleTrack(routeCtx, ctx);

		expect(result).toEqual({ ok: true });
		expect(ctx.storage.custom_events.put).toHaveBeenCalled();
	});

	it("generates salt when missing", async () => {
		const ctx = makeCtx({ "state:daily_salt": null });
		const routeCtx = makeRouteCtx({ t: "pageview", p: "/" });

		await handleTrack(routeCtx, ctx);

		expect(ctx.kv.set).toHaveBeenCalledWith("state:daily_salt", expect.any(String));
	});
});
