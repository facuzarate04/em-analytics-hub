import type { RuntimeId, AnalyticsRuntime } from "./types.js";
import type { CloudflareBindings } from "./env.js";
import { probeCloudflareEnv, requireCloudflareEnv } from "./env.js";
import { PortableIngestionBackend } from "../backends/portable/ingestion.js";
import { PortableReportingBackend } from "../backends/portable/reporting.js";
import { CloudflareIngestionBackend } from "../backends/cloudflare/ingestion.js";
import { CloudflareReportingBackend } from "../backends/cloudflare/reporting.js";
import type { AnalyticsEngineDataset } from "../backends/cloudflare/ingestion.js";
import type { D1Database } from "../backends/cloudflare/d1.js";

let _resolved: AnalyticsRuntime | null = null;

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

function buildCloudflareRuntime(bindings: CloudflareBindings): AnalyticsRuntime {
	const dataset = bindings.analyticsEngine as AnalyticsEngineDataset;
	const d1 = bindings.d1 as D1Database;
	const portableIngestion = new PortableIngestionBackend();
	return {
		id: "cloudflare",
		// Triple-write: AE + D1 + portable storage
		// Portable delegation is temporary — admin UI still reads ctx.storage directly.
		// Once admin dashboard migrates to reporting backend, portable can be removed.
		ingestion: new CloudflareIngestionBackend(dataset, d1, portableIngestion),
		// D1-backed reporting — reads from tables populated by ingestion above
		reporting: new CloudflareReportingBackend(d1),
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
		const bindings = requireCloudflareEnv();
		_resolved = buildCloudflareRuntime(bindings);
		return _resolved;
	}

	// auto: detect environment
	const diag = probeCloudflareEnv();
	if (diag.ready) {
		_resolved = buildCloudflareRuntime(requireCloudflareEnv());
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
