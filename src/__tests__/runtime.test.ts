import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resolveRuntime, resetRuntime, getRuntime } from "../runtime/resolver.js";

describe("resolveRuntime", () => {
	beforeEach(() => {
		resetRuntime();
	});

	afterEach(() => {
		resetRuntime();
		delete process.env.ANALYTICS_HUB_RUNTIME;
	});

	it("defaults to portable on auto in Node environment", () => {
		const runtime = resolveRuntime();
		expect(runtime.id).toBe("portable");
		expect(runtime.ingestion).toBeDefined();
		expect(runtime.reporting).toBeDefined();
	});

	it("returns portable when explicitly requested", () => {
		const runtime = resolveRuntime("portable");
		expect(runtime.id).toBe("portable");
	});

	it("returns portable when auto and not on Cloudflare", () => {
		const runtime = resolveRuntime("auto");
		expect(runtime.id).toBe("portable");
	});

	it("throws when cloudflare is forced but environment is not CF", () => {
		expect(() => resolveRuntime("cloudflare")).toThrow(
			"Cloudflare Workers environment not detected",
		);
	});

	it("reads ANALYTICS_HUB_RUNTIME=portable from env", () => {
		process.env.ANALYTICS_HUB_RUNTIME = "portable";
		const runtime = resolveRuntime();
		expect(runtime.id).toBe("portable");
	});

	it("reads ANALYTICS_HUB_RUNTIME=cloudflare from env and throws", () => {
		process.env.ANALYTICS_HUB_RUNTIME = "cloudflare";
		expect(() => resolveRuntime()).toThrow("Cloudflare Workers environment not detected");
	});

	it("ignores invalid env values and defaults to auto", () => {
		process.env.ANALYTICS_HUB_RUNTIME = "invalid_value";
		const runtime = resolveRuntime();
		expect(runtime.id).toBe("portable");
	});

	it("caches resolved runtime on subsequent calls", () => {
		const first = resolveRuntime();
		const second = resolveRuntime();
		expect(first).toBe(second);
	});

	it("resets cache with resetRuntime", () => {
		const first = resolveRuntime("portable");
		resetRuntime();
		const second = resolveRuntime("portable");
		expect(first).not.toBe(second);
		expect(first.id).toBe(second.id);
	});
});

describe("getRuntime", () => {
	beforeEach(() => {
		resetRuntime();
	});

	afterEach(() => {
		resetRuntime();
	});

	it("auto-resolves on first call", () => {
		const runtime = getRuntime();
		expect(runtime.id).toBe("portable");
	});

	it("returns same instance as resolveRuntime", () => {
		const resolved = resolveRuntime();
		const got = getRuntime();
		expect(resolved).toBe(got);
	});
});
