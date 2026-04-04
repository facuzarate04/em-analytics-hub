// ---------------------------------------------------------------------------
// GET /referrers — Admin referrer breakdown API
// ---------------------------------------------------------------------------

import type { PluginContext, RouteContext } from "emdash";
import { today, dateNDaysAgo } from "../helpers/date.js";
import { getLicense, getMaxDateRange } from "../license/features.js";
import { queryStatsForRange } from "../storage/stats.js";
import { aggregateStats } from "../helpers/aggregation.js";

/**
 * Returns referrer breakdown sorted by count.
 */
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

	const dateFrom = dateNDaysAgo(days);
	const dateTo = today();
	const items = await queryStatsForRange(ctx.storage.daily_stats as any, dateFrom, dateTo);
	const agg = aggregateStats(items);

	const referrers = Object.entries(agg.referrers)
		.sort(([, a], [, b]) => b - a)
		.slice(0, limit)
		.map(([domain, count]) => ({ domain, count }));

	return { referrers, plan: license.plan };
}
