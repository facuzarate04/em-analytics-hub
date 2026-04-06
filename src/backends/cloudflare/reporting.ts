// ---------------------------------------------------------------------------
// Cloudflare D1 Reporting Backend
// ---------------------------------------------------------------------------
//
// Reads aggregated data from D1 tables populated by CloudflareIngestionBackend.
// The `storage` parameter (ReportingStorage) is accepted for interface
// compatibility but not used — all queries go to D1.
// ---------------------------------------------------------------------------

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
} from "../../reporting/types.js";
import type { D1Database } from "./d1.js";
import { ensureD1Schema } from "./d1.js";

function pct(part: number, total: number): number {
	return total > 0 ? Math.round((part / total) * 100) : 0;
}

export class CloudflareReportingBackend implements AnalyticsReportingBackend {
	private readonly db: D1Database;

	constructor(db: D1Database) {
		this.db = db;
	}

	async getStats(query: StatsReportQuery, _storage: ReportingStorage): Promise<StatsReport> {
		await ensureD1Schema(this.db);
		const { dateFrom, dateTo, pathname } = query;

		// Core metrics from daily_pages
		const pathFilter = pathname ? " AND pathname = ?" : "";
		const pathParams = pathname ? [dateFrom, dateTo, pathname] : [dateFrom, dateTo];

		const totals = await this.db.prepare(
			`SELECT
				COALESCE(SUM(views), 0) as views,
				COALESCE(SUM(reads), 0) as reads,
				COALESCE(SUM(time_total), 0) as time_total,
				COALESCE(SUM(time_count), 0) as time_count,
				COALESCE(SUM(scroll25), 0) as scroll25,
				COALESCE(SUM(scroll50), 0) as scroll50,
				COALESCE(SUM(scroll75), 0) as scroll75,
				COALESCE(SUM(scroll100), 0) as scroll100,
				COALESCE(SUM(engaged_views), 0) as engaged_views,
				COALESCE(SUM(recircs), 0) as recircs
			 FROM daily_pages
			 WHERE date >= ? AND date <= ?${pathFilter}`,
		).bind(...pathParams).first<Record<string, number>>();

		const views = totals?.views ?? 0;
		const reads = totals?.reads ?? 0;
		const timeTotal = totals?.time_total ?? 0;
		const timeCount = totals?.time_count ?? 0;
		const engagedViews = totals?.engaged_views ?? 0;
		const recircs = totals?.recircs ?? 0;

		// Unique visitors
		const visitorRow = await this.db.prepare(
			`SELECT COUNT(DISTINCT visitor_id) as visitors
			 FROM daily_visitors
			 WHERE date >= ? AND date <= ?${pathFilter}`,
		).bind(...pathParams).first<{ visitors: number }>();
		const visitors = visitorRow?.visitors ?? 0;

		// Referrers
		const refRows = await this.db.prepare(
			`SELECT referrer, SUM(count) as count
			 FROM daily_referrers
			 WHERE date >= ? AND date <= ?
			 GROUP BY referrer ORDER BY count DESC`,
		).bind(dateFrom, dateTo).all<{ referrer: string; count: number }>();
		const referrers: Record<string, number> = {};
		for (const r of refRows.results ?? []) {
			if (r.referrer) referrers[r.referrer] = r.count;
		}

		// Countries
		const countryRows = await this.db.prepare(
			`SELECT country, SUM(count) as count
			 FROM daily_countries
			 WHERE date >= ? AND date <= ?
			 GROUP BY country ORDER BY count DESC`,
		).bind(dateFrom, dateTo).all<{ country: string; count: number }>();
		const countries: Record<string, number> = {};
		for (const c of countryRows.results ?? []) {
			if (c.country) countries[c.country] = c.count;
		}

		// UTM distributions
		const utmSources = await this.queryUtmDimension(dateFrom, dateTo, "source");
		const utmMediums = await this.queryUtmDimension(dateFrom, dateTo, "medium");
		const utmCampaigns = await this.queryUtmDimension(dateFrom, dateTo, "campaign");

		// Daily timeseries — page metrics
		const dailyPageRows = await this.db.prepare(
			`SELECT date,
				COALESCE(SUM(views), 0) as views,
				COALESCE(SUM(reads), 0) as reads,
				COALESCE(SUM(engaged_views), 0) as engaged_views
			 FROM daily_pages
			 WHERE date >= ? AND date <= ?${pathFilter}
			 GROUP BY date ORDER BY date`,
		).bind(...pathParams).all<{ date: string; views: number; reads: number; engaged_views: number }>();

		// Daily visitors (separate query for COUNT DISTINCT)
		const dailyVisitorRows = await this.db.prepare(
			`SELECT date, COUNT(DISTINCT visitor_id) as visitors
			 FROM daily_visitors
			 WHERE date >= ? AND date <= ?${pathFilter}
			 GROUP BY date ORDER BY date`,
		).bind(...pathParams).all<{ date: string; visitors: number }>();

		const dailyVisitorMap = new Map<string, number>();
		for (const row of dailyVisitorRows.results ?? []) {
			dailyVisitorMap.set(row.date, row.visitors);
		}

		const daily: Record<string, { views: number; visitors: number; reads: number; engagedViews: number }> = {};
		for (const row of dailyPageRows.results ?? []) {
			daily[row.date] = {
				views: row.views,
				visitors: dailyVisitorMap.get(row.date) ?? 0,
				reads: row.reads,
				engagedViews: row.engaged_views,
			};
		}

		return {
			views,
			visitors,
			reads,
			readRate: pct(reads, views),
			avgTimeSeconds: timeCount > 0 ? Math.round(timeTotal / timeCount) : 0,
			engagedViews,
			engagedRate: pct(engagedViews, views),
			recircs,
			recircRate: pct(recircs, views),
			scrollDepth: {
				"25": totals?.scroll25 ?? 0,
				"50": totals?.scroll50 ?? 0,
				"75": totals?.scroll75 ?? 0,
				"100": totals?.scroll100 ?? 0,
			},
			referrers,
			utmSources,
			utmMediums,
			utmCampaigns,
			countries,
			daily,
		};
	}

	async getTopPages(query: TopPagesReportQuery, _storage: ReportingStorage): Promise<TopPageEntry[]> {
		await ensureD1Schema(this.db);
		const { dateFrom, dateTo, limit } = query;

		// Page metrics aggregated by pathname
		const pageRows = await this.db.prepare(
			`SELECT
				pathname,
				MAX(template) as template,
				MAX(collection) as collection,
				COALESCE(SUM(views), 0) as views,
				COALESCE(SUM(reads), 0) as reads,
				COALESCE(SUM(time_total), 0) as time_total,
				COALESCE(SUM(time_count), 0) as time_count,
				COALESCE(SUM(engaged_views), 0) as engaged_views,
				COALESCE(SUM(recircs), 0) as recircs
			 FROM daily_pages
			 WHERE date >= ? AND date <= ?
			 GROUP BY pathname
			 ORDER BY views DESC
			 LIMIT ?`,
		).bind(dateFrom, dateTo, limit).all<{
			pathname: string;
			template: string;
			collection: string;
			views: number;
			reads: number;
			time_total: number;
			time_count: number;
			engaged_views: number;
			recircs: number;
		}>();

		const pathnames = (pageRows.results ?? []).map((r) => r.pathname);
		if (pathnames.length === 0) return [];

		// Visitors per page — separate query for COUNT DISTINCT
		const placeholders = pathnames.map(() => "?").join(", ");
		const visitorRows = await this.db.prepare(
			`SELECT pathname, COUNT(DISTINCT visitor_id) as visitors
			 FROM daily_visitors
			 WHERE date >= ? AND date <= ? AND pathname IN (${placeholders})
			 GROUP BY pathname`,
		).bind(dateFrom, dateTo, ...pathnames).all<{ pathname: string; visitors: number }>();

		const visitorMap = new Map<string, number>();
		for (const row of visitorRows.results ?? []) {
			visitorMap.set(row.pathname, row.visitors);
		}

		return (pageRows.results ?? []).map((row) => ({
			pathname: row.pathname,
			template: row.template ?? "",
			collection: row.collection ?? "",
			views: row.views,
			visitors: visitorMap.get(row.pathname) ?? 0,
			reads: row.reads,
			readRate: pct(row.reads, row.views),
			avgTime: row.time_count > 0 ? Math.round(row.time_total / row.time_count) : 0,
			engagedRate: pct(row.engaged_views, row.views),
			recircRate: pct(row.recircs, row.views),
		}));
	}

	async getReferrers(query: ReferrersReportQuery, _storage: ReportingStorage): Promise<ReferrerEntry[]> {
		await ensureD1Schema(this.db);
		const { dateFrom, dateTo, limit } = query;

		const rows = await this.db.prepare(
			`SELECT referrer as domain, SUM(count) as count
			 FROM daily_referrers
			 WHERE date >= ? AND date <= ?
			 GROUP BY referrer
			 ORDER BY count DESC
			 LIMIT ?`,
		).bind(dateFrom, dateTo, limit).all<{ domain: string; count: number }>();

		return (rows.results ?? []).filter((r) => r.domain !== "");
	}

	async getCampaigns(query: CampaignsReportQuery, _storage: ReportingStorage): Promise<CampaignsReport> {
		await ensureD1Schema(this.db);
		const { dateFrom, dateTo } = query;

		const [sources, mediums, campaigns] = await Promise.all([
			this.queryCampaignDimension(dateFrom, dateTo, "source", 20),
			this.queryCampaignDimension(dateFrom, dateTo, "medium", 20),
			this.queryCampaignDimension(dateFrom, dateTo, "campaign", 20),
		]);

		return { sources, mediums, campaigns };
	}

	async getCampaignIntelligence(
		query: CampaignIntelligenceQuery,
		_storage: ReportingStorage,
	): Promise<CampaignIntelligenceEntry[]> {
		await ensureD1Schema(this.db);
		const { dateFrom, dateTo, dimension } = query;

		// Campaign view counts per name
		const campaignRows = await this.db.prepare(
			`SELECT name, SUM(count) as views
			 FROM daily_campaigns
			 WHERE date >= ? AND date <= ? AND dimension = ?
			 GROUP BY name
			 ORDER BY views DESC`,
		).bind(dateFrom, dateTo, dimension).all<{ name: string; views: number }>();

		if (!campaignRows.results?.length) return [];

		// Global page totals for proportional estimation
		const globalTotals = await this.db.prepare(
			`SELECT
				COALESCE(SUM(views), 0) as views,
				COALESCE(SUM(reads), 0) as reads,
				COALESCE(SUM(time_total), 0) as time_total,
				COALESCE(SUM(time_count), 0) as time_count,
				COALESCE(SUM(engaged_views), 0) as engaged_views,
				COALESCE(SUM(recircs), 0) as recircs
			 FROM daily_pages
			 WHERE date >= ? AND date <= ?`,
		).bind(dateFrom, dateTo).first<Record<string, number>>();

		const totalViews = globalTotals?.views || 1;
		const totalReads = globalTotals?.reads ?? 0;
		const totalTimeTotal = globalTotals?.time_total ?? 0;
		const totalTimeCount = globalTotals?.time_count ?? 0;
		const totalEngaged = globalTotals?.engaged_views ?? 0;
		const totalRecircs = globalTotals?.recircs ?? 0;

		// Global visitor count
		const visitorRow = await this.db.prepare(
			`SELECT COUNT(DISTINCT visitor_id) as visitors
			 FROM daily_visitors
			 WHERE date >= ? AND date <= ?`,
		).bind(dateFrom, dateTo).first<{ visitors: number }>();
		const totalVisitors = visitorRow?.visitors || 1;

		// Proportional estimation per campaign (same approach as portable)
		return (campaignRows.results ?? []).map((row) => {
			const ratio = row.views / totalViews;
			const reads = Math.round(totalReads * ratio);
			const engagedViews = Math.round(totalEngaged * ratio);
			const recircs = Math.round(totalRecircs * ratio);
			const timeCount = Math.round(totalTimeCount * ratio);
			const timeTotal = Math.round(totalTimeTotal * ratio);
			const visitors = Math.round(totalVisitors * ratio);

			return {
				name: row.name,
				views: row.views,
				visitors,
				reads,
				readRate: pct(reads, row.views),
				engagedViews,
				engagedRate: pct(engagedViews, row.views),
				avgTimeSeconds: timeCount > 0 ? Math.round(timeTotal / timeCount) : 0,
				recircs,
				recircRate: pct(recircs, row.views),
			};
		});
	}

	async getCustomEvents(query: CustomEventsReportQuery, _storage: ReportingStorage): Promise<CustomEventsReport> {
		await ensureD1Schema(this.db);
		const { dateFrom, dateTo, limit } = query;

		// Top events by total count
		const eventRows = await this.db.prepare(
			`SELECT event_name, SUM(count) as count
			 FROM daily_custom_events
			 WHERE date >= ? AND date <= ?
			 GROUP BY event_name
			 ORDER BY count DESC
			 LIMIT ?`,
		).bind(dateFrom, dateTo, limit).all<{ event_name: string; count: number }>();

		const events = (eventRows.results ?? [])
			.filter((r) => r.event_name !== "")
			.map((r) => ({ name: r.event_name, count: r.count }));

		// Daily trends for the top events
		const topNames = events.map((e) => e.name);
		const trends: Record<string, number[][]> = {};

		if (topNames.length > 0) {
			const placeholders = topNames.map(() => "?").join(", ");
			const trendRows = await this.db.prepare(
				`SELECT date, event_name, SUM(count) as count
				 FROM daily_custom_events
				 WHERE date >= ? AND date <= ? AND event_name IN (${placeholders})
				 GROUP BY date, event_name
				 ORDER BY date`,
			).bind(dateFrom, dateTo, ...topNames).all<{ date: string; event_name: string; count: number }>();

			for (const row of trendRows.results ?? []) {
				if (!trends[row.event_name]) trends[row.event_name] = [];
				trends[row.event_name].push([new Date(row.date).getTime(), row.count]);
			}
		}

		return { events, trends };
	}

	// -----------------------------------------------------------------------
	// Helpers
	// -----------------------------------------------------------------------

	private async queryUtmDimension(
		dateFrom: string,
		dateTo: string,
		dimension: string,
	): Promise<Record<string, number>> {
		const rows = await this.db.prepare(
			`SELECT name, SUM(count) as count
			 FROM daily_campaigns
			 WHERE date >= ? AND date <= ? AND dimension = ?
			 GROUP BY name ORDER BY count DESC`,
		).bind(dateFrom, dateTo, dimension).all<{ name: string; count: number }>();

		const result: Record<string, number> = {};
		for (const r of rows.results ?? []) {
			if (r.name) result[r.name] = r.count;
		}
		return result;
	}

	private async queryCampaignDimension(
		dateFrom: string,
		dateTo: string,
		dimension: string,
		limit: number,
	): Promise<Array<{ name: string; count: number }>> {
		const rows = await this.db.prepare(
			`SELECT name, SUM(count) as count
			 FROM daily_campaigns
			 WHERE date >= ? AND date <= ? AND dimension = ?
			 GROUP BY name ORDER BY count DESC LIMIT ?`,
		).bind(dateFrom, dateTo, dimension, limit).all<{ name: string; count: number }>();

		return (rows.results ?? []).filter((r) => r.name !== "");
	}
}
