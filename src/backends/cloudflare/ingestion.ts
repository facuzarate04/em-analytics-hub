import type { NormalizedEvent } from "../../capture/types.js";
import type { AnalyticsIngestionBackend, IngestionStorage } from "../../ingestion/types.js";
import type { D1Database, D1PreparedStatement } from "./d1.js";
import { ensureD1Schema } from "./d1.js";
import { today } from "../../helpers/date.js";

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

// ---------------------------------------------------------------------------
// D1 write helpers — build batched statements for each event type
// ---------------------------------------------------------------------------

const SCROLL_FIELDS = new Set(["scroll25", "scroll50", "scroll75", "scroll100"]);

function buildD1Statements(db: D1Database, event: NormalizedEvent, date: string): D1PreparedStatement[] {
	const stmts: D1PreparedStatement[] = [];

	// Ensure daily_pages row exists with template/collection
	stmts.push(
		db.prepare(
			`INSERT INTO daily_pages (date, pathname, template, collection)
			 VALUES (?, ?, ?, ?)
			 ON CONFLICT (date, pathname) DO UPDATE SET
			   template = CASE WHEN daily_pages.template = '' THEN excluded.template ELSE daily_pages.template END,
			   collection = CASE WHEN daily_pages.collection = '' THEN excluded.collection ELSE daily_pages.collection END`,
		).bind(date, event.pathname, event.template, event.collection),
	);

	switch (event.type) {
		case "pageview": {
			stmts.push(
				db.prepare(
					`UPDATE daily_pages SET views = views + 1 WHERE date = ? AND pathname = ?`,
				).bind(date, event.pathname),
			);

			// Unique visitor tracking
			stmts.push(
				db.prepare(
					`INSERT OR IGNORE INTO daily_visitors (date, pathname, visitor_id) VALUES (?, ?, ?)`,
				).bind(date, event.pathname, event.visitorId),
			);

			// Referrer
			if (event.referrer) {
				stmts.push(
					db.prepare(
						`INSERT INTO daily_referrers (date, referrer, count) VALUES (?, ?, ?)
						 ON CONFLICT (date, referrer) DO UPDATE SET count = count + 1`,
					).bind(date, event.referrer, 1),
				);
			}

			// Country
			if (event.country) {
				stmts.push(
					db.prepare(
						`INSERT INTO daily_countries (date, country, count) VALUES (?, ?, ?)
						 ON CONFLICT (date, country) DO UPDATE SET count = count + 1`,
					).bind(date, event.country, 1),
				);
			}

			// UTM dimensions
			if (event.utmSource) {
				stmts.push(
					db.prepare(
						`INSERT INTO daily_campaigns (date, dimension, name, count) VALUES (?, ?, ?, ?)
						 ON CONFLICT (date, dimension, name) DO UPDATE SET count = count + 1`,
					).bind(date, "source", event.utmSource, 1),
				);
			}
			if (event.utmMedium) {
				stmts.push(
					db.prepare(
						`INSERT INTO daily_campaigns (date, dimension, name, count) VALUES (?, ?, ?, ?)
						 ON CONFLICT (date, dimension, name) DO UPDATE SET count = count + 1`,
					).bind(date, "medium", event.utmMedium, 1),
				);
			}
			if (event.utmCampaign) {
				stmts.push(
					db.prepare(
						`INSERT INTO daily_campaigns (date, dimension, name, count) VALUES (?, ?, ?, ?)
						 ON CONFLICT (date, dimension, name) DO UPDATE SET count = count + 1`,
					).bind(date, "campaign", event.utmCampaign, 1),
				);
			}
			break;
		}

		case "scroll": {
			const field = `scroll${event.scrollDepth}`;
			if (SCROLL_FIELDS.has(field)) {
				stmts.push(
					db.prepare(
						`UPDATE daily_pages SET ${field} = ${field} + 1 WHERE date = ? AND pathname = ?`,
					).bind(date, event.pathname),
				);
			}
			break;
		}

		case "ping": {
			if (event.seconds > 0) {
				stmts.push(
					db.prepare(
						`UPDATE daily_pages SET time_total = time_total + ?, time_count = time_count + 1 WHERE date = ? AND pathname = ?`,
					).bind(event.seconds, date, event.pathname),
				);
			}
			break;
		}

		case "read": {
			stmts.push(
				db.prepare(
					`UPDATE daily_pages SET reads = reads + 1 WHERE date = ? AND pathname = ?`,
				).bind(date, event.pathname),
			);
			break;
		}

		case "engaged": {
			stmts.push(
				db.prepare(
					`UPDATE daily_pages SET engaged_views = engaged_views + 1 WHERE date = ? AND pathname = ?`,
				).bind(date, event.pathname),
			);
			break;
		}

		case "recirc": {
			stmts.push(
				db.prepare(
					`UPDATE daily_pages SET recircs = recircs + 1 WHERE date = ? AND pathname = ?`,
				).bind(date, event.pathname),
			);
			break;
		}
	}

	return stmts;
}

// ---------------------------------------------------------------------------
// CloudflareIngestionBackend
// ---------------------------------------------------------------------------

/**
 * Ingestion backend that writes to:
 * 1. Cloudflare Analytics Engine (raw event stream, source of truth)
 * 2. D1 (aggregated tables for real-time reporting)
 * 3. Portable storage (TEMPORARY — partial, see below)
 *
 * Portable write status:
 * - daily_stats: NO LONGER READ in CF mode. Core dashboard, widget, routes,
 *   and catalog all use the reporting backend (which reads from D1).
 *   Kept only because PortableIngestionBackend writes all 3 atomically.
 * - events: READ by Pro funnels section in dashboard (queryRawEvents).
 * - custom_events: READ by Pro funnels, custom events section, and catalog
 *   (queryCustomEvents for counts/trends/properties/forms).
 *
 * To fully remove the portable write, the remaining reads (events,
 * custom_events) need their own reporting backend methods or D1 tables.
 */
export class CloudflareIngestionBackend implements AnalyticsIngestionBackend {
	private readonly dataset: AnalyticsEngineDataset;
	private readonly d1: D1Database;
	private readonly portableFallback: AnalyticsIngestionBackend;

	constructor(
		dataset: AnalyticsEngineDataset,
		d1: D1Database,
		portableFallback: AnalyticsIngestionBackend,
	) {
		this.dataset = dataset;
		this.d1 = d1;
		this.portableFallback = portableFallback;
	}

	async ingest(event: NormalizedEvent, storage: IngestionStorage): Promise<void> {
		// 1. Write to Analytics Engine (fire-and-forget, source of truth)
		this.dataset.writeDataPoint(serializeEvent(event));

		// 2. Write aggregated data to D1 (powers CloudflareReportingBackend)
		await ensureD1Schema(this.d1);
		const date = today();
		const stmts = buildD1Statements(this.d1, event, date);
		await this.d1.batch(stmts);

		// 3. TEMPORARY: delegate to portable backend so admin UI stays current
		// TODO: remove once admin dashboard reads from reporting backend
		await this.portableFallback.ingest(event, storage);
	}
}
