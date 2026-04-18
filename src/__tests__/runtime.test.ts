import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveRuntime, resetRuntime, getRuntime } from "../runtime/resolver.js";
import { CF_BINDING_ANALYTICS_ENGINE, CF_BINDING_D1 } from "../runtime/env.js";
import { CloudflareIngestionBackend } from "../backends/cloudflare/ingestion.js";
import { CloudflareReportingBackend } from "../backends/cloudflare/reporting.js";
import { PortableIngestionBackend } from "../backends/portable/ingestion.js";
import { PortableReportingBackend } from "../backends/portable/reporting.js";

function simulateCfWorkers() {
	(globalThis as any).caches = { default: {} };
}

function simulateBinding(name: string, value: unknown = {}) {
	(globalThis as any)[name] = value;
}

function cleanGlobals() {
	delete (globalThis as any).caches;
	delete (globalThis as any)[CF_BINDING_ANALYTICS_ENGINE];
	delete (globalThis as any)[CF_BINDING_D1];
}

describe("resolveRuntime", () => {
	beforeEach(() => {
		resetRuntime();
		cleanGlobals();
	});

	afterEach(() => {
		resetRuntime();
		cleanGlobals();
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

	it("throws when cloudflare forced but not CF environment", () => {
		expect(() => resolveRuntime("cloudflare")).toThrow(
			"Cloudflare Workers environment not detected",
		);
	});

	it("throws with missing bindings when cloudflare forced on CF without bindings", () => {
		simulateCfWorkers();
		expect(() => resolveRuntime("cloudflare")).toThrow(
			`requires bindings: ${CF_BINDING_ANALYTICS_ENGINE}, ${CF_BINDING_D1}`,
		);
	});

	it("returns cloudflare runtime when forced with all bindings present", () => {
		simulateCfWorkers();
		simulateBinding(CF_BINDING_ANALYTICS_ENGINE, { writeDataPoint: () => {} });
		simulateBinding(CF_BINDING_D1, { prepare: () => {} });
		const runtime = resolveRuntime("cloudflare");
		expect(runtime.id).toBe("cloudflare");
		expect(runtime.ingestion).toBeDefined();
		expect(runtime.reporting).toBeDefined();
	});

	it("uses CloudflareIngestionBackend and CloudflareReportingBackend in cloudflare mode", () => {
		simulateCfWorkers();
		simulateBinding(CF_BINDING_ANALYTICS_ENGINE, { writeDataPoint: () => {} });
		simulateBinding(CF_BINDING_D1, { prepare: () => {} });
		const runtime = resolveRuntime("cloudflare");
		expect(runtime.ingestion).toBeInstanceOf(CloudflareIngestionBackend);
		expect(runtime.reporting).toBeInstanceOf(CloudflareReportingBackend);
	});

	it("uses PortableIngestionBackend and PortableReportingBackend in portable mode", () => {
		const runtime = resolveRuntime("portable");
		expect(runtime.ingestion).toBeInstanceOf(PortableIngestionBackend);
		expect(runtime.reporting).toBeInstanceOf(PortableReportingBackend);
	});

	it("falls back to portable on auto when CF detected but bindings missing", () => {
		simulateCfWorkers();
		const runtime = resolveRuntime("auto");
		expect(runtime.id).toBe("portable");
	});

	it("returns cloudflare runtime on auto when CF ready", () => {
		simulateCfWorkers();
		simulateBinding(CF_BINDING_ANALYTICS_ENGINE, { writeDataPoint: () => {} });
		simulateBinding(CF_BINDING_D1, { prepare: () => {} });
		const runtime = resolveRuntime("auto");
		expect(runtime.id).toBe("cloudflare");
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
		cleanGlobals();
	});

	afterEach(() => {
		resetRuntime();
		cleanGlobals();
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
