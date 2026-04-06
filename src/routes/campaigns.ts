// ---------------------------------------------------------------------------
// GET /campaigns — Admin UTM campaign stats API
// ---------------------------------------------------------------------------

import type { PluginContext, RouteContext } from "emdash";
import { today, dateNDaysAgo } from "../helpers/date.js";
import { getLicense, getMaxDateRange } from "../license/features.js";
import { getCampaignsReport } from "../reporting/service.js";
import { reportingBackend, reportingStorage } from "../reporting/backend.js";

export async function handleCampaigns(
	routeCtx: RouteContext,
	ctx: PluginContext,
): Promise<Record<string, unknown>> {
	const license = await getLicense(ctx.kv);
	const url = new URL(routeCtx.request.url);
	const maxDays = getMaxDateRange(license);
	const days = Math.min(
		parseInt(url.searchParams.get("days") ?? "7", 10) || 7,
		maxDays,
	);

	const report = await getCampaignsReport(reportingBackend(), {
		dateFrom: dateNDaysAgo(days),
		dateTo: today(),
	}, reportingStorage(ctx));

	return { ...report, plan: license.plan };
}
