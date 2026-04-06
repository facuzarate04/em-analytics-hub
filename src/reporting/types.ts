import type { DailyStats, CustomEvent, GoalDefinition, GoalMetricRow } from "../types.js";
import type { FormAnalyticsRow } from "../helpers/forms-analytics.js";
export type { FormAnalyticsRow } from "../helpers/forms-analytics.js";
import type { StorageCollection } from "../storage/queries.js";

export interface ReportingStorage {
	daily_stats: StorageCollection<DailyStats>;
	custom_events: StorageCollection<CustomEvent>;
}

export interface StatsReportQuery {
	dateFrom: string;
	dateTo: string;
	pathname?: string;
}

export interface TopPagesReportQuery {
	dateFrom: string;
	dateTo: string;
	limit: number;
}

export interface ReferrersReportQuery {
	dateFrom: string;
	dateTo: string;
	limit: number;
}

export interface CampaignsReportQuery {
	dateFrom: string;
	dateTo: string;
}

export interface StatsReport {
	views: number;
	visitors: number;
	reads: number;
	readRate: number;
	avgTimeSeconds: number;
	engagedViews: number;
	engagedRate: number;
	recircs: number;
	recircRate: number;
	scrollDepth: Record<string, number>;
	referrers: Record<string, number>;
	utmSources: Record<string, number>;
	utmMediums: Record<string, number>;
	utmCampaigns: Record<string, number>;
	countries: Record<string, number>;
	daily: Record<string, { views: number; visitors: number; reads: number; engagedViews: number }>;
}

export interface TopPageEntry {
	pathname: string;
	template: string;
	collection: string;
	views: number;
	visitors: number;
	reads: number;
	readRate: number;
	avgTime: number;
	engagedRate: number;
	recircRate: number;
}

export interface ReferrerEntry {
	domain: string;
	count: number;
}

export interface CampaignsReport {
	sources: Array<{ name: string; count: number }>;
	mediums: Array<{ name: string; count: number }>;
	campaigns: Array<{ name: string; count: number }>;
}

export type CampaignIntelligenceDimension = "source" | "medium" | "campaign";

export interface CampaignIntelligenceQuery {
	dateFrom: string;
	dateTo: string;
	dimension: CampaignIntelligenceDimension;
}

export interface CampaignIntelligenceEntry {
	name: string;
	views: number;
	visitors: number;
	reads: number;
	readRate: number;
	engagedViews: number;
	engagedRate: number;
	avgTimeSeconds: number;
	recircs: number;
	recircRate: number;
}

export interface CustomEventsReportQuery {
	dateFrom: string;
	dateTo: string;
	limit: number;
}

export interface CustomEventsReport {
	/** Top events sorted by count descending. */
	events: Array<{ name: string; count: number }>;
	/** Daily timeseries per event name: name → [[timestamp, count], ...]. */
	trends: Record<string, number[][]>;
}

export interface DetectedFormsQuery {
	dateFrom: string;
	dateTo: string;
	limit: number;
}

export interface PropertyBreakdownsQuery {
	dateFrom: string;
	dateTo: string;
	eventName: string;
	/** Maximum number of property keys to return (default 10). */
	maxKeys?: number;
	/** Maximum number of values per property key (default 10). */
	maxValuesPerKey?: number;
}

/**
 * Property breakdowns result: prop_key → { prop_value → count }.
 */
export type PropertyBreakdownsReport = Record<string, Record<string, number>>;

export interface FormsAnalyticsQuery {
	dateFrom: string;
	dateTo: string;
	totalVisitors: number;
	limit?: number;
}

export interface GoalsQuery {
	dateFrom: string;
	dateTo: string;
	totalVisitors: number;
	/** Active goal definitions. Empty array = auto-detect goals from event patterns. */
	goals: GoalDefinition[];
}

export interface AnalyticsReportingBackend {
	getStats(query: StatsReportQuery, storage: ReportingStorage): Promise<StatsReport>;
	getTopPages(query: TopPagesReportQuery, storage: ReportingStorage): Promise<TopPageEntry[]>;
	getReferrers(query: ReferrersReportQuery, storage: ReportingStorage): Promise<ReferrerEntry[]>;
	getCampaigns(query: CampaignsReportQuery, storage: ReportingStorage): Promise<CampaignsReport>;
	getCampaignIntelligence(query: CampaignIntelligenceQuery, storage: ReportingStorage): Promise<CampaignIntelligenceEntry[]>;
	getCustomEvents(query: CustomEventsReportQuery, storage: ReportingStorage): Promise<CustomEventsReport>;
	/** Returns unique form names detected from submit events in the date range. */
	getDetectedForms(query: DetectedFormsQuery, storage: ReportingStorage): Promise<string[]>;
	/** Returns property breakdowns for a specific event: prop_key → { prop_value → count }. */
	getPropertyBreakdowns(query: PropertyBreakdownsQuery, storage: ReportingStorage): Promise<PropertyBreakdownsReport>;
	/** Returns goal metric rows. If goals array is empty, auto-detects from event patterns. */
	getGoals(query: GoalsQuery, storage: ReportingStorage): Promise<GoalMetricRow[]>;
	/** Returns forms analytics rows: per-form submissions, visitors, and submit rate. */
	getFormsAnalytics(query: FormsAnalyticsQuery, storage: ReportingStorage): Promise<FormAnalyticsRow[]>;
}
