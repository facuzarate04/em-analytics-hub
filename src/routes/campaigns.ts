// ---------------------------------------------------------------------------
// GET /campaigns — Admin UTM campaign stats API
// ---------------------------------------------------------------------------

import type { PluginContext, RouteContext } from "emdash";
import { today, dateNDaysAgo } from "../helpers/date.js";
import { MAX_DATE_RANGE_DAYS } from "../constants.js";
import { getCampaignsReport } from "../reporting/service.js";
import { reportingBackend, reportingStorage } from "../reporting/backend.js";

export async function handleCampaigns(
	routeCtx: RouteContext,
	ctx: PluginContext,
): Promise<Record<string, unknown>> {
	const url = new URL(routeCtx.request.url);
	const days = Math.min(
		parseInt(url.searchParams.get("days") ?? "7", 10) || 7,
		MAX_DATE_RANGE_DAYS,
	);

	const report = await getCampaignsReport(reportingBackend(), {
		dateFrom: dateNDaysAgo(days),
		dateTo: today(),
	}, reportingStorage(ctx));

	return { ...report };
}
