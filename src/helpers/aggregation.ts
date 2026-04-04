// ---------------------------------------------------------------------------
// Stats aggregation logic
// ---------------------------------------------------------------------------

import type { DailyStats } from "../types.js";

// ---------------------------------------------------------------------------
// Per-pathname aggregation bucket
// ---------------------------------------------------------------------------

export interface ByPathnameStats {
	views: number;
	visitors: Set<string>;
	reads: number;
	timeTotal: number;
	timeCount: number;
	template: string;
	collection: string;
	scroll25: number;
	scroll50: number;
	scroll75: number;
	scroll100: number;
	engagedViews: number;
	recircs: number;
}

// ---------------------------------------------------------------------------
// Full aggregation result
// ---------------------------------------------------------------------------

export interface AggregatedResult {
	totalViews: number;
	totalVisitors: number;
	totalReads: number;
	totalTime: number;
	totalTimeCount: number;
	totalScroll25: number;
	totalScroll50: number;
	totalScroll75: number;
	totalScroll100: number;
	totalEngagedViews: number;
	totalRecircs: number;
	byPathname: Map<string, ByPathnameStats>;
	byDate: Map<string, { views: number; visitors: number; reads: number; engagedViews: number }>;
	referrers: Record<string, number>;
	countries: Record<string, number>;
	utmSources: Record<string, number>;
	utmMediums: Record<string, number>;
	utmCampaigns: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Default daily stats values
// ---------------------------------------------------------------------------

const DAILY_STATS_DEFAULTS: Omit<DailyStats, "pathname" | "date" | "template" | "collection"> = {
	views: 0,
	visitors: [],
	reads: 0,
	timeTotal: 0,
	timeCount: 0,
	referrers: {},
	countries: {},
	utmSources: {},
	utmMediums: {},
	utmCampaigns: {},
	scroll25: 0,
	scroll50: 0,
	scroll75: 0,
	scroll100: 0,
	engagedViews: 0,
	recircs: 0,
};

/** Normalizes a partial DailyStats record, filling in defaults for missing fields. */
export function normalizeDailyStats(
	data: Partial<DailyStats> & Pick<DailyStats, "pathname" | "date">,
): DailyStats {
	return {
		template: "",
		collection: "",
		...DAILY_STATS_DEFAULTS,
		visitors: [],
		referrers: {},
		countries: {},
		utmSources: {},
		utmMediums: {},
		utmCampaigns: {},
		...data,
	};
}

// ---------------------------------------------------------------------------
// Merge record-type fields (referrers, countries, UTMs)
// ---------------------------------------------------------------------------

function mergeRecords(
	target: Record<string, number>,
	source: Record<string, number>,
): void {
	for (const [key, count] of Object.entries(source)) {
		target[key] = (target[key] ?? 0) + count;
	}
}

// ---------------------------------------------------------------------------
// Main aggregation function
// ---------------------------------------------------------------------------

/**
 * Aggregates an array of daily stats records into a unified result.
 * Produces totals, per-pathname breakdowns, per-date timeseries,
 * and merged referrer/country/UTM distributions.
 */
export function aggregateStats(
	items: Array<{ id: string; data: DailyStats }>,
): AggregatedResult {
	const result: AggregatedResult = {
		totalViews: 0,
		totalVisitors: 0,
		totalReads: 0,
		totalTime: 0,
		totalTimeCount: 0,
		totalScroll25: 0,
		totalScroll50: 0,
		totalScroll75: 0,
		totalScroll100: 0,
		totalEngagedViews: 0,
		totalRecircs: 0,
		byPathname: new Map(),
		byDate: new Map(),
		referrers: {},
		countries: {},
		utmSources: {},
		utmMediums: {},
		utmCampaigns: {},
	};

	const allVisitors = new Set<string>();

	for (const item of items) {
		const d = normalizeDailyStats(item.data);

		// Totals
		result.totalViews += d.views;
		result.totalReads += d.reads;
		result.totalTime += d.timeTotal;
		result.totalTimeCount += d.timeCount;
		result.totalScroll25 += d.scroll25;
		result.totalScroll50 += d.scroll50;
		result.totalScroll75 += d.scroll75;
		result.totalScroll100 += d.scroll100;
		result.totalEngagedViews += d.engagedViews;
		result.totalRecircs += d.recircs;

		for (const v of d.visitors) {
			allVisitors.add(v);
		}

		// By pathname
		let byPath = result.byPathname.get(d.pathname);
		if (!byPath) {
			byPath = {
				views: 0,
				visitors: new Set(),
				reads: 0,
				timeTotal: 0,
				timeCount: 0,
				template: d.template,
				collection: d.collection,
				scroll25: 0,
				scroll50: 0,
				scroll75: 0,
				scroll100: 0,
				engagedViews: 0,
				recircs: 0,
			};
			result.byPathname.set(d.pathname, byPath);
		}
		byPath.views += d.views;
		byPath.reads += d.reads;
		byPath.timeTotal += d.timeTotal;
		byPath.timeCount += d.timeCount;
		byPath.scroll25 += d.scroll25;
		byPath.scroll50 += d.scroll50;
		byPath.scroll75 += d.scroll75;
		byPath.scroll100 += d.scroll100;
		byPath.engagedViews += d.engagedViews;
		byPath.recircs += d.recircs;
		if (d.template && !byPath.template) byPath.template = d.template;
		if (d.collection && !byPath.collection) byPath.collection = d.collection;
		for (const v of d.visitors) {
			byPath.visitors.add(v);
		}

		// By date
		const dateVisitors = new Set<string>(d.visitors);
		let byDate = result.byDate.get(d.date);
		if (!byDate) {
			byDate = { views: 0, visitors: 0, reads: 0, engagedViews: 0 };
			result.byDate.set(d.date, byDate);
		}
		byDate.views += d.views;
		byDate.visitors += dateVisitors.size;
		byDate.reads += d.reads;
		byDate.engagedViews += d.engagedViews;

		// Merge distributions
		mergeRecords(result.referrers, d.referrers);
		mergeRecords(result.countries, d.countries ?? {});
		mergeRecords(result.utmSources, d.utmSources ?? {});
		mergeRecords(result.utmMediums, d.utmMediums ?? {});
		mergeRecords(result.utmCampaigns, d.utmCampaigns ?? {});
	}

	result.totalVisitors = allVisitors.size;
	return result;
}
