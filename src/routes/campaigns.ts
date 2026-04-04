// ---------------------------------------------------------------------------
// GET /campaigns — Admin UTM campaign stats API
// ---------------------------------------------------------------------------

import type { PluginContext, RouteContext } from "emdash";
import { today, dateNDaysAgo } from "../helpers/date.js";
import { getLicense, getMaxDateRange } from "../license/features.js";
import { queryStatsForRange } from "../storage/stats.js";
import { aggregateStats } from "../helpers/aggregation.js";

/**
 * Returns UTM campaign performance data (sources, mediums, campaigns).
 */
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

	const dateFrom = dateNDaysAgo(days);
	const dateTo = today();
	const items = await queryStatsForRange(ctx.storage.daily_stats as any, dateFrom, dateTo);
	const agg = aggregateStats(items);

	const sortEntries = (record: Record<string, number>, limit = 20) =>
		Object.entries(record)
			.filter(([key]) => key !== "")
			.sort(([, a], [, b]) => b - a)
			.slice(0, limit)
			.map(([name, count]) => ({ name, count }));

	return {
		sources: sortEntries(agg.utmSources),
		mediums: sortEntries(agg.utmMediums),
		campaigns: sortEntries(agg.utmCampaigns),
		plan: license.plan,
	};
}
