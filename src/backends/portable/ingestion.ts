import type { NormalizedEvent } from "../../capture/types.js";
import type { AnalyticsIngestionBackend, IngestionStorage } from "../../ingestion/types.js";
import type { DailyStats } from "../../types.js";
import { MAX_EVENT_NAME_LENGTH, MAX_CUSTOM_EVENT_PROPS } from "../../constants.js";
import { today } from "../../helpers/date.js";
import { writeEvent } from "../../storage/events.js";
import { getOrCreateDailyStats, saveDailyStats } from "../../storage/stats.js";
import { writeCustomEvent } from "../../storage/custom-events.js";

function parseEventProps(raw: string): Record<string, string | number | boolean> {
	if (!raw) return {};
	try {
		const parsed = JSON.parse(raw);
		if (typeof parsed === "object" && parsed !== null) {
			const entries = Object.entries(parsed).slice(0, MAX_CUSTOM_EVENT_PROPS);
			return Object.fromEntries(entries) as Record<string, string | number | boolean>;
		}
	} catch {
		// invalid JSON
	}
	return {};
}

function updateStats(stats: DailyStats, ev: NormalizedEvent): void {
	switch (ev.type) {
		case "pageview": {
			stats.views += 1;
			if (!stats.visitors.includes(ev.visitorId)) {
				stats.visitors.push(ev.visitorId);
			}
			stats.referrers[ev.referrer] = (stats.referrers[ev.referrer] ?? 0) + 1;
			if (ev.country) {
				stats.countries[ev.country] = (stats.countries[ev.country] ?? 0) + 1;
			}
			if (ev.utmSource) {
				stats.utmSources[ev.utmSource] = (stats.utmSources[ev.utmSource] ?? 0) + 1;
			}
			if (ev.utmMedium) {
				stats.utmMediums[ev.utmMedium] = (stats.utmMediums[ev.utmMedium] ?? 0) + 1;
			}
			if (ev.utmCampaign) {
				stats.utmCampaigns[ev.utmCampaign] = (stats.utmCampaigns[ev.utmCampaign] ?? 0) + 1;
			}
			break;
		}
		case "read": {
			stats.reads += 1;
			break;
		}
		case "ping": {
			if (ev.seconds > 0) {
				stats.timeTotal += ev.seconds;
				stats.timeCount += 1;
			}
			break;
		}
		case "scroll": {
			const depth = ev.scrollDepth;
			if (depth === 25) stats.scroll25 += 1;
			else if (depth === 50) stats.scroll50 += 1;
			else if (depth === 75) stats.scroll75 += 1;
			else if (depth === 100) stats.scroll100 += 1;
			break;
		}
		case "engaged": {
			stats.engagedViews += 1;
			break;
		}
		case "recirc": {
			stats.recircs += 1;
			break;
		}
	}
}

export class PortableIngestionBackend implements AnalyticsIngestionBackend {
	async ingest(event: NormalizedEvent, storage: IngestionStorage): Promise<void> {
		await writeEvent(storage.events, event);

		if (event.type === "custom" && event.eventName) {
			await writeCustomEvent(storage.custom_events, {
				name: event.eventName.slice(0, MAX_EVENT_NAME_LENGTH),
				pathname: event.pathname,
				props: parseEventProps(event.eventProps),
				visitorId: event.visitorId,
				createdAt: event.createdAt,
			});
		}

		const date = today();
		const stats = await getOrCreateDailyStats(storage.daily_stats, event.pathname, date);

		if (event.template && !stats.template) stats.template = event.template;
		if (event.collection && !stats.collection) stats.collection = event.collection;

		updateStats(stats, event);

		await saveDailyStats(storage.daily_stats, stats);
	}
}
