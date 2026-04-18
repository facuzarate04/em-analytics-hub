import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { probeCloudflareEnv, requireCloudflareEnv, CF_BINDING_ANALYTICS_ENGINE, CF_BINDING_D1 } from "../runtime/env.js";

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

describe("probeCloudflareEnv", () => {
	afterEach(cleanGlobals);

	it("returns not-cloudflare in Node environment", () => {
		const diag = probeCloudflareEnv();
		expect(diag.isCloudflare).toBe(false);
		expect(diag.ready).toBe(false);
		expect(diag.missing).toEqual([]);
	});

	it("detects Cloudflare Workers environment", () => {
		simulateCfWorkers();
		const diag = probeCloudflareEnv();
		expect(diag.isCloudflare).toBe(true);
	});

	it("reports missing bindings when on CF without them", () => {
		simulateCfWorkers();
		const diag = probeCloudflareEnv();
		expect(diag.hasAnalyticsEngine).toBe(false);
		expect(diag.hasD1).toBe(false);
		expect(diag.ready).toBe(false);
		expect(diag.missing).toEqual([CF_BINDING_ANALYTICS_ENGINE, CF_BINDING_D1]);
	});

	it("reports partial bindings", () => {
		simulateCfWorkers();
		simulateBinding(CF_BINDING_ANALYTICS_ENGINE, { writeDataPoint: () => {} });
		const diag = probeCloudflareEnv();
		expect(diag.hasAnalyticsEngine).toBe(true);
		expect(diag.hasD1).toBe(false);
		expect(diag.ready).toBe(false);
		expect(diag.missing).toEqual([CF_BINDING_D1]);
	});

	it("reports ready when all bindings present", () => {
		simulateCfWorkers();
		simulateBinding(CF_BINDING_ANALYTICS_ENGINE, { writeDataPoint: () => {} });
		simulateBinding(CF_BINDING_D1, { prepare: () => {} });
		const diag = probeCloudflareEnv();
		expect(diag.isCloudflare).toBe(true);
		expect(diag.hasAnalyticsEngine).toBe(true);
		expect(diag.hasD1).toBe(true);
		expect(diag.ready).toBe(true);
		expect(diag.missing).toEqual([]);
	});
});

describe("requireCloudflareEnv", () => {
	afterEach(cleanGlobals);

	it("throws when not on Cloudflare", () => {
		expect(() => requireCloudflareEnv()).toThrow(
			"Cloudflare Workers environment not detected",
		);
	});

	it("throws with missing bindings list when on CF without them", () => {
		simulateCfWorkers();
		expect(() => requireCloudflareEnv()).toThrow(
			`requires bindings: ${CF_BINDING_ANALYTICS_ENGINE}, ${CF_BINDING_D1}`,
		);
	});

	it("throws with specific missing binding", () => {
		simulateCfWorkers();
		simulateBinding(CF_BINDING_ANALYTICS_ENGINE);
		expect(() => requireCloudflareEnv()).toThrow(
			`requires bindings: ${CF_BINDING_D1}`,
		);
	});

	it("returns bindings when all present", () => {
		simulateCfWorkers();
		const ae = { writeDataPoint: () => {} };
		const d1 = { prepare: () => {} };
		simulateBinding(CF_BINDING_ANALYTICS_ENGINE, ae);
		simulateBinding(CF_BINDING_D1, d1);

		const bindings = requireCloudflareEnv();
		expect(bindings.analyticsEngine).toBe(ae);
		expect(bindings.d1).toBe(d1);
	});
});
