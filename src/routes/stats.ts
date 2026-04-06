// ---------------------------------------------------------------------------
// GET /stats — Admin aggregated stats API
// ---------------------------------------------------------------------------

import type { PluginContext, RouteContext } from "emdash";
import { today, dateNDaysAgo } from "../helpers/date.js";
import { getLicense, hasFeature, getMaxDateRange } from "../license/features.js";
import { getStatsReport } from "../reporting/service.js";
import type { ReportingStorage } from "../reporting/types.js";
import { PortableReportingBackend } from "../backends/portable/reporting.js";

const backend = new PortableReportingBackend();

export async function handleStats(
	routeCtx: RouteContext,
	ctx: PluginContext,
): Promise<Record<string, unknown>> {
	const license = await getLicense(ctx.kv);
	const url = new URL(routeCtx.request.url);
	const pathname = url.searchParams.get("pathname") ?? undefined;
	const maxDays = getMaxDateRange(license);
	const days = Math.min(
		parseInt(url.searchParams.get("days") ?? "7", 10) || 7,
		maxDays,
	);

	const storage: ReportingStorage = {
		daily_stats: ctx.storage.daily_stats as ReportingStorage["daily_stats"],
	};

	const report = await getStatsReport(backend, {
		dateFrom: dateNDaysAgo(days),
		dateTo: today(),
		pathname,
	}, storage);

	const response: Record<string, unknown> = {
		plan: license.plan,
		...report,
	};

	if (!hasFeature(license, "countries")) {
		delete response.countries;
	}

	return response;
}
