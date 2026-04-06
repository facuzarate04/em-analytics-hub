import type { RuntimeId, AnalyticsRuntime } from "./types.js";
import { PortableIngestionBackend } from "../backends/portable/ingestion.js";
import { PortableReportingBackend } from "../backends/portable/reporting.js";

let _resolved: AnalyticsRuntime | null = null;

function isCloudflareEnvironment(): boolean {
	try {
		return typeof (globalThis as any).caches !== "undefined"
			&& typeof (globalThis as any).caches.default !== "undefined";
	} catch {
		return false;
	}
}

function parseRuntimeConfig(): RuntimeId {
	if (typeof process !== "undefined" && process.env?.ANALYTICS_HUB_RUNTIME) {
		const value = process.env.ANALYTICS_HUB_RUNTIME.toLowerCase().trim();
		if (value === "portable" || value === "cloudflare" || value === "auto") {
			return value;
		}
	}
	return "auto";
}

function buildPortableRuntime(): AnalyticsRuntime {
	return {
		id: "portable",
		ingestion: new PortableIngestionBackend(),
		reporting: new PortableReportingBackend(),
	};
}

export function resolveRuntime(override?: RuntimeId): AnalyticsRuntime {
	if (_resolved) return _resolved;

	const requested = override ?? parseRuntimeConfig();

	if (requested === "portable") {
		_resolved = buildPortableRuntime();
		return _resolved;
	}

	if (requested === "cloudflare") {
		if (!isCloudflareEnvironment()) {
			throw new Error(
				"[analytics-hub] ANALYTICS_HUB_RUNTIME=cloudflare but Cloudflare Workers environment not detected. "
				+ "Use 'auto' or 'portable' for non-Cloudflare environments.",
			);
		}
		// Cloudflare backend will be implemented in a future slice.
		// For now, this path is unreachable in non-CF environments
		// and fails explicitly if forced.
		throw new Error(
			"[analytics-hub] Cloudflare runtime is not yet implemented. Use 'auto' or 'portable'.",
		);
	}

	// auto: detect environment
	if (isCloudflareEnvironment()) {
		// Future: return buildCloudflareRuntime() once implemented.
		// For now, fall back to portable even on CF since the CF backend doesn't exist yet.
		_resolved = buildPortableRuntime();
		return _resolved;
	}

	_resolved = buildPortableRuntime();
	return _resolved;
}

export function resetRuntime(): void {
	_resolved = null;
}

export function getRuntime(): AnalyticsRuntime {
	if (!_resolved) return resolveRuntime();
	return _resolved;
}
