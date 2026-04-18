// ---------------------------------------------------------------------------
// Main analytics dashboard page
// ---------------------------------------------------------------------------

import type { PluginContext } from "emdash";
import { dateNDaysAgo, today } from "../helpers/date.js";
import { formatNumber, formatDuration, calculateTrend } from "../helpers/format.js";
import { MAX_DATE_RANGE_DAYS } from "../constants.js";
import { getCustomEventsReport, getPropertyBreakdownsReport, getGoalsReport, getFormsAnalyticsReport, getFunnelsReport } from "../reporting/service.js";
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
import { getStatsReport, getTopPagesReport, getCampaignIntelligenceReport } from "../reporting/service.js";
import { reportingBackend, reportingStorage } from "../reporting/backend.js";

const EVENT_TREND_COLORS = ["#8B5CF6", "#EC4899", "#F59E0B", "#14B8A6", "#6366F1"];

function topEntry(record: Record<string, number>): [string, number] | null {
	return Object.entries(record)
		.filter(([name]) => !!name)
		.sort(([, a], [, b]) => b - a)[0] ?? null;
}

export async function buildDashboard(
	ctx: PluginContext,
	days: number,
): Promise<Record<string, unknown>> {
	const effectiveDays = Math.min(days, MAX_DATE_RANGE_DAYS);
	const dateFrom = dateNDaysAgo(effectiveDays);
	const dateTo = today();
	const storage = reportingStorage(ctx);
	const backend = reportingBackend();

	const [report, prevReport, topPages] = await Promise.all([
		getStatsReport(backend, { dateFrom, dateTo }, storage),
		getStatsReport(backend, {
			dateFrom: dateNDaysAgo(effectiveDays * 2),
			dateTo: dateNDaysAgo(effectiveDays + 1),
		}, storage),
		getTopPagesReport(backend, { dateFrom, dateTo, limit: 10 }, storage),
	]);

	// Metrics from reports
	const scrollCompletion = report.scrollDepth["25"] > 0
		? Math.round((report.scrollDepth["100"] / report.scrollDepth["25"]) * 100)
		: 0;

	const viewsTrend = calculateTrend(report.views, prevReport.views);
	const visitorsTrend = calculateTrend(report.visitors, prevReport.visitors);
	const readRateTrend = calculateTrend(report.readRate, prevReport.readRate);
	const timeTrend = calculateTrend(report.avgTimeSeconds, prevReport.avgTimeSeconds);
	const engagedTrend = calculateTrend(report.engagedRate, prevReport.engagedRate);
	const recircTrend = calculateTrend(report.recircRate, prevReport.recircRate);

	const rangeOptions = [
		{ label: "Last 7 days", value: "7" },
		{ label: "Last 14 days", value: "14" },
		{ label: "Last 30 days", value: "30" },
		{ label: "Last 90 days", value: "90" },
		{ label: "Last 365 days", value: "365" },
	];

	const topReferrer = topEntry(report.referrers);
	const topCampaign = topEntry(report.utmCampaigns);
	const topPage = topPages[0] ?? null;
	const sortedDates = Object.entries(report.daily).sort(([a], [b]) => a.localeCompare(b));

	const highlights: string[] = [];
	if (topPage) highlights.push(`Top page: ${topPage.pathname} (${formatNumber(topPage.views)} views)`);
	if (topReferrer) highlights.push(`Top source: ${topReferrer[0]} (${formatNumber(topReferrer[1])})`);
	if (topCampaign) highlights.push(`Top campaign: ${topCampaign[0]} (${formatNumber(topCampaign[1])})`);

	// ── Build blocks ─────────────────────────────────────────────
	const blocks: Record<string, unknown>[] = [
		header("Analytics"),
		context(`Last ${effectiveDays} days \u00b7 ${dateFrom} to ${dateTo}`),
		rangeForm(effectiveDays, rangeOptions),
	];

	blocks.push(
		banner(
			"Overview",
			"Traffic, engagement, funnels, and campaign insights are available below.",
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
			{ label: "Views", value: formatNumber(report.views), ...viewsTrend },
			{ label: "Visitors", value: formatNumber(report.visitors), ...visitorsTrend },
			{ label: "Read Rate", value: `${report.readRate}%`, ...readRateTrend },
			{ label: "Avg Time", value: formatDuration(report.avgTimeSeconds), ...timeTrend },
		]),
		statsBlock([
			{ label: "Engagement", value: `${report.engagedRate}%`, ...engagedTrend },
			{ label: "Recirculation", value: `${report.recircRate}%`, ...recircTrend },
			{ label: "Scroll Completion", value: scrollCompletion > 0 ? `${scrollCompletion}%` : "\u2014" },
		]),
	);

	if (prevReport.views > 0) {
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
					{ metric: "Views", current: formatNumber(report.views), previous: formatNumber(prevReport.views), change: viewsTrend.trend ?? "0%" },
					{ metric: "Visitors", current: formatNumber(report.visitors), previous: formatNumber(prevReport.visitors), change: visitorsTrend.trend ?? "0%" },
					{ metric: "Read Rate", current: `${report.readRate}%`, previous: `${prevReport.readRate}%`, change: readRateTrend.trend ?? "0%" },
					{ metric: "Engagement", current: `${report.engagedRate}%`, previous: `${prevReport.engagedRate}%`, change: engagedTrend.trend ?? "0%" },
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

	const scrollValues = [report.scrollDepth["25"], report.scrollDepth["50"], report.scrollDepth["75"], report.scrollDepth["100"]];
	const hasScrollData = scrollValues.some((value) => value > 0);
	const topReferrers = Object.entries(report.referrers)
		.filter(([name]) => !!name)
		.sort(([, a], [, b]) => b - a)
		.slice(0, 5);

	if (topReferrers.length > 0) {
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

	// ── Countries ────────────────────────────────────────────────
	const topCountries = Object.entries(report.countries)
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

	// ── Top Pages ────────────────────────────────────────────────
	if (topPages.length > 0) {
		const hasTemplate = topPages.some((p) => !!p.template);
		const hasCollection = topPages.some((p) => !!p.collection);
		const pageRows = topPages.map((p) => {
			const row: Record<string, unknown> = {
				page: p.pathname,
				views: formatNumber(p.views),
				visitors: formatNumber(p.visitors),
			};
			if (hasTemplate) row.template = p.template || "\u2014";
			if (hasCollection) row.collection = p.collection || "\u2014";
			return row;
		});

		const cols: Array<{ key: string; label: string }> = [{ key: "page", label: "Page" }];
		if (hasTemplate) cols.push({ key: "template", label: "Template" });
		if (hasCollection) cols.push({ key: "collection", label: "Collection" });
		cols.push({ key: "views", label: "Views" }, { key: "visitors", label: "Visitors" });
		blocks.push(
			header("Top Pages"),
			context("Your highest-traffic routes in the current range."),
			tableBlock(cols, pageRows),
		);
	}

	// ── Conversion: Funnels, Goals, Forms ───────────────────────
	try {
		const configuredFunnels = (await loadFunnelDefinitions(ctx)).filter((item) => item.active);
		const configuredGoals = (await loadGoalDefinitions(ctx)).filter((item) => item.active);
		const funnelSets = await getFunnelsReport(backend, {
			dateFrom,
			dateTo,
			funnels: configuredFunnels,
		}, storage);
		const goalRows = await getGoalsReport(backend, {
			dateFrom,
			dateTo,
			totalVisitors: report.visitors,
			goals: configuredGoals,
		}, storage);
		const formRows = await getFormsAnalyticsReport(backend, {
			dateFrom,
			dateTo,
			totalVisitors: report.visitors,
		}, storage);

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
		console.error("[analytics-hub] Failed to build conversion section", error);
	}

	// ── Campaigns / Campaign Intelligence ────────────────────────
	const sourceMetrics = await getCampaignIntelligenceReport(backend, {
		dateFrom,
		dateTo,
		dimension: "source",
	}, storage);
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
	} else {
		const campaignRows: Array<Record<string, unknown>> = [];
		for (const [s, c] of Object.entries(report.utmSources)) { if (s) campaignRows.push({ type: "Source", value: s, views: formatNumber(c), _sort: c }); }
		for (const [m, c] of Object.entries(report.utmMediums)) { if (m) campaignRows.push({ type: "Medium", value: m, views: formatNumber(c), _sort: c }); }
		for (const [ca, c] of Object.entries(report.utmCampaigns)) { if (ca) campaignRows.push({ type: "Campaign", value: ca, views: formatNumber(c), _sort: c }); }
		campaignRows.sort((a, b) => (b._sort as number) - (a._sort as number));
		if (campaignRows.length > 0) {
			blocks.push(
				header("Campaigns"),
				tableBlock([{ key: "type", label: "Type" }, { key: "value", label: "Value" }, { key: "views", label: "Views" }], campaignRows.slice(0, 10)),
			);
		}
	}

	// ── Custom Events + Property Breakdowns ──────────────────────
	try {
		const customEventsReport = await getCustomEventsReport(backend, { dateFrom, dateTo, limit: 8 }, storage);
		const eventEntries = customEventsReport.events;

		if (eventEntries.length > 0) {
			blocks.push(
				divider(),
				banner("Instrumentation", "Custom events let you track product and conversion actions beyond pageviews."),
				context("Custom Events are named actions tracked from the site. Properties add extra context like variant, plan, form, or source."),
				header("Custom Events"),
				tableBlock(
					[{ key: "event", label: "Event" }, { key: "count", label: "Count" }],
					eventEntries.map((e) => ({ event: e.name, count: formatNumber(e.count) })),
				),
			);

			const trendSeries = eventEntries
				.slice(0, 3)
				.map((e, index) => ({
					name: e.name,
					data: customEventsReport.trends[e.name] ?? [],
					color: EVENT_TREND_COLORS[index % EVENT_TREND_COLORS.length],
				}))
				.filter((series) => series.data.length > 0);

			if (trendSeries.length > 0) {
				blocks.push(
					header("Event Trends"),
					timeseriesChart(trendSeries, { height: 200, style: "line" }),
				);
			}

			// Property breakdowns for top event
			const topEventName = eventEntries[0].name;
			const propBreakdowns = await getPropertyBreakdownsReport(backend, {
				dateFrom,
				dateTo,
				eventName: topEventName,
				maxKeys: 2,
				maxValuesPerKey: 5,
			}, storage);
			const propKeys = Object.keys(propBreakdowns);
			if (propKeys.length > 0) {
				blocks.push(header(`Properties: ${topEventName}`));
				for (const propKey of propKeys) {
					const values = Object.entries(propBreakdowns[propKey]).sort(([, a], [, b]) => b - a);
					blocks.push(tableBlock([{ key: "value", label: propKey }, { key: "count", label: "Count" }], values.map(([v, c]) => ({ value: v, count: formatNumber(c) }))));
				}
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

	// ── Footer ──────────────────────────────────────────────────
	blocks.push(
		divider(),
		banner("Operations", "Configure reusable goals and funnels from the Goals and Funnels pages in the plugin navigation."),
	);

	// ── Empty state ──────────────────────────────────────────────
	if (Object.keys(report.daily).length === 0 && report.views === 0) {
		blocks.push(banner("No data yet", "Analytics will appear here once visitors start browsing your site."));
	}

	return { blocks };
}
