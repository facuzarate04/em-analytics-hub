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
	DetectedFormsQuery,
	PropertyBreakdownsQuery,
	PropertyBreakdownsReport,
	GoalsQuery,
	FormsAnalyticsQuery,
	FunnelsQuery,
	FunnelSet,
} from "../../reporting/types.js";
import type { FormAnalyticsRow } from "../../helpers/forms-analytics.js";
import type { GoalMetricRow, RawEvent } from "../../types.js";
import { isAutoGoalCandidate, prettifyGoalName } from "../../helpers/goals.js";
import { aggregateConfiguredFunnel, aggregateFunnel, buildDefaultFunnelSteps } from "../../helpers/funnels.js";
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

	async getDetectedForms(query: DetectedFormsQuery, _storage: ReportingStorage): Promise<string[]> {
		await ensureD1Schema(this.db);
		const { dateFrom, dateTo, limit } = query;

		const rows = await this.db.prepare(
			`SELECT form_name, SUM(count) as count
			 FROM daily_form_submissions
			 WHERE date >= ? AND date <= ?
			 GROUP BY form_name
			 ORDER BY count DESC
			 LIMIT ?`,
		).bind(dateFrom, dateTo, limit).all<{ form_name: string; count: number }>();

		return (rows.results ?? [])
			.map((r) => r.form_name)
			.filter((name) => name !== "");
	}

	async getGoals(query: GoalsQuery, _storage: ReportingStorage): Promise<GoalMetricRow[]> {
		await ensureD1Schema(this.db);
		const { dateFrom, dateTo, totalVisitors, goals } = query;

		if (goals.length === 0) {
			return this.autoDetectGoals(dateFrom, dateTo, totalVisitors);
		}
		return this.computeConfiguredGoals(goals, dateFrom, dateTo, totalVisitors);
	}

	async getFormsAnalytics(query: FormsAnalyticsQuery, _storage: ReportingStorage): Promise<FormAnalyticsRow[]> {
		await ensureD1Schema(this.db);
		const { dateFrom, dateTo, totalVisitors, limit = 6 } = query;

		// Get submissions grouped by (event_name, form_name)
		const rows = await this.db.prepare(
			`SELECT event_name, form_name, SUM(count) as submissions
			 FROM daily_form_analytics
			 WHERE date >= ? AND date <= ?
			 GROUP BY event_name, form_name
			 ORDER BY submissions DESC
			 LIMIT ?`,
		).bind(dateFrom, dateTo, limit).all<{ event_name: string; form_name: string; submissions: number }>();

		const entries = rows.results ?? [];
		if (entries.length === 0) return [];

		// Get unique visitors per (event_name, form_name)
		// Build IN clause for compound key matching
		const result: FormAnalyticsRow[] = [];
		for (const entry of entries) {
			const visitorRow = await this.db.prepare(
				`SELECT COUNT(DISTINCT visitor_id) as visitors
				 FROM daily_form_analytics_visitors
				 WHERE date >= ? AND date <= ? AND event_name = ? AND form_name = ?`,
			).bind(dateFrom, dateTo, entry.event_name, entry.form_name).first<{ visitors: number }>();

			const visitors = visitorRow?.visitors ?? 0;
			result.push({
				form: entry.form_name,
				event: entry.event_name,
				submissions: entry.submissions,
				visitors,
				submitRate: totalVisitors > 0 ? Math.round((visitors / totalVisitors) * 100) : 0,
			});
		}

		return result;
	}

	async getFunnels(query: FunnelsQuery, _storage: ReportingStorage): Promise<FunnelSet[]> {
		await ensureD1Schema(this.db);
		const { dateFrom, dateTo, funnels } = query;

		// Query funnel events from D1
		const rows = await this.db.prepare(
			`SELECT visitor_id, created_at, event_type, pathname, event_name, event_props
			 FROM funnel_events
			 WHERE date >= ? AND date <= ?
			 ORDER BY created_at`,
		).bind(dateFrom, dateTo).all<{
			visitor_id: string;
			created_at: string;
			event_type: string;
			pathname: string;
			event_name: string;
			event_props: string;
		}>();

		// Convert D1 rows to RawEvent-like items for funnel helpers
		const items: Array<{ id: string; data: RawEvent }> = (rows.results ?? []).map((row, index) => ({
			id: String(index),
			data: {
				pathname: row.pathname,
				type: row.event_type as RawEvent["type"],
				referrer: "",
				visitorId: row.visitor_id,
				country: "",
				template: "",
				collection: "",
				utmSource: "",
				utmMedium: "",
				utmCampaign: "",
				utmTerm: "",
				utmContent: "",
				seconds: 0,
				scrollDepth: 0,
				eventName: row.event_name,
				eventProps: row.event_props,
				createdAt: row.created_at,
			},
		}));

		if (funnels.length > 0) {
			return funnels
				.map((funnel) => ({
					name: funnel.name,
					rows: aggregateConfiguredFunnel(items, funnel),
				}))
				.filter((set) => set.rows.length >= 2);
		}

		// Auto-detect mode
		const funnelSteps = buildDefaultFunnelSteps(items);
		const autoRows = aggregateFunnel(items, funnelSteps);
		return autoRows.length >= 2 ? [{ name: "Detected Funnel", rows: autoRows }] : [];
	}

	async getPropertyBreakdowns(query: PropertyBreakdownsQuery, _storage: ReportingStorage): Promise<PropertyBreakdownsReport> {
		await ensureD1Schema(this.db);
		const { dateFrom, dateTo, eventName, maxKeys = 10, maxValuesPerKey = 10 } = query;

		const rows = await this.db.prepare(
			`SELECT prop_key, prop_value, SUM(count) as count
			 FROM daily_custom_event_props
			 WHERE date >= ? AND date <= ? AND event_name = ?
			 GROUP BY prop_key, prop_value
			 ORDER BY count DESC`,
		).bind(dateFrom, dateTo, eventName).all<{ prop_key: string; prop_value: string; count: number }>();

		const result: PropertyBreakdownsReport = {};
		const keyCounts = new Map<string, number>();

		for (const row of rows.results ?? []) {
			if (!result[row.prop_key]) {
				if (keyCounts.size >= maxKeys && !keyCounts.has(row.prop_key)) continue;
				result[row.prop_key] = {};
				keyCounts.set(row.prop_key, 0);
			}

			const currentCount = keyCounts.get(row.prop_key) ?? 0;
			if (currentCount >= maxValuesPerKey) continue;

			result[row.prop_key][row.prop_value] = row.count;
			keyCounts.set(row.prop_key, currentCount + 1);
		}

		return result;
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

	private async autoDetectGoals(
		dateFrom: string,
		dateTo: string,
		totalVisitors: number,
	): Promise<GoalMetricRow[]> {
		// Get all custom event counts
		const eventRows = await this.db.prepare(
			`SELECT event_name, SUM(count) as completions
			 FROM daily_custom_events
			 WHERE date >= ? AND date <= ?
			 GROUP BY event_name
			 ORDER BY completions DESC`,
		).bind(dateFrom, dateTo).all<{ event_name: string; completions: number }>();

		// Filter to auto-goal candidates
		const candidates = (eventRows.results ?? []).filter((r) => isAutoGoalCandidate(r.event_name));
		if (candidates.length === 0) return [];

		// Get unique visitors per candidate event
		const names = candidates.map((c) => c.event_name);
		const placeholders = names.map(() => "?").join(", ");
		const visitorRows = await this.db.prepare(
			`SELECT event_name, COUNT(DISTINCT visitor_id) as visitors
			 FROM daily_custom_event_visitors
			 WHERE date >= ? AND date <= ? AND event_name IN (${placeholders})
			 GROUP BY event_name`,
		).bind(dateFrom, dateTo, ...names).all<{ event_name: string; visitors: number }>();

		const visitorMap = new Map<string, number>();
		for (const r of visitorRows.results ?? []) {
			visitorMap.set(r.event_name, r.visitors);
		}

		return candidates
			.map((c) => {
				const visitors = visitorMap.get(c.event_name) ?? 0;
				return {
					goal: prettifyGoalName(c.event_name),
					completions: c.completions,
					visitors,
					conversionRate: totalVisitors > 0 ? Math.round((visitors / totalVisitors) * 100) : 0,
				};
			})
			.slice(0, 5);
	}

	private async computeConfiguredGoals(
		goals: GoalsQuery["goals"],
		dateFrom: string,
		dateTo: string,
		totalVisitors: number,
	): Promise<GoalMetricRow[]> {
		const rows: GoalMetricRow[] = [];

		for (const goal of goals) {
			if (!goal.active) continue;

			if (goal.type === "page") {
				// Page goals — daily_pages + daily_visitors
				const pageRow = await this.db.prepare(
					`SELECT COALESCE(SUM(views), 0) as completions
					 FROM daily_pages
					 WHERE date >= ? AND date <= ? AND pathname = ?`,
				).bind(dateFrom, dateTo, goal.target).first<{ completions: number }>();

				const visitorRow = await this.db.prepare(
					`SELECT COUNT(DISTINCT visitor_id) as visitors
					 FROM daily_visitors
					 WHERE date >= ? AND date <= ? AND pathname = ?`,
				).bind(dateFrom, dateTo, goal.target).first<{ visitors: number }>();

				const completions = pageRow?.completions ?? 0;
				const visitors = visitorRow?.visitors ?? 0;
				rows.push({
					goal: goal.name,
					completions,
					visitors,
					conversionRate: totalVisitors > 0 ? Math.round((visitors / totalVisitors) * 100) : 0,
				});
			} else if (goal.type === "event") {
				// Event goals — daily_custom_events + daily_custom_event_visitors
				const eventRow = await this.db.prepare(
					`SELECT COALESCE(SUM(count), 0) as completions
					 FROM daily_custom_events
					 WHERE date >= ? AND date <= ? AND event_name = ?`,
				).bind(dateFrom, dateTo, goal.target).first<{ completions: number }>();

				const visitorRow = await this.db.prepare(
					`SELECT COUNT(DISTINCT visitor_id) as visitors
					 FROM daily_custom_event_visitors
					 WHERE date >= ? AND date <= ? AND event_name = ?`,
				).bind(dateFrom, dateTo, goal.target).first<{ visitors: number }>();

				const completions = eventRow?.completions ?? 0;
				const visitors = visitorRow?.visitors ?? 0;
				rows.push({
					goal: goal.name,
					completions,
					visitors,
					conversionRate: totalVisitors > 0 ? Math.round((visitors / totalVisitors) * 100) : 0,
				});
			} else if (goal.type === "form") {
				// Form goals — daily_form_submissions + daily_form_visitors
				const formRow = await this.db.prepare(
					`SELECT COALESCE(SUM(count), 0) as completions
					 FROM daily_form_submissions
					 WHERE date >= ? AND date <= ? AND form_name = ?`,
				).bind(dateFrom, dateTo, goal.target).first<{ completions: number }>();

				const visitorRow = await this.db.prepare(
					`SELECT COUNT(DISTINCT visitor_id) as visitors
					 FROM daily_form_visitors
					 WHERE date >= ? AND date <= ? AND form_name = ?`,
				).bind(dateFrom, dateTo, goal.target).first<{ visitors: number }>();

				const completions = formRow?.completions ?? 0;
				const visitors = visitorRow?.visitors ?? 0;
				rows.push({
					goal: goal.name,
					completions,
					visitors,
					conversionRate: totalVisitors > 0 ? Math.round((visitors / totalVisitors) * 100) : 0,
				});
			}
		}

		return rows
			.filter((row) => row.completions > 0)
			.sort((a, b) => b.completions - a.completions);
	}
}
