import type { RuntimeId, AnalyticsRuntime } from "./types.js";
import type { CloudflareBindings } from "./env.js";
import { probeCloudflareEnv, requireCloudflareEnv } from "./env.js";
import { PortableIngestionBackend } from "../backends/portable/ingestion.js";
import { PortableReportingBackend } from "../backends/portable/reporting.js";
import { CloudflareIngestionBackend } from "../backends/cloudflare/ingestion.js";
import type { AnalyticsEngineDataset } from "../backends/cloudflare/ingestion.js";

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
	const portableIngestion = new PortableIngestionBackend();
	return {
		id: "cloudflare",
		// Dual-write: AE + portable storage (temporary until D1 reporting in Slice 4)
		ingestion: new CloudflareIngestionBackend(dataset, portableIngestion),
		// D1 reporting not yet implemented — use portable reporting for now
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
