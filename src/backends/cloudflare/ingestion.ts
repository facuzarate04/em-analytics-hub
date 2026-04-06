import type { NormalizedEvent } from "../../capture/types.js";
import type { AnalyticsIngestionBackend, IngestionStorage } from "../../ingestion/types.js";

/**
 * Minimal typed interface for the Cloudflare Analytics Engine dataset binding.
 * @see https://developers.cloudflare.com/analytics/analytics-engine/get-started/
 */
export interface AnalyticsEngineDataset {
	writeDataPoint(event: AnalyticsEngineDataPoint): void;
}

export interface AnalyticsEngineDataPoint {
	indexes?: string[];
	blobs?: (string | ArrayBuffer | Uint8Array | null)[];
	doubles?: number[];
}

/**
 * Serialization layout for NormalizedEvent → Analytics Engine datapoint.
 *
 * indexes[0]: eventType (primary query dimension)
 *
 * blobs[0]:  pathname
 * blobs[1]:  referrer
 * blobs[2]:  visitorId
 * blobs[3]:  country
 * blobs[4]:  template
 * blobs[5]:  collection
 * blobs[6]:  utmSource
 * blobs[7]:  utmMedium
 * blobs[8]:  utmCampaign
 * blobs[9]:  utmTerm
 * blobs[10]: utmContent
 * blobs[11]: eventName
 * blobs[12]: eventProps
 * blobs[13]: createdAt
 *
 * doubles[0]: seconds
 * doubles[1]: scrollDepth
 */
export function serializeEvent(event: NormalizedEvent): AnalyticsEngineDataPoint {
	return {
		indexes: [event.type],
		blobs: [
			event.pathname,
			event.referrer,
			event.visitorId,
			event.country,
			event.template,
			event.collection,
			event.utmSource,
			event.utmMedium,
			event.utmCampaign,
			event.utmTerm,
			event.utmContent,
			event.eventName,
			event.eventProps,
			event.createdAt,
		],
		doubles: [
			event.seconds,
			event.scrollDepth,
		],
	};
}

/**
 * Ingestion backend that writes to Cloudflare Analytics Engine AND delegates
 * to the portable backend for storage writes.
 *
 * TEMPORARY dual-write strategy:
 * While reporting is still backed by PortableReportingBackend (reads from
 * daily_stats, events, custom_events), we must keep those collections updated.
 * Once CloudflareReportingBackend (D1) is implemented in Slice 4, the portable
 * delegation can be removed and this backend will only write to Analytics Engine.
 *
 * Write order: Analytics Engine first (synchronous, fire-and-forget per CF API),
 * then portable storage writes (async, updates dashboard collections).
 */
export class CloudflareIngestionBackend implements AnalyticsIngestionBackend {
	private readonly dataset: AnalyticsEngineDataset;
	private readonly portableFallback: AnalyticsIngestionBackend;

	constructor(dataset: AnalyticsEngineDataset, portableFallback: AnalyticsIngestionBackend) {
		this.dataset = dataset;
		this.portableFallback = portableFallback;
	}

	async ingest(event: NormalizedEvent, storage: IngestionStorage): Promise<void> {
		// 1. Write to Analytics Engine (source of truth for future CF reporting)
		this.dataset.writeDataPoint(serializeEvent(event));

		// 2. TEMPORARY: delegate to portable backend so dashboard/routes stay current
		// TODO: remove once CloudflareReportingBackend reads from D1/AE directly
		await this.portableFallback.ingest(event, storage);
	}
}
