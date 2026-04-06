// ---------------------------------------------------------------------------
// GET /stats — Admin aggregated stats API
// ---------------------------------------------------------------------------

import type { PluginContext, RouteContext } from "emdash";
import { today, dateNDaysAgo } from "../helpers/date.js";
import { getLicense, hasFeature, getMaxDateRange } from "../license/features.js";
import { getStatsReport } from "../reporting/service.js";
import { reportingBackend, reportingStorage } from "../reporting/backend.js";

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

	const report = await getStatsReport(reportingBackend(), {
		dateFrom: dateNDaysAgo(days),
		dateTo: today(),
		pathname,
	}, reportingStorage(ctx));

	const response: Record<string, unknown> = {
		plan: license.plan,
		...report,
	};

	if (!hasFeature(license, "countries")) {
		delete response.countries;
	}

	return response;
}
