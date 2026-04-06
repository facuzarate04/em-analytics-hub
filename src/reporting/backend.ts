import type { PluginContext } from "emdash";
import type { ReportingStorage } from "./types.js";
import { getRuntime } from "../runtime/index.js";

export function reportingBackend() {
	return getRuntime().reporting;
}

export function reportingStorage(ctx: PluginContext): ReportingStorage {
	return {
		daily_stats: ctx.storage.daily_stats as ReportingStorage["daily_stats"],
		custom_events: ctx.storage.custom_events as ReportingStorage["custom_events"],
	};
}
