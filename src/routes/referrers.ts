// ---------------------------------------------------------------------------
// GET /referrers — Admin referrer breakdown API
// ---------------------------------------------------------------------------

import type { PluginContext, RouteContext } from "emdash";
import { today, dateNDaysAgo } from "../helpers/date.js";
import { MAX_DATE_RANGE_DAYS } from "../constants.js";
import { getReferrersReport } from "../reporting/service.js";
import { reportingBackend, reportingStorage } from "../reporting/backend.js";

export async function handleReferrers(
	routeCtx: RouteContext,
	ctx: PluginContext,
): Promise<Record<string, unknown>> {
	const url = new URL(routeCtx.request.url);
	const days = Math.min(
		parseInt(url.searchParams.get("days") ?? "7", 10) || 7,
		MAX_DATE_RANGE_DAYS,
	);
	const limit = Math.min(
		parseInt(url.searchParams.get("limit") ?? "20", 10) || 20,
		50,
	);

	const referrers = await getReferrersReport(reportingBackend(), {
		dateFrom: dateNDaysAgo(days),
		dateTo: today(),
		limit,
	}, reportingStorage(ctx));

	return { referrers };
}
