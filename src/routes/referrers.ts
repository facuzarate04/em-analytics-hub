// ---------------------------------------------------------------------------
// GET /referrers — Admin referrer breakdown API
// ---------------------------------------------------------------------------

import type { PluginContext, RouteContext } from "emdash";
import { today, dateNDaysAgo } from "../helpers/date.js";
import { getLicense, getMaxDateRange } from "../license/features.js";
import { getReferrersReport } from "../reporting/service.js";
import type { ReportingStorage } from "../reporting/types.js";
import { PortableReportingBackend } from "../backends/portable/reporting.js";

const backend = new PortableReportingBackend();

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

	const storage: ReportingStorage = {
		daily_stats: ctx.storage.daily_stats as ReportingStorage["daily_stats"],
	};

	const referrers = await getReferrersReport(backend, {
		dateFrom: dateNDaysAgo(days),
		dateTo: today(),
		limit,
	}, storage);

	return { referrers, plan: license.plan };
}
