export const CF_BINDING_ANALYTICS_ENGINE = "ANALYTICS";
export const CF_BINDING_D1 = "ANALYTICS_DB";

export interface CloudflareBindings {
	analyticsEngine: unknown;
	d1: unknown;
}

export interface EnvDiagnostic {
	isCloudflare: boolean;
	hasAnalyticsEngine: boolean;
	hasD1: boolean;
	ready: boolean;
	missing: string[];
}

export function probeCloudflareEnv(): EnvDiagnostic {
	const isCloudflare = detectCloudflareWorkers();

	if (!isCloudflare) {
		return { isCloudflare: false, hasAnalyticsEngine: false, hasD1: false, ready: false, missing: [] };
	}

	const g = globalThis as Record<string, unknown>;
	const hasAnalyticsEngine = hasBinding(g, CF_BINDING_ANALYTICS_ENGINE);
	const hasD1 = hasBinding(g, CF_BINDING_D1);

	const missing: string[] = [];
	if (!hasAnalyticsEngine) missing.push(CF_BINDING_ANALYTICS_ENGINE);
	if (!hasD1) missing.push(CF_BINDING_D1);

	return {
		isCloudflare: true,
		hasAnalyticsEngine,
		hasD1,
		ready: missing.length === 0,
		missing,
	};
}

export function requireCloudflareEnv(): CloudflareBindings {
	const diag = probeCloudflareEnv();

	if (!diag.isCloudflare) {
		throw new Error(
			"[analytics-hub] ANALYTICS_HUB_RUNTIME=cloudflare but Cloudflare Workers environment not detected. "
			+ "Use 'auto' or 'portable' for non-Cloudflare environments.",
		);
	}

	if (!diag.ready) {
		throw new Error(
			`[analytics-hub] Cloudflare runtime requires bindings: ${diag.missing.join(", ")}. `
			+ "Add them to your wrangler.toml. See: https://developers.cloudflare.com/analytics/analytics-engine/",
		);
	}

	const g = globalThis as Record<string, unknown>;
	return {
		analyticsEngine: g[CF_BINDING_ANALYTICS_ENGINE],
		d1: g[CF_BINDING_D1],
	};
}

function detectCloudflareWorkers(): boolean {
	try {
		const g = globalThis as Record<string, unknown>;
		const caches = g.caches as Record<string, unknown> | undefined;
		return caches !== undefined && caches.default !== undefined;
	} catch {
		return false;
	}
}

function hasBinding(g: Record<string, unknown>, name: string): boolean {
	return g[name] !== undefined && g[name] !== null;
}
