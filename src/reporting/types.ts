import type { DailyStats } from "../types.js";
import type { StorageCollection } from "../storage/queries.js";

export interface ReportingStorage {
	daily_stats: StorageCollection<DailyStats>;
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

export interface AnalyticsReportingBackend {
	getStats(query: StatsReportQuery, storage: ReportingStorage): Promise<StatsReport>;
	getTopPages(query: TopPagesReportQuery, storage: ReportingStorage): Promise<TopPageEntry[]>;
	getReferrers(query: ReferrersReportQuery, storage: ReportingStorage): Promise<ReferrerEntry[]>;
	getCampaigns(query: CampaignsReportQuery, storage: ReportingStorage): Promise<CampaignsReport>;
}
