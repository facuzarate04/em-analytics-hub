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
} from "../../reporting/types.js";
import type { CustomEvent } from "../../types.js";
import type { StorageCollection } from "../../storage/queries.js";
import { queryStatsForRange } from "../../storage/stats.js";
import { aggregateStats } from "../../helpers/aggregation.js";
import { aggregateCampaignIntelligence } from "../../helpers/campaign-intelligence.js";
import { queryCustomEvents, aggregateCustomEvents, aggregateCustomEventTrends } from "../../storage/custom-events.js";

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
}
