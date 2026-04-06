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
} from "./types.js";

export async function getStatsReport(
	backend: AnalyticsReportingBackend,
	query: StatsReportQuery,
	storage: ReportingStorage,
): Promise<StatsReport> {
	return backend.getStats(query, storage);
}

export async function getTopPagesReport(
	backend: AnalyticsReportingBackend,
	query: TopPagesReportQuery,
	storage: ReportingStorage,
): Promise<TopPageEntry[]> {
	return backend.getTopPages(query, storage);
}

export async function getReferrersReport(
	backend: AnalyticsReportingBackend,
	query: ReferrersReportQuery,
	storage: ReportingStorage,
): Promise<ReferrerEntry[]> {
	return backend.getReferrers(query, storage);
}

export async function getCampaignsReport(
	backend: AnalyticsReportingBackend,
	query: CampaignsReportQuery,
	storage: ReportingStorage,
): Promise<CampaignsReport> {
	return backend.getCampaigns(query, storage);
}

export async function getCampaignIntelligenceReport(
	backend: AnalyticsReportingBackend,
	query: CampaignIntelligenceQuery,
	storage: ReportingStorage,
): Promise<CampaignIntelligenceEntry[]> {
	return backend.getCampaignIntelligence(query, storage);
}

export async function getCustomEventsReport(
	backend: AnalyticsReportingBackend,
	query: CustomEventsReportQuery,
	storage: ReportingStorage,
): Promise<CustomEventsReport> {
	return backend.getCustomEvents(query, storage);
}

export async function getDetectedFormsReport(
	backend: AnalyticsReportingBackend,
	query: DetectedFormsQuery,
	storage: ReportingStorage,
): Promise<string[]> {
	return backend.getDetectedForms(query, storage);
}
