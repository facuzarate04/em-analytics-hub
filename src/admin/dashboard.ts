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
	isInGracePeriod,
	canViewEventProperties,
	canViewCountries,
	canViewCampaignIntelligence,
} from "../license/features.js";
import { queryStatsForRange } from "../storage/stats.js";
import { queryCustomEvents, aggregateCustomEvents, aggregateCustomEventTrends } from "../storage/custom-events.js";
import { aggregateStats } from "../helpers/aggregation.js";
import {
	header,
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
 * Builds the full Analytics dashboard page.
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
	const planLabel = isFreePlan(license) ? "Free" : license.plan === "pro" ? "Pro" : "Business";
	const rangeOptions = [
		{ label: "Last 7 days", value: "7" },
		{ label: "Last 14 days", value: "14" },
		{ label: "Last 30 days", value: "30" },
	];
	if (!isFreePlan(license)) {
		rangeOptions.push(
			{ label: "Last 90 days", value: "90" },
			{ label: "Last 365 days", value: "365" },
		);
	}

	// ── Build blocks ─────────────────────────────────────────────
	const blocks: Record<string, unknown>[] = [
		header("Analytics"),
		context(`${planLabel} plan \u00b7 Last ${effectiveDays} days \u00b7 ${dateFrom} to ${dateTo}`),
		rangeForm(effectiveDays, rangeOptions),

		// Primary KPIs
		statsBlock([
			{ label: "Views", value: formatNumber(agg.totalViews), ...viewsTrend },
			{ label: "Visitors", value: formatNumber(agg.totalVisitors), ...visitorsTrend },
			{ label: "Read Rate", value: `${readRate}%`, ...readRateTrend },
			{ label: "Avg Time", value: formatDuration(avgTime), ...timeTrend },
		]),

		// Secondary KPIs (compact row)
		statsBlock([
			{ label: "Engagement", value: `${engagedRate}%`, ...engagedTrend },
			{ label: "Recirculation", value: `${recircRate}%`, ...recircTrend },
			{
				label: "Scroll Completion",
				value: agg.totalScroll25 > 0
					? `${Math.round((agg.totalScroll100 / agg.totalScroll25) * 100)}%`
					: "\u2014",
			},
		]),
	];

	// ── Traffic Over Time ────────────────────────────────────────
	const sortedDates = Array.from(agg.byDate.entries()).sort(([a], [b]) => a.localeCompare(b));

	if (sortedDates.length > 0) {
		const viewsSeries = sortedDates.map(([date, data]) => [new Date(date).getTime(), data.views]);
		const visitorsSeries = sortedDates.map(([date, data]) => [new Date(date).getTime(), data.visitors]);

		blocks.push(
			header("Traffic Over Time"),
			timeseriesChart(
				[
					{ name: "Views", data: viewsSeries, color: "#3B82F6" },
					{ name: "Visitors", data: visitorsSeries, color: "#10B981" },
				],
				{ height: 220, style: sortedDates.length <= 2 ? "bar" : "line" },
			),
		);
	}

	// ── Scroll Depth + Referrers ─────────────────────────────────
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
						{ height: 200 },
					),
				],
				[
					header("Referrers"),
					pieChart(sortedReferrers.map(([name, value]) => ({ name, value })), { height: 200 }),
					tableBlock(
						[
							{ key: "domain", label: "Source" },
							{ key: "views", label: "Views" },
						],
						sortedReferrers.slice(0, 3).map(([domain, count]) => ({
							domain,
							views: formatNumber(count),
						})),
					),
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
					{ height: 200 },
				),
			);
		}
		if (hasReferrers) {
			blocks.push(
				header("Referrers"),
				pieChart(sortedReferrers.map(([name, value]) => ({ name, value })), { height: 200 }),
				tableBlock(
					[
						{ key: "domain", label: "Source" },
						{ key: "views", label: "Views" },
					],
					sortedReferrers.slice(0, 3).map(([domain, count]) => ({
						domain,
						views: formatNumber(count),
					})),
				),
			);
		}
	}

	// ── Top Pages ────────────────────────────────────────────────
	const hasTemplateData = Array.from(agg.byPathname.values()).some((d) => !!d.template);
	const hasCollectionData = Array.from(agg.byPathname.values()).some((d) => !!d.collection);

	const topPages = Array.from(agg.byPathname.entries())
		.map(([pathname, data]) => {
			const row: Record<string, unknown> = {
				page: pathname,
				views: formatNumber(data.views),
				visitors: formatNumber(data.visitors.size),
				avgTime: data.timeCount > 0 ? formatDuration(Math.round(data.timeTotal / data.timeCount)) : "\u2014",
				_sort: data.views,
			};
			if (hasTemplateData) row.template = data.template || "\u2014";
			if (hasCollectionData) row.collection = data.collection || "\u2014";
			return row;
		})
		.sort((a, b) => (b._sort as number) - (a._sort as number))
		.slice(0, 12);

	if (topPages.length > 0) {
		const topPagesColumns: Array<{ key: string; label: string }> = [
			{ key: "page", label: "Page" },
		];
		if (hasTemplateData) topPagesColumns.push({ key: "template", label: "Template" });
		if (hasCollectionData) topPagesColumns.push({ key: "collection", label: "Collection" });
		topPagesColumns.push(
			{ key: "views", label: "Views" },
			{ key: "visitors", label: "Visitors" },
			{ key: "avgTime", label: "Avg Time" },
		);

		blocks.push(
			header("Top Pages"),
			tableBlock(topPagesColumns, topPages),
		);
	}

	// ── Campaigns (unified table) ────────────────────────────────
	const campaignRows: Array<Record<string, unknown>> = [];

	for (const [source, count] of Object.entries(agg.utmSources)) {
		if (source) campaignRows.push({ type: "Source", value: source, views: formatNumber(count), _sort: count });
	}
	for (const [medium, count] of Object.entries(agg.utmMediums)) {
		if (medium) campaignRows.push({ type: "Medium", value: medium, views: formatNumber(count), _sort: count });
	}
	for (const [campaign, count] of Object.entries(agg.utmCampaigns)) {
		if (campaign) campaignRows.push({ type: "Campaign", value: campaign, views: formatNumber(count), _sort: count });
	}

	campaignRows.sort((a, b) => (b._sort as number) - (a._sort as number));

	if (campaignRows.length > 0) {
		blocks.push(
			header("Campaigns"),
			tableBlock(
				[
					{ key: "type", label: "Type" },
					{ key: "value", label: "Value" },
					{ key: "views", label: "Views" },
				],
				campaignRows.slice(0, 15),
			),
		);

		if (!canViewCampaignIntelligence(license)) {
			blocks.push(
				context("Upgrade to Pro to compare campaigns and track conversions."),
			);
		}
	}

	// ── Custom Events ────────────────────────────────────────────
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
			blocks.push(
				header("Custom Events"),
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

			// Event trends chart (Free)
			const eventTrends = aggregateCustomEventTrends(customEventItems);
			const trendSeries = eventEntries
				.slice(0, 5)
				.map(([name], idx) => ({
					name,
					data: eventTrends[name] ?? [],
					color: EVENT_TREND_COLORS[idx % EVENT_TREND_COLORS.length],
				}))
				.filter((s) => s.data.length > 1);

			if (trendSeries.length > 0) {
				blocks.push(timeseriesChart(trendSeries, { height: 200 }));
			}

			if (!canViewEventProperties(license)) {
				blocks.push(
					context("Upgrade to Pro for property breakdowns, filters, and multi-event funnels."),
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
			pieChart(sortedCountries.map(([name, value]) => ({ name, value })), { height: 240 }),
		);
	}

	// ── Empty state ──────────────────────────────────────────────
	if (items.length === 0) {
		blocks.push(
			banner(
				"No data yet",
				"Analytics will appear here once visitors start browsing your site.",
			),
		);
	}

	// ── License section ──────────────────────────────────────────
	blocks.push(header("License"));

	if (isFreePlan(license)) {
		blocks.push(
			statsBlock([
				{ label: "Plan", value: "Free" },
				{ label: "Status", value: "Active" },
			]),
			banner(
				"Upgrade to Pro",
				"Paste your license key in the plugin settings to activate Pro. Unlock funnels, goals, campaign intelligence, and 365-day retention.",
			),
		);
	} else {
		// Pro/Business — show status and deactivate option
		const planName = license.plan === "pro" ? "Pro" : "Business";
		const statusItems = [
			{ label: "Plan", value: planName },
			{ label: "Status", value: isInGracePeriod(license) ? "Grace Period" : "Active" },
		];
		if (license.siteUrl) {
			statusItems.push({ label: "Site", value: license.siteUrl });
		}

		blocks.push(statsBlock(statusItems));

		if (isInGracePeriod(license)) {
			blocks.push(
				banner(
					"Validation failed",
					"Pro features remain active during the grace period. The plugin will retry automatically.",
					"warning",
				),
			);
		}

		blocks.push({
			type: "form",
			block_id: "license-actions",
			fields: [],
			submit: { label: "Deactivate License", action_id: "deactivate_license" },
		});
	}

	return { blocks };
}
