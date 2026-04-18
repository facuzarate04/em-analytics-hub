// ---------------------------------------------------------------------------
// GET /stats — Admin aggregated stats API
// ---------------------------------------------------------------------------

import type { PluginContext, RouteContext } from "emdash";
import { today, dateNDaysAgo } from "../helpers/date.js";
import { MAX_DATE_RANGE_DAYS } from "../constants.js";
import { getStatsReport } from "../reporting/service.js";
import { reportingBackend, reportingStorage } from "../reporting/backend.js";

export async function handleStats(
	routeCtx: RouteContext,
	ctx: PluginContext,
): Promise<Record<string, unknown>> {
	const url = new URL(routeCtx.request.url);
	const pathname = url.searchParams.get("pathname") ?? undefined;
	const days = Math.min(
		parseInt(url.searchParams.get("days") ?? "7", 10) || 7,
		MAX_DATE_RANGE_DAYS,
	);

	const report = await getStatsReport(reportingBackend(), {
		dateFrom: dateNDaysAgo(days),
		dateTo: today(),
		pathname,
	}, reportingStorage(ctx));

	return { ...report };
}
