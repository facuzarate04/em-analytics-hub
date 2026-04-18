import type {
	AnalyticsReportingBackend,
	ReportingStorage,
	StatsReportQuery,
	StatsReport,
	TopPagesReportQuery,
	TopPageEntry,
	ReferrersReportQuery,
	ReferrerEntry,
	CampaignsReportQuery,
	CampaignsReport,
	CampaignIntelligenceQuery,
	CampaignIntelligenceEntry,
	CustomEventsReportQuery,
	CustomEventsReport,
	DetectedFormsQuery,
	PropertyBreakdownsQuery,
	PropertyBreakdownsReport,
	GoalsQuery,
	FormsAnalyticsQuery,
	FunnelsQuery,
	FunnelSet,
} from "../../reporting/types.js";
import type { FormAnalyticsRow } from "../../helpers/forms-analytics.js";
import type { CustomEvent, GoalMetricRow, RawEvent } from "../../types.js";
import type { StorageCollection } from "../../storage/queries.js";
import { queryStatsForRange } from "../../storage/stats.js";
import { aggregateStats } from "../../helpers/aggregation.js";
import { aggregateCampaignIntelligence } from "../../helpers/campaign-intelligence.js";
import { queryCustomEvents, aggregateCustomEvents, aggregateCustomEventTrends, aggregateCustomEventProperties } from "../../storage/custom-events.js";
import { aggregateGoals, isAutoGoalCandidate } from "../../helpers/goals.js";
import { aggregateFormsAnalytics } from "../../helpers/forms-analytics.js";
import { aggregateConfiguredFunnel, aggregateFunnel, buildDefaultFunnelSteps } from "../../helpers/funnels.js";
import { queryRawEvents } from "../../storage/events.js";

function pct(part: number, total: number): number {
	return total > 0 ? Math.round((part / total) * 100) : 0;
}

function sortedEntries(record: Record<string, number>, limit: number): Array<{ name: string; count: number }> {
	return Object.entries(record)
		.filter(([key]) => key !== "")
		.sort(([, a], [, b]) => b - a)
		.slice(0, limit)
		.map(([name, count]) => ({ name, count }));
}

export class PortableReportingBackend implements AnalyticsReportingBackend {
	async getStats(query: StatsReportQuery, storage: ReportingStorage): Promise<StatsReport> {
		const items = await queryStatsForRange(storage.daily_stats, query.dateFrom, query.dateTo, query.pathname);
		const agg = aggregateStats(items);

		return {
			views: agg.totalViews,
			visitors: agg.totalVisitors,
			reads: agg.totalReads,
			readRate: pct(agg.totalReads, agg.totalViews),
			avgTimeSeconds: agg.totalTimeCount > 0 ? Math.round(agg.totalTime / agg.totalTimeCount) : 0,
			engagedViews: agg.totalEngagedViews,
			engagedRate: pct(agg.totalEngagedViews, agg.totalViews),
			recircs: agg.totalRecircs,
			recircRate: pct(agg.totalRecircs, agg.totalViews),
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
			countries: agg.countries,
			daily: Object.fromEntries(agg.byDate),
		};
	}

	async getTopPages(query: TopPagesReportQuery, storage: ReportingStorage): Promise<TopPageEntry[]> {
		const items = await queryStatsForRange(storage.daily_stats, query.dateFrom, query.dateTo);
		const agg = aggregateStats(items);

		return Array.from(agg.byPathname.entries())
			.map(([pathname, data]) => ({
				pathname,
				template: data.template,
				collection: data.collection,
				views: data.views,
				visitors: data.visitors.size,
				reads: data.reads,
				readRate: pct(data.reads, data.views),
				avgTime: data.timeCount > 0 ? Math.round(data.timeTotal / data.timeCount) : 0,
				engagedRate: pct(data.engagedViews, data.views),
				recircRate: pct(data.recircs, data.views),
			}))
			.sort((a, b) => b.views - a.views)
			.slice(0, query.limit);
	}

	async getReferrers(query: ReferrersReportQuery, storage: ReportingStorage): Promise<ReferrerEntry[]> {
		const items = await queryStatsForRange(storage.daily_stats, query.dateFrom, query.dateTo);
		const agg = aggregateStats(items);

		return Object.entries(agg.referrers)
			.sort(([, a], [, b]) => b - a)
			.slice(0, query.limit)
			.map(([domain, count]) => ({ domain, count }));
	}

	async getCampaigns(query: CampaignsReportQuery, storage: ReportingStorage): Promise<CampaignsReport> {
		const items = await queryStatsForRange(storage.daily_stats, query.dateFrom, query.dateTo);
		const agg = aggregateStats(items);

		return {
			sources: sortedEntries(agg.utmSources, 20),
			mediums: sortedEntries(agg.utmMediums, 20),
			campaigns: sortedEntries(agg.utmCampaigns, 20),
		};
	}

	async getCampaignIntelligence(query: CampaignIntelligenceQuery, storage: ReportingStorage): Promise<CampaignIntelligenceEntry[]> {
		const items = await queryStatsForRange(storage.daily_stats, query.dateFrom, query.dateTo);
		return aggregateCampaignIntelligence(items, query.dimension);
	}

	async getCustomEvents(query: CustomEventsReportQuery, storage: ReportingStorage): Promise<CustomEventsReport> {
		const items = await queryCustomEvents(
			storage.custom_events as StorageCollection<CustomEvent>,
			query.dateFrom,
			query.dateTo,
		);

		const counts = aggregateCustomEvents(items);
		const events = Object.entries(counts)
			.sort(([, a], [, b]) => b - a)
			.slice(0, query.limit)
			.map(([name, count]) => ({ name, count }));

		const allTrends = aggregateCustomEventTrends(items);
		const topNames = new Set(events.map((e) => e.name));
		const trends: Record<string, number[][]> = {};
		for (const [name, data] of Object.entries(allTrends)) {
			if (topNames.has(name)) trends[name] = data;
		}

		return { events, trends };
	}

	async getDetectedForms(query: DetectedFormsQuery, storage: ReportingStorage): Promise<string[]> {
		const items = await queryCustomEvents(
			storage.custom_events as StorageCollection<CustomEvent>,
			query.dateFrom,
			query.dateTo,
		);

		return Array.from(
			new Set(
				items
					.filter((item) => item.data.name === "form_submit" || item.data.name.endsWith("_submit"))
					.map((item) => String(item.data.props.form ?? item.data.props.source ?? item.data.pathname ?? ""))
					.filter((value) => value.length > 0),
			),
		).slice(0, query.limit);
	}

	async getPropertyBreakdowns(query: PropertyBreakdownsQuery, storage: ReportingStorage): Promise<PropertyBreakdownsReport> {
		const { dateFrom, dateTo, eventName, maxKeys = 10, maxValuesPerKey = 10 } = query;

		const items = await queryCustomEvents(
			storage.custom_events as StorageCollection<CustomEvent>,
			dateFrom,
			dateTo,
			eventName,
		);

		const allBreakdowns = aggregateCustomEventProperties(items, eventName);

		// Apply limits: top maxKeys keys, top maxValuesPerKey values per key
		const result: PropertyBreakdownsReport = {};
		const sortedKeys = Object.keys(allBreakdowns).slice(0, maxKeys);

		for (const key of sortedKeys) {
			const values = Object.entries(allBreakdowns[key])
				.sort(([, a], [, b]) => b - a)
				.slice(0, maxValuesPerKey);
			result[key] = Object.fromEntries(values);
		}

		return result;
	}

	async getGoals(query: GoalsQuery, storage: ReportingStorage): Promise<GoalMetricRow[]> {
		const { dateFrom, dateTo, totalVisitors, goals } = query;

		const customEvents = await queryCustomEvents(
			storage.custom_events as StorageCollection<CustomEvent>,
			dateFrom,
			dateTo,
		);

		// Auto-detect mode — delegate to existing helper
		if (goals.length === 0) {
			return aggregateGoals(customEvents, totalVisitors);
		}

		// Configured goals — page goals use daily_stats, event/form goals use custom_events
		const statsItems = await queryStatsForRange(storage.daily_stats, dateFrom, dateTo);
		const statsAgg = aggregateStats(statsItems);

		const rows: GoalMetricRow[] = [];

		for (const goal of goals.filter((g) => g.active)) {
			if (goal.type === "page") {
				const pageData = statsAgg.byPathname.get(goal.target);
				const completions = pageData?.views ?? 0;
				const visitors = pageData?.visitors.size ?? 0;
				rows.push({
					goal: goal.name,
					completions,
					visitors,
					conversionRate: totalVisitors > 0 ? Math.round((visitors / totalVisitors) * 100) : 0,
				});
			} else if (goal.type === "event") {
				let completions = 0;
				const visitorSet = new Set<string>();
				for (const item of customEvents) {
					if (item.data.name === goal.target) {
						completions++;
						if (item.data.visitorId) visitorSet.add(item.data.visitorId);
					}
				}
				rows.push({
					goal: goal.name,
					completions,
					visitors: visitorSet.size,
					conversionRate: totalVisitors > 0 ? Math.round((visitorSet.size / totalVisitors) * 100) : 0,
				});
			} else if (goal.type === "form") {
				let completions = 0;
				const visitorSet = new Set<string>();
				for (const item of customEvents) {
					const event = item.data;
					const isSubmit = event.name === "form_submit" || event.name.endsWith("_submit");
					if (!isSubmit) continue;
					const formName = String(event.props.form ?? event.props.source ?? event.pathname ?? "");
					if (formName === goal.target) {
						completions++;
						if (event.visitorId) visitorSet.add(event.visitorId);
					}
				}
				rows.push({
					goal: goal.name,
					completions,
					visitors: visitorSet.size,
					conversionRate: totalVisitors > 0 ? Math.round((visitorSet.size / totalVisitors) * 100) : 0,
				});
			}
		}

		return rows
			.filter((row) => row.completions > 0)
			.sort((a, b) => b.completions - a.completions);
	}

	async getFormsAnalytics(query: FormsAnalyticsQuery, storage: ReportingStorage): Promise<FormAnalyticsRow[]> {
		const items = await queryCustomEvents(
			storage.custom_events as StorageCollection<CustomEvent>,
			query.dateFrom,
			query.dateTo,
		);

		return aggregateFormsAnalytics(items, query.totalVisitors);
	}

	async getFunnels(query: FunnelsQuery, storage: ReportingStorage): Promise<FunnelSet[]> {
		const { dateFrom, dateTo, funnels } = query;

		const rawEvents = await queryRawEvents(
			storage.events as StorageCollection<RawEvent>,
			dateFrom,
			dateTo,
		);

		if (funnels.length > 0) {
			return funnels
				.map((funnel) => ({
					name: funnel.name,
					rows: aggregateConfiguredFunnel(rawEvents, funnel),
				}))
				.filter((set) => set.rows.length >= 2);
		}

		// Auto-detect mode
		const funnelSteps = buildDefaultFunnelSteps(rawEvents);
		const autoRows = aggregateFunnel(rawEvents, funnelSteps);
		return autoRows.length >= 2 ? [{ name: "Detected Funnel", rows: autoRows }] : [];
	}
}
