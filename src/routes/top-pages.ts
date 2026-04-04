// ---------------------------------------------------------------------------
// GET /top-pages — Admin ranked pages API
// ---------------------------------------------------------------------------

import type { PluginContext, RouteContext } from "emdash";
import { today, dateNDaysAgo } from "../helpers/date.js";
import { getLicense, getMaxDateRange } from "../license/features.js";
import { queryStatsForRange } from "../storage/stats.js";
import { aggregateStats } from "../helpers/aggregation.js";
import { MAX_TOP_PAGES, DEFAULT_TOP_PAGES_LIMIT } from "../constants.js";

/**
 * Returns top pages ranked by views with template/collection info.
 */
export async function handleTopPages(
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
		parseInt(url.searchParams.get("limit") ?? String(DEFAULT_TOP_PAGES_LIMIT), 10) || DEFAULT_TOP_PAGES_LIMIT,
		MAX_TOP_PAGES,
	);

	const dateFrom = dateNDaysAgo(days);
	const dateTo = today();
	const items = await queryStatsForRange(ctx.storage.daily_stats as any, dateFrom, dateTo);
	const agg = aggregateStats(items);

	const pages = Array.from(agg.byPathname.entries())
		.map(([pathname, data]) => ({
			pathname,
			template: data.template,
			collection: data.collection,
			views: data.views,
			visitors: data.visitors.size,
			reads: data.reads,
			readRate: data.views > 0 ? Math.round((data.reads / data.views) * 100) : 0,
			avgTime: data.timeCount > 0 ? Math.round(data.timeTotal / data.timeCount) : 0,
			engagedRate: data.views > 0 ? Math.round((data.engagedViews / data.views) * 100) : 0,
			recircRate: data.views > 0 ? Math.round((data.recircs / data.views) * 100) : 0,
		}))
		.sort((a, b) => b.views - a.views)
		.slice(0, limit);

	return { pages, plan: license.plan };
}
