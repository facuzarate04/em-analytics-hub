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
	canViewEventTrends,
	canViewCountries,
	canViewCampaignIntelligence,
	canViewGoals,
	canViewFormsAnalytics,
	canComparePeriods,
} from "../license/features.js";
import { queryStatsForRange } from "../storage/stats.js";
import {
	queryCustomEvents,
	aggregateCustomEvents,
	aggregateCustomEventTrends,
	aggregateCustomEventProperties,
} from "../storage/custom-events.js";
import { aggregateStats } from "../helpers/aggregation.js";
import { aggregateCampaignIntelligence } from "../helpers/campaign-intelligence.js";
import { aggregateConfiguredFunnel, aggregateFunnel, buildDefaultFunnelSteps } from "../helpers/funnels.js";
import { aggregateConfiguredGoals, aggregateGoals } from "../helpers/goals.js";
import { aggregateFormsAnalytics } from "../helpers/forms-analytics.js";
import { queryRawEvents } from "../storage/events.js";
import { loadFunnelDefinitions, loadGoalDefinitions } from "./config.js";
import {
	header,
	context,
	banner,
	divider,
	statsBlock,
	tableBlock,
	timeseriesChart,
	pieChart,
	barChart,
	rangeForm,
} from "./components.js";

/** Colors for custom event trend lines. */
const EVENT_TREND_COLORS = ["#8B5CF6", "#EC4899", "#F59E0B", "#14B8A6", "#6366F1"];

function topEntry(record: Record<string, number>): [string, number] | null {
	return Object.entries(record)
		.filter(([name]) => !!name)
		.sort(([, a], [, b]) => b - a)[0] ?? null;
}

/**
 * Builds the full Analytics dashboard page.
 * Compact layout to stay within EmDash's block rendering limits.
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
	const isPro = !isFreePlan(license);

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

	// Metrics
	const avgTime = agg.totalTimeCount > 0 ? Math.round(agg.totalTime / agg.totalTimeCount) : 0;
	const readRate = agg.totalViews > 0 ? Math.round((agg.totalReads / agg.totalViews) * 100) : 0;
	const engagedRate = agg.totalViews > 0 ? Math.round((agg.totalEngagedViews / agg.totalViews) * 100) : 0;
	const recircRate = agg.totalViews > 0 ? Math.round((agg.totalRecircs / agg.totalViews) * 100) : 0;
	const prevAvgTime = prevAgg.totalTimeCount > 0 ? Math.round(prevAgg.totalTime / prevAgg.totalTimeCount) : 0;
	const prevReadRate = prevAgg.totalViews > 0 ? Math.round((prevAgg.totalReads / prevAgg.totalViews) * 100) : 0;
	const prevEngagedRate = prevAgg.totalViews > 0 ? Math.round((prevAgg.totalEngagedViews / prevAgg.totalViews) * 100) : 0;
	const prevRecircRate = prevAgg.totalViews > 0 ? Math.round((prevAgg.totalRecircs / prevAgg.totalViews) * 100) : 0;

	const viewsTrend = calculateTrend(agg.totalViews, prevAgg.totalViews);
	const visitorsTrend = calculateTrend(agg.totalVisitors, prevAgg.totalVisitors);
	const readRateTrend = calculateTrend(readRate, prevReadRate);
	const timeTrend = calculateTrend(avgTime, prevAvgTime);
	const engagedTrend = calculateTrend(engagedRate, prevEngagedRate);
	const recircTrend = calculateTrend(recircRate, prevRecircRate);
	const scrollCompletion = agg.totalScroll25 > 0
		? Math.round((agg.totalScroll100 / agg.totalScroll25) * 100)
		: 0;

	// Plan label and range options
	const planLabel = isPro ? (license.plan === "pro" ? "Pro" : "Business") : "Free";
	const rangeOptions = [
		{ label: "Last 7 days", value: "7" },
		{ label: "Last 14 days", value: "14" },
		{ label: "Last 30 days", value: "30" },
	];
	if (isPro) {
		rangeOptions.push(
			{ label: "Last 90 days", value: "90" },
			{ label: "Last 365 days", value: "365" },
		);
	}

	const topReferrer = topEntry(agg.referrers);
	const topCampaign = topEntry(agg.utmCampaigns);
	const topPage = Array.from(agg.byPathname.entries())
		.sort(([, a], [, b]) => b.views - a.views)[0];
	const sortedDates = Array.from(agg.byDate.entries()).sort(([a], [b]) => a.localeCompare(b));

	const highlights: string[] = [];
	if (topPage) highlights.push(`Top page: ${topPage[0]} (${formatNumber(topPage[1].views)} views)`);
	if (topReferrer) highlights.push(`Top source: ${topReferrer[0]} (${formatNumber(topReferrer[1])})`);
	if (topCampaign) highlights.push(`Top campaign: ${topCampaign[0]} (${formatNumber(topCampaign[1])})`);

	// ── Build blocks (compact — EmDash has a block render limit) ──
	const blocks: Record<string, unknown>[] = [
		header("Analytics"),
		context(`${planLabel} plan \u00b7 Last ${effectiveDays} days \u00b7 ${dateFrom} to ${dateTo}`),
		rangeForm(effectiveDays, rangeOptions),
	];

	blocks.push(
		banner(
			"Overview",
			isPro
			? "Pro is active. Traffic, engagement, funnels, and campaign insights are available below."
			: "Core analytics are active. Upgrade to Pro for funnels, campaign intelligence, and deeper event insights.",
		),
	);

	if (highlights.length > 0) {
		blocks.push(context(highlights.join(" \u00b7 ")));
	}

	blocks.push(
		context("Views are total pageviews. Visitors are unique people in the selected range. Read Rate shows how many views reached the read threshold."),
	);

	blocks.push(
		statsBlock([
			{ label: "Views", value: formatNumber(agg.totalViews), ...viewsTrend },
			{ label: "Visitors", value: formatNumber(agg.totalVisitors), ...visitorsTrend },
			{ label: "Read Rate", value: `${readRate}%`, ...readRateTrend },
			{ label: "Avg Time", value: formatDuration(avgTime), ...timeTrend },
		]),
		statsBlock([
			{ label: "Engagement", value: `${engagedRate}%`, ...engagedTrend },
			{ label: "Recirculation", value: `${recircRate}%`, ...recircTrend },
			{ label: "Scroll Completion", value: scrollCompletion > 0 ? `${scrollCompletion}%` : "\u2014" },
		]),
	);

	if (canComparePeriods(license) && prevAgg.totalViews > 0) {
		blocks.push(
			header("Period Comparison"),
			context("Compare the current range with the immediately previous period."),
			tableBlock(
				[
					{ key: "metric", label: "Metric" },
					{ key: "current", label: "Current" },
					{ key: "previous", label: "Previous" },
					{ key: "change", label: "Change" },
				],
				[
					{ metric: "Views", current: formatNumber(agg.totalViews), previous: formatNumber(prevAgg.totalViews), change: viewsTrend.trend ?? "0%" },
					{ metric: "Visitors", current: formatNumber(agg.totalVisitors), previous: formatNumber(prevAgg.totalVisitors), change: visitorsTrend.trend ?? "0%" },
					{ metric: "Read Rate", current: `${readRate}%`, previous: `${prevReadRate}%`, change: readRateTrend.trend ?? "0%" },
					{ metric: "Engagement", current: `${engagedRate}%`, previous: `${prevEngagedRate}%`, change: engagedTrend.trend ?? "0%" },
				],
			),
		);
	}

	if (sortedDates.length > 0) {
		blocks.push(
			divider(),
			banner("Traffic", "Views and unique visitors over time."),
			context("Use this to spot growth, spikes, or quiet periods before drilling into sources or content."),
			header("Traffic Over Time"),
			timeseriesChart(
				[
					{ name: "Views", data: sortedDates.map(([date, d]) => [new Date(date).getTime(), d.views]), color: "#3B82F6" },
					{ name: "Visitors", data: sortedDates.map(([date, d]) => [new Date(date).getTime(), d.visitors]), color: "#10B981" },
				],
				{ height: 200, style: sortedDates.length <= 2 ? "bar" : "line" },
			),
		);
	}
	const scrollValues = [agg.totalScroll25, agg.totalScroll50, agg.totalScroll75, agg.totalScroll100];
	const hasScrollData = scrollValues.some((value) => value > 0);
	const topReferrers = Object.entries(agg.referrers)
		.filter(([name]) => !!name)
		.sort(([, a], [, b]) => b - a)
		.slice(0, 5);

	if (topReferrers.length > 0 || canViewCountries(license) || canViewCampaignIntelligence(license)) {
		blocks.push(
			divider(),
			banner("Acquisition", "Where visitors come from and which campaigns drive quality traffic."),
		);
	}

	if (hasScrollData) {
		blocks.push(
			divider(),
			banner("Behavior", "How visitors consume content once they arrive."),
			context("Scroll Depth shows how far visitors make it down the page. Recirculation tracks visitors who move into another tracked page."),
			header("Scroll Depth"),
			barChart(["25%", "50%", "75%", "100%"], scrollValues, { color: "#6366F1", height: 220 }),
		);
	}

	if (topReferrers.length > 0) {
		blocks.push(
			header("Referrers"),
			pieChart(topReferrers.map(([name, value]) => ({ name, value })), { height: 220 }),
			tableBlock(
				[{ key: "source", label: "Source" }, { key: "views", label: "Views" }],
				topReferrers.map(([source, views]) => ({ source, views: formatNumber(views) })),
			),
		);
	}

	if (canViewCountries(license)) {
		const topCountries = Object.entries(agg.countries)
			.filter(([name]) => !!name)
			.sort(([, a], [, b]) => b - a)
			.slice(0, 8);

		if (topCountries.length > 0) {
			blocks.push(
				header("Countries"),
				tableBlock(
					[{ key: "country", label: "Country" }, { key: "views", label: "Views" }],
					topCountries.map(([country, views]) => ({ country, views: formatNumber(views) })),
				),
			);
		}
	}

	// ── Top Pages ────────────────────────────────────────────────
	const hasTemplate = Array.from(agg.byPathname.values()).some((d) => !!d.template);
	const hasCollection = Array.from(agg.byPathname.values()).some((d) => !!d.collection);
	const topPages = Array.from(agg.byPathname.entries())
		.map(([pathname, data]) => {
			const row: Record<string, unknown> = {
				page: pathname,
				views: formatNumber(data.views),
				visitors: formatNumber(data.visitors.size),
				_sort: data.views,
			};
			if (hasTemplate) row.template = data.template || "\u2014";
			if (hasCollection) row.collection = data.collection || "\u2014";
			return row;
		})
		.sort((a, b) => (b._sort as number) - (a._sort as number))
		.slice(0, 10);

	if (topPages.length > 0) {
		const cols: Array<{ key: string; label: string }> = [{ key: "page", label: "Page" }];
		if (hasTemplate) cols.push({ key: "template", label: "Template" });
		if (hasCollection) cols.push({ key: "collection", label: "Collection" });
		cols.push({ key: "views", label: "Views" }, { key: "visitors", label: "Visitors" });
		blocks.push(
			header("Top Pages"),
			context("Your highest-traffic routes in the current range."),
			tableBlock(cols, topPages),
		);
	}

	// ── Funnels v1 ───────────────────────────────────────────────
	if (isPro) {
		try {
			const rawEvents = await queryRawEvents(ctx.storage.events as any, dateFrom, dateTo);
			const customEventItems = await queryCustomEvents(ctx.storage.custom_events as any, dateFrom, dateTo);
			const configuredFunnels = (await loadFunnelDefinitions(ctx)).filter((item) => item.active);
			const configuredGoals = (await loadGoalDefinitions(ctx)).filter((item) => item.active);
			const funnelSets = configuredFunnels.length > 0
				? configuredFunnels.map((funnel) => ({
					name: funnel.name,
					rows: aggregateConfiguredFunnel(rawEvents, funnel),
				})).filter((funnel) => funnel.rows.length >= 2)
				: (() => {
					const funnelSteps = buildDefaultFunnelSteps(rawEvents);
					const rows = aggregateFunnel(rawEvents, funnelSteps);
					return rows.length >= 2 ? [{ name: "Detected Funnel", rows }] : [];
				})();
			const goalRows = canViewGoals(license)
				? configuredGoals.length > 0
					? aggregateConfiguredGoals({
						goals: configuredGoals,
						rawEvents,
						customEvents: customEventItems,
						totalVisitors: agg.totalVisitors,
					})
					: aggregateGoals(customEventItems, agg.totalVisitors)
				: [];
			const formRows = canViewFormsAnalytics(license) ? aggregateFormsAnalytics(customEventItems, agg.totalVisitors) : [];

			if (funnelSets.length > 0) {
				blocks.push(
					divider(),
					banner("Conversion", configuredFunnels.length > 0
						? "Your configured funnels and goals turn tracked events into a business-ready conversion view."
						: "A simple funnel built from the real sequence of tracked visitor events."),
					context("Unique Visitors counts people who reached each step. Total Completions counts every time a goal or form was completed, including repeat actions from the same visitor."),
					context("Step Conv. is the share of first-step visitors who reached each step. Drop-off compares each step with the previous one."),
					header("Funnels"),
				);

				for (const funnel of funnelSets) {
					blocks.push(
						context(funnel.name),
						tableBlock(
							[
								{ key: "step", label: "Step" },
								{ key: "visitors", label: "Unique Visitors" },
								{ key: "conversionRate", label: "Step Conv." },
								{ key: "dropOffRate", label: "Drop-off" },
							],
							funnel.rows.map((row) => ({
								step: row.step,
								visitors: formatNumber(row.visitors),
								conversionRate: `${row.conversionRate}%`,
								dropOffRate: `${row.dropOffRate}%`,
							})),
						),
					);
				}
				} else {
					blocks.push(
						divider(),
						banner("Conversion", "Set up a funnel in the Funnels page or keep tracking pageviews and events to let Analytics Hub detect one automatically."),
					);
				}

			if (goalRows.length > 0) {
				blocks.push(
					header("Goals"),
					tableBlock(
						[
							{ key: "goal", label: "Goal" },
							{ key: "completions", label: "Total Completions" },
							{ key: "visitors", label: "Unique Visitors" },
							{ key: "conversionRate", label: "Visitor Conv." },
						],
						goalRows.map((row) => ({
							goal: row.goal,
							completions: formatNumber(row.completions),
							visitors: formatNumber(row.visitors),
							conversionRate: `${row.conversionRate}%`,
						})),
					),
				);
			}

			if (formRows.length > 0) {
				blocks.push(
					header("Forms"),
					tableBlock(
						[
							{ key: "form", label: "Form" },
							{ key: "event", label: "Event" },
							{ key: "submissions", label: "Total Submissions" },
							{ key: "visitors", label: "Unique Visitors" },
							{ key: "submitRate", label: "Visitor Rate" },
						],
						formRows.map((row) => ({
							form: row.form,
							event: row.event,
							submissions: formatNumber(row.submissions),
							visitors: formatNumber(row.visitors),
							submitRate: `${row.submitRate}%`,
						})),
					),
				);
			}
			} catch (error) {
				console.error("[analytics-hub] Failed to build funnels", error);
			}
		}

	// ── Campaigns / Campaign Intelligence ────────────────────────
	if (canViewCampaignIntelligence(license)) {
		const sourceMetrics = aggregateCampaignIntelligence(items, "source");
		if (sourceMetrics.length > 0) {
			blocks.push(
				header("Campaign Intelligence"),
				context("These source-level quality metrics are directional estimates based on tracked campaign traffic share."),
				tableBlock(
					[
						{ key: "name", label: "Source" },
						{ key: "views", label: "Views" },
						{ key: "readRate", label: "Read Rate" },
						{ key: "engagedRate", label: "Engaged" },
						{ key: "recircRate", label: "Recirc" },
					],
					sourceMetrics.slice(0, 8).map((m) => ({
						name: m.name,
						views: formatNumber(m.views),
						readRate: `${m.readRate}%`,
						engagedRate: `${m.engagedRate}%`,
						recircRate: `${m.recircRate}%`,
					})),
				),
			);
		}
	} else {
		const campaignRows: Array<Record<string, unknown>> = [];
		for (const [s, c] of Object.entries(agg.utmSources)) { if (s) campaignRows.push({ type: "Source", value: s, views: formatNumber(c), _sort: c }); }
		for (const [m, c] of Object.entries(agg.utmMediums)) { if (m) campaignRows.push({ type: "Medium", value: m, views: formatNumber(c), _sort: c }); }
		for (const [ca, c] of Object.entries(agg.utmCampaigns)) { if (ca) campaignRows.push({ type: "Campaign", value: ca, views: formatNumber(c), _sort: c }); }
		campaignRows.sort((a, b) => (b._sort as number) - (a._sort as number));
		if (campaignRows.length > 0) {
			blocks.push(
				header("Campaigns"),
				tableBlock([{ key: "type", label: "Type" }, { key: "value", label: "Value" }, { key: "views", label: "Views" }], campaignRows.slice(0, 10)),
				context("Upgrade to Pro for campaign intelligence with engagement metrics per source."),
			);
		}
	}

	// ── Custom Events + Property Breakdowns ──────────────────────
	try {
		const customEventItems = await queryCustomEvents(ctx.storage.custom_events as any, dateFrom, dateTo);
		const eventCounts = aggregateCustomEvents(customEventItems);
		const eventEntries = Object.entries(eventCounts).sort(([, a], [, b]) => b - a).slice(0, 8);

		if (eventEntries.length > 0) {
			blocks.push(
				divider(),
				banner("Instrumentation", "Custom events let you track product and conversion actions beyond pageviews."),
				context("Custom Events are named actions tracked from the site. Properties add extra context like variant, plan, form, or source."),
				header("Custom Events"),
				tableBlock(
					[{ key: "event", label: "Event" }, { key: "count", label: "Count" }],
					eventEntries.map(([event, count]) => ({ event, count: formatNumber(count) })),
				),
			);

			if (canViewEventTrends(license)) {
				const eventTrends = aggregateCustomEventTrends(customEventItems);
				const trendSeries = eventEntries
					.slice(0, 3)
					.map(([event], index) => ({
						name: event,
						data: eventTrends[event] ?? [],
						color: EVENT_TREND_COLORS[index % EVENT_TREND_COLORS.length],
					}))
					.filter((series) => series.data.length > 0);

				if (trendSeries.length > 0) {
					blocks.push(
						header("Event Trends"),
						timeseriesChart(trendSeries, { height: 200, style: "line" }),
					);
				}
			}

			// Pro: Property breakdowns for top event
			if (canViewEventProperties(license)) {
				const topEventName = eventEntries[0][0];
				const propBreakdowns = aggregateCustomEventProperties(customEventItems, topEventName);
				const propKeys = Object.keys(propBreakdowns).slice(0, 2);
				if (propKeys.length > 0) {
					blocks.push(header(`Properties: ${topEventName}`));
					for (const propKey of propKeys) {
						const values = Object.entries(propBreakdowns[propKey]).sort(([, a], [, b]) => b - a).slice(0, 5);
						blocks.push(tableBlock([{ key: "value", label: propKey }, { key: "count", label: "Count" }], values.map(([v, c]) => ({ value: v, count: formatNumber(c) }))));
					}
				}
			} else {
				blocks.push(context("Upgrade to Pro for event property breakdowns and funnels."));
			}
		}
		else {
			blocks.push(
				divider(),
				banner("Instrumentation", "Custom events let you track product and conversion actions beyond pageviews."),
				banner("No custom events yet", "Call window.emAnalytics.track(name, props) from your site to start populating this view."),
			);
		}
	} catch (error) {
		console.error("[analytics-hub] Failed to build custom events section", error);
	}

	// ── Export + License (compact footer) ─────────────────────────
	if (isPro) {
		const planName = license.plan === "pro" ? "Pro" : "Business";
		const statusLabel = isInGracePeriod(license) ? "Grace Period" : "Active";
		blocks.push(
			divider(),
			banner("Operations", "Pro is active for this site. Configure reusable goals and funnels from the Goals and Funnels pages in the plugin navigation."),
			context(`License: ${planName} \u00b7 ${statusLabel}${license.siteUrl ? ` \u00b7 ${license.siteUrl}` : ""}`),
		);
	} else {
		if (agg.totalViews > 0) {
			blocks.push(banner("Free plan active", "Add your Pro License Key in plugin settings to unlock goals, funnels, event properties, countries, and 365-day retention."));
		}
	}

	// ── Empty state ──────────────────────────────────────────────
	if (items.length === 0) {
		blocks.push(banner("No data yet", "Analytics will appear here once visitors start browsing your site."));
	}

	return { blocks };
}
