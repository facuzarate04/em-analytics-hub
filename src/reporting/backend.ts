import type { PluginContext } from "emdash";
import type { ReportingStorage } from "./types.js";
import { PortableReportingBackend } from "../backends/portable/reporting.js";

export const reportingBackend = new PortableReportingBackend();

export function reportingStorage(ctx: PluginContext): ReportingStorage {
	return {
		daily_stats: ctx.storage.daily_stats as ReportingStorage["daily_stats"],
	};
}
