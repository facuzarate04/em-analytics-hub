import type { AnalyticsIngestionBackend } from "../ingestion/types.js";
import type { AnalyticsReportingBackend } from "../reporting/types.js";

export type RuntimeId = "portable" | "cloudflare" | "auto";

export interface AnalyticsRuntime {
	id: RuntimeId;
	ingestion: AnalyticsIngestionBackend;
	reporting: AnalyticsReportingBackend;
}
