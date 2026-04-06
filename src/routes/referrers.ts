// ---------------------------------------------------------------------------
// GET /referrers — Admin referrer breakdown API
// ---------------------------------------------------------------------------

import type { PluginContext, RouteContext } from "emdash";
import { today, dateNDaysAgo } from "../helpers/date.js";
import { getLicense, getMaxDateRange } from "../license/features.js";
import { getReferrersReport } from "../reporting/service.js";
import { reportingBackend, reportingStorage } from "../reporting/backend.js";

export async function handleReferrers(
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
	const limit = Math.min(
		parseInt(url.searchParams.get("limit") ?? "20", 10) || 20,
		50,
	);

	const referrers = await getReferrersReport(reportingBackend, {
		dateFrom: dateNDaysAgo(days),
		dateTo: today(),
		limit,
	}, reportingStorage(ctx));

	return { referrers, plan: license.plan };
}
