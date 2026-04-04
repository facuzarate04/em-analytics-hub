// ---------------------------------------------------------------------------
// Site Overview dashboard widget
// ---------------------------------------------------------------------------

import type { PluginContext } from "emdash";
import type { LicenseCache } from "../types.js";
import { today, dateNDaysAgo } from "../helpers/date.js";
import { formatNumber } from "../helpers/format.js";
import { calculateTrend } from "../helpers/format.js";
import { queryStatsForRange } from "../storage/stats.js";
import { aggregateStats } from "../helpers/aggregation.js";
import { statsBlock, tableBlock } from "./components.js";

/**
 * Builds the Site Overview dashboard widget.
 * Shows views + visitors (7d) with trends and top 5 pages.
 */
export async function buildWidget(
	ctx: PluginContext,
	_license: LicenseCache,
): Promise<Record<string, unknown>> {
	const items = await queryStatsForRange(
		ctx.storage.daily_stats as any,
		dateNDaysAgo(7),
		today(),
	);
	const agg = aggregateStats(items);

	const prevItems = await queryStatsForRange(
		ctx.storage.daily_stats as any,
		dateNDaysAgo(14),
		dateNDaysAgo(8),
	);
	const prevAgg = aggregateStats(prevItems);

	const viewsTrend = calculateTrend(agg.totalViews, prevAgg.totalViews);
	const visitorsTrend = calculateTrend(agg.totalVisitors, prevAgg.totalVisitors);

	const topPages = Array.from(agg.byPathname.entries())
		.map(([pathname, data]) => ({
			page: pathname,
			views: formatNumber(data.views),
			_sort: data.views,
		}))
		.sort((a, b) => b._sort - a._sort)
		.slice(0, 5);

	return {
		blocks: [
			statsBlock([
				{
					label: "Views (7d)",
					value: formatNumber(agg.totalViews),
					...viewsTrend,
				},
				{
					label: "Visitors (7d)",
					value: formatNumber(agg.totalVisitors),
					...visitorsTrend,
				},
			]),
			tableBlock(
				[
					{ key: "page", label: "Page" },
					{ key: "views", label: "Views" },
				],
				topPages,
			),
		],
	};
}
