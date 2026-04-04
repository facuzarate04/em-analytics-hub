// ---------------------------------------------------------------------------
// Main analytics dashboard page
// ---------------------------------------------------------------------------

import type { PluginContext } from "emdash";
import type { LicenseCache } from "../types.js";
import { today, dateNDaysAgo } from "../helpers/date.js";
import { formatNumber, formatDuration, calculateTrend } from "../helpers/format.js";
import {
	getMaxDateRange,
	isFreePlan,
	canViewEventProperties,
	canViewCountries,
	canViewCampaignIntelligence,
} from "../license/features.js";
import { queryStatsForRange } from "../storage/stats.js";
import { queryCustomEvents, aggregateCustomEvents, aggregateCustomEventTrends } from "../storage/custom-events.js";
import { aggregateStats } from "../helpers/aggregation.js";
import {
	header,
	divider,
	context,
	banner,
	statsBlock,
	tableBlock,
	timeseriesChart,
	pieChart,
	barChart,
	columns,
	rangeForm,
} from "./components.js";

/** Colors for custom event trend lines (top 5 events). */
const EVENT_TREND_COLORS = ["#8B5CF6", "#EC4899", "#F59E0B", "#14B8A6", "#6366F1"];

/**
 * Builds the full Analytics Hub dashboard page.
 * Renders stat cards, charts, tables for the selected date range.
 */
export async function buildDashboard(
	ctx: PluginContext,
	days: number,
	license: LicenseCache,
): Promise<Record<string, unknown>> {
	const maxDays = getMaxDateRange(license);
	const effectiveDays = Math.min(days, maxDays);
	const dateFrom = dateNDaysAgo(effectiveDays);
	const dateTo = today();

	// Current period
	const items = await queryStatsForRange(ctx.storage.daily_stats as any, dateFrom, dateTo);
	const agg = aggregateStats(items);

	// Previous period for trends
	const prevItems = await queryStatsForRange(
		ctx.storage.daily_stats as any,
		dateNDaysAgo(effectiveDays * 2),
		dateNDaysAgo(effectiveDays + 1),
	);
	const prevAgg = aggregateStats(prevItems);

	// Core metrics
	const avgTime = agg.totalTimeCount > 0 ? Math.round(agg.totalTime / agg.totalTimeCount) : 0;
	const readRate = agg.totalViews > 0 ? Math.round((agg.totalReads / agg.totalViews) * 100) : 0;
	const engagedRate = agg.totalViews > 0 ? Math.round((agg.totalEngagedViews / agg.totalViews) * 100) : 0;
	const recircRate = agg.totalViews > 0 ? Math.round((agg.totalRecircs / agg.totalViews) * 100) : 0;

	// Previous period metrics
	const prevAvgTime = prevAgg.totalTimeCount > 0 ? Math.round(prevAgg.totalTime / prevAgg.totalTimeCount) : 0;
	const prevReadRate = prevAgg.totalViews > 0 ? Math.round((prevAgg.totalReads / prevAgg.totalViews) * 100) : 0;
	const prevEngagedRate = prevAgg.totalViews > 0 ? Math.round((prevAgg.totalEngagedViews / prevAgg.totalViews) * 100) : 0;
	const prevRecircRate = prevAgg.totalViews > 0 ? Math.round((prevAgg.totalRecircs / prevAgg.totalViews) * 100) : 0;

	// Trends
	const viewsTrend = calculateTrend(agg.totalViews, prevAgg.totalViews);
	const visitorsTrend = calculateTrend(agg.totalVisitors, prevAgg.totalVisitors);
	const readRateTrend = calculateTrend(readRate, prevReadRate);
	const timeTrend = calculateTrend(avgTime, prevAvgTime);
	const engagedTrend = calculateTrend(engagedRate, prevEngagedRate);
	const recircTrend = calculateTrend(recircRate, prevRecircRate);

	// Range options
	const rangeOptions = [
		{ label: "Last 7 days", value: "7" },
		{ label: "Last 14 days", value: "14" },
		{ label: "Last 30 days", value: "30" },
	];
	if (license.plan !== "free") {
		rangeOptions.push(
			{ label: "Last 90 days", value: "90" },
			{ label: "Last 365 days", value: "365" },
		);
	}

	// ── Build blocks ─────────────────────────────────────────────
	const blocks: Record<string, unknown>[] = [
		header("Analytics Hub"),
		rangeForm(effectiveDays, rangeOptions),

		// Primary stats
		statsBlock([
			{ label: "Views", value: formatNumber(agg.totalViews), ...viewsTrend },
			{ label: "Visitors", value: formatNumber(agg.totalVisitors), ...visitorsTrend },
			{ label: "Read Rate", value: `${readRate}%`, ...readRateTrend },
			{ label: "Avg Time", value: formatDuration(avgTime), ...timeTrend },
		]),

		// Secondary stats
		statsBlock([
			{ label: "Engagement", value: `${engagedRate}%`, ...engagedTrend },
			{ label: "Click-through", value: `${recircRate}%`, ...recircTrend },
			{
				label: "Scroll Completion",
				value: agg.totalScroll25 > 0
					? `${Math.round((agg.totalScroll100 / agg.totalScroll25) * 100)}%`
					: "—",
			},
		]),

		divider(),
	];

	// ── Timeseries chart ─────────────────────────────────────────
	const sortedDates = Array.from(agg.byDate.entries()).sort(([a], [b]) => a.localeCompare(b));

	if (sortedDates.length > 0) {
		const viewsSeries = sortedDates.map(([date, data]) => [new Date(date).getTime(), data.views]);
		const visitorsSeries = sortedDates.map(([date, data]) => [new Date(date).getTime(), data.visitors]);

		blocks.push(
			header("Traffic"),
			timeseriesChart([
				{ name: "Views", data: viewsSeries, color: "#3B82F6" },
				{ name: "Visitors", data: visitorsSeries, color: "#10B981" },
			]),
		);
	}

	// ── Scroll Depth + Referrers side by side ────────────────────
	const hasScroll = agg.totalScroll25 > 0;
	const sortedReferrers = Object.entries(agg.referrers)
		.sort(([, a], [, b]) => b - a)
		.slice(0, 8);
	const hasReferrers = sortedReferrers.length > 0;

	if (hasScroll && hasReferrers) {
		blocks.push(
			columns(
				[
					header("Scroll Depth"),
					barChart(
						["25%", "50%", "75%", "100%"],
						[agg.totalScroll25, agg.totalScroll50, agg.totalScroll75, agg.totalScroll100],
					),
				],
				[
					header("Referrers"),
					pieChart(sortedReferrers.map(([name, value]) => ({ name, value }))),
				],
			),
		);
	} else {
		if (hasScroll) {
			blocks.push(
				header("Scroll Depth"),
				barChart(
					["25%", "50%", "75%", "100%"],
					[agg.totalScroll25, agg.totalScroll50, agg.totalScroll75, agg.totalScroll100],
				),
			);
		}
		if (hasReferrers) {
			blocks.push(
				header("Referrers"),
				pieChart(sortedReferrers.map(([name, value]) => ({ name, value }))),
			);
		}
	}

	// ── Top Pages table ──────────────────────────────────────────
	const topPages = Array.from(agg.byPathname.entries())
		.map(([pathname, data]) => ({
			page: pathname,
			template: data.template || "—",
			collection: data.collection || "—",
			views: formatNumber(data.views),
			visitors: formatNumber(data.visitors.size),
			avgTime: data.timeCount > 0 ? formatDuration(Math.round(data.timeTotal / data.timeCount)) : "—",
			_sort: data.views,
		}))
		.sort((a, b) => b._sort - a._sort)
		.slice(0, 20);

	if (topPages.length > 0) {
		blocks.push(
			header("Top Pages"),
			tableBlock(
				[
					{ key: "page", label: "Page" },
					{ key: "template", label: "Template" },
					{ key: "collection", label: "Collection" },
					{ key: "views", label: "Views" },
					{ key: "visitors", label: "Visitors" },
					{ key: "avgTime", label: "Avg Time" },
				],
				topPages,
			),
		);
	}

	// ── UTM Campaigns (Free: source/medium/campaign counts) ─────
	const campaignEntries = Object.entries(agg.utmCampaigns)
		.filter(([key]) => key !== "")
		.sort(([, a], [, b]) => b - a)
		.slice(0, 10);

	const sourceEntries = Object.entries(agg.utmSources)
		.filter(([key]) => key !== "")
		.sort(([, a], [, b]) => b - a)
		.slice(0, 10);

	const mediumEntries = Object.entries(agg.utmMediums)
		.filter(([key]) => key !== "")
		.sort(([, a], [, b]) => b - a)
		.slice(0, 10);

	if (campaignEntries.length > 0 || sourceEntries.length > 0) {
		blocks.push(header("Campaigns"));

		// Sources table (Free)
		if (sourceEntries.length > 0) {
			blocks.push(
				tableBlock(
					[
						{ key: "source", label: "Source" },
						{ key: "views", label: "Views" },
					],
					sourceEntries.map(([source, count]) => ({
						source,
						views: formatNumber(count),
						_sort: count,
					})),
				),
			);
		}

		// Mediums table (Free)
		if (mediumEntries.length > 0) {
			blocks.push(
				tableBlock(
					[
						{ key: "medium", label: "Medium" },
						{ key: "views", label: "Views" },
					],
					mediumEntries.map(([medium, count]) => ({
						medium,
						views: formatNumber(count),
						_sort: count,
					})),
				),
			);
		}

		// Campaigns table (Free)
		if (campaignEntries.length > 0) {
			blocks.push(
				tableBlock(
					[
						{ key: "campaign", label: "Campaign" },
						{ key: "views", label: "Views" },
					],
					campaignEntries.map(([campaign, count]) => ({
						campaign,
						views: formatNumber(count),
						_sort: count,
					})),
				),
			);
		}

		// Pro upsell for campaign intelligence
		if (!canViewCampaignIntelligence(license)) {
			blocks.push(
				context(
					"Upgrade to Pro for campaign intelligence: compare campaigns, analyze conversion rates, and see which sources drive real engagement.",
				),
			);
		}
	}

	// ── Custom Events (Free: list + counts + trends) ────────────
	try {
		const customEventItems = await queryCustomEvents(
			ctx.storage.custom_events as any,
			dateFrom,
			dateTo,
		);
		const eventCounts = aggregateCustomEvents(customEventItems);
		const eventEntries = Object.entries(eventCounts)
			.sort(([, a], [, b]) => b - a)
			.slice(0, 10);

		if (eventEntries.length > 0) {
			blocks.push(header("Custom Events"));

			// Event list with counts (Free)
			blocks.push(
				tableBlock(
					[
						{ key: "event", label: "Event" },
						{ key: "count", label: "Count" },
					],
					eventEntries.map(([event, count]) => ({
						event,
						count: formatNumber(count),
						_sort: count,
					})),
				),
			);

			// Event trends chart (Free) — simple timeseries per event
			const eventTrends = aggregateCustomEventTrends(customEventItems);
			const trendSeries = eventEntries
				.slice(0, 5) // Top 5 events for the chart
				.map(([name], idx) => ({
					name,
					data: eventTrends[name] ?? [],
					color: EVENT_TREND_COLORS[idx % EVENT_TREND_COLORS.length],
				}))
				.filter((s) => s.data.length > 1);

			if (trendSeries.length > 0) {
				blocks.push(
					timeseriesChart(trendSeries, { height: 250 }),
				);
			}

			// Pro upsell for property breakdowns
			if (!canViewEventProperties(license)) {
				blocks.push(
					context(
						"Upgrade to Pro to see property breakdowns for each event, filter by properties, and build multi-event funnels.",
					),
				);
			}
		}
	} catch {
		// Custom events collection might not be available yet
	}

	// ── Countries (Pro only) ─────────────────────────────────────
	if (canViewCountries(license) && Object.keys(agg.countries).length > 0) {
		const sortedCountries = Object.entries(agg.countries)
			.sort(([, a], [, b]) => b - a)
			.slice(0, 10);

		blocks.push(
			header("Countries"),
			pieChart(sortedCountries.map(([name, value]) => ({ name, value })), { height: 300 }),
		);
	}

	// ── Empty state ──────────────────────────────────────────────
	if (items.length === 0) {
		blocks.push(
			banner(
				"No data yet",
				"Analytics will appear here once visitors start browsing your site. The tracking beacon is automatically injected into all pages.",
			),
		);
	}

	// ── Free tier nudge ──────────────────────────────────────────
	if (isFreePlan(license) && agg.totalViews > 0) {
		blocks.push(
			context(
				"Free plan — understand your site. Upgrade to Pro to connect, convert, and act: funnels, goals, campaign intelligence, integrations, 365-day retention, and up to 3 sites.",
			),
		);
	}

	return { blocks };
}
