// ---------------------------------------------------------------------------
// Campaign Intelligence — Pro feature
// ---------------------------------------------------------------------------
//
// Cross-references UTM campaigns with engagement metrics to answer:
// - Which campaigns drive real engagement?
// - Which sources have the best read rate?
// - Where does traffic convert vs bounce?
//

import type { DailyStats } from "../types.js";

/** Per-campaign aggregated metrics for intelligence view. */
export interface CampaignMetrics {
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

/**
 * Aggregates campaign-level metrics from daily stats.
 * Groups by UTM source, medium, or campaign and cross-references
 * with engagement, read rate, and recirculation data.
 *
 * This is the core of "campaign intelligence" — not just views per campaign,
 * but quality metrics per campaign.
 */
export function aggregateCampaignIntelligence(
	items: Array<{ id: string; data: DailyStats }>,
	dimension: "source" | "medium" | "campaign",
): CampaignMetrics[] {
	const buckets = new Map<string, {
		views: number;
		visitors: Set<string>;
		reads: number;
		engagedViews: number;
		timeTotal: number;
		timeCount: number;
		recircs: number;
	}>();

	for (const item of items) {
		const d = item.data;
		const utmMap = dimension === "source"
			? d.utmSources
			: dimension === "medium"
				? d.utmMediums
				: d.utmCampaigns;

		if (!utmMap) continue;

		for (const [name, count] of Object.entries(utmMap)) {
			if (!name) continue;

			let bucket = buckets.get(name);
			if (!bucket) {
				bucket = {
					views: 0,
					visitors: new Set(),
					reads: 0,
					engagedViews: 0,
					timeTotal: 0,
					timeCount: 0,
					recircs: 0,
				};
				buckets.set(name, bucket);
			}

			// Views from this UTM dimension
			bucket.views += count;

			// Proportional engagement metrics based on UTM share of total views
			const totalViews = d.views || 1;
			const ratio = count / totalViews;

			bucket.reads += Math.round(d.reads * ratio);
			bucket.engagedViews += Math.round(d.engagedViews * ratio);
			bucket.timeTotal += Math.round(d.timeTotal * ratio);
			bucket.timeCount += Math.round(d.timeCount * ratio);
			bucket.recircs += Math.round(d.recircs * ratio);

			// Visitors (proportional estimate)
			const visitorSlice = Math.ceil(d.visitors.length * ratio);
			for (let i = 0; i < Math.min(visitorSlice, d.visitors.length); i++) {
				bucket.visitors.add(d.visitors[i]);
			}
		}
	}

	// Convert to metrics array
	const results: CampaignMetrics[] = [];

	for (const [name, data] of buckets) {
		results.push({
			name,
			views: data.views,
			visitors: data.visitors.size,
			reads: data.reads,
			readRate: data.views > 0 ? Math.round((data.reads / data.views) * 100) : 0,
			engagedViews: data.engagedViews,
			engagedRate: data.views > 0 ? Math.round((data.engagedViews / data.views) * 100) : 0,
			avgTimeSeconds: data.timeCount > 0 ? Math.round(data.timeTotal / data.timeCount) : 0,
			recircs: data.recircs,
			recircRate: data.views > 0 ? Math.round((data.recircs / data.views) * 100) : 0,
		});
	}

	return results.sort((a, b) => b.views - a.views);
}
