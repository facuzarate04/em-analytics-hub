// ---------------------------------------------------------------------------
// GET /stats — Admin aggregated stats API
// ---------------------------------------------------------------------------

import type { PluginContext, RouteContext } from "emdash";
import type { LicenseCache } from "../types.js";
import { today, dateNDaysAgo } from "../helpers/date.js";
import { getLicense, hasFeature, getMaxDateRange } from "../license/features.js";
import { queryStatsForRange } from "../storage/stats.js";
import { aggregateStats } from "../helpers/aggregation.js";

/**
 * Returns aggregated analytics stats for a date range.
 * Supports optional pathname filter and respects plan limits.
 */
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

	const dateFrom = dateNDaysAgo(days);
	const dateTo = today();
	const items = await queryStatsForRange(ctx.storage.daily_stats as any, dateFrom, dateTo, pathname);
	const agg = aggregateStats(items);

	const avgTime = agg.totalTimeCount > 0 ? Math.round(agg.totalTime / agg.totalTimeCount) : 0;
	const readRate = agg.totalViews > 0 ? Math.round((agg.totalReads / agg.totalViews) * 100) : 0;
	const engagedRate = agg.totalViews > 0 ? Math.round((agg.totalEngagedViews / agg.totalViews) * 100) : 0;
	const recircRate = agg.totalViews > 0 ? Math.round((agg.totalRecircs / agg.totalViews) * 100) : 0;

	const response: Record<string, unknown> = {
		plan: license.plan,
		views: agg.totalViews,
		visitors: agg.totalVisitors,
		reads: agg.totalReads,
		readRate,
		avgTimeSeconds: avgTime,
		engagedViews: agg.totalEngagedViews,
		engagedRate,
		recircs: agg.totalRecircs,
		recircRate,
		scrollDepth: {
			"25": agg.totalScroll25,
			"50": agg.totalScroll50,
			"75": agg.totalScroll75,
			"100": agg.totalScroll100,
		},
		referrers: agg.referrers,
		utmSources: agg.utmSources,
		utmMediums: agg.utmMediums,
		utmCampaigns: agg.utmCampaigns,
		daily: Object.fromEntries(agg.byDate),
	};

	if (hasFeature(license, "countries")) {
		response.countries = agg.countries;
	}

	return response;
}
