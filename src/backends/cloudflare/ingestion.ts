import type { NormalizedEvent } from "../../capture/types.js";
import type { AnalyticsIngestionBackend, IngestionStorage } from "../../ingestion/types.js";
import type { D1Database, D1PreparedStatement } from "./d1.js";
import { ensureD1Schema } from "./d1.js";
import { today } from "../../helpers/date.js";
import { MAX_EVENT_NAME_LENGTH, MAX_CUSTOM_EVENT_PROPS } from "../../constants.js";
import { writeEvent } from "../../storage/events.js";
import { writeCustomEvent } from "../../storage/custom-events.js";

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
// Shared helpers
// ---------------------------------------------------------------------------

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

/**
 * Extracts a form name from a custom event if it's a form submission.
 * Matches the same logic as catalog.extractForms:
 * - Event name must be "form_submit" or end with "_submit"
 * - Form name comes from props.form, props.source, or pathname fallback
 * Returns null if the event is not a form submission.
 */
function extractFormName(event: NormalizedEvent): string | null {
	const name = event.eventName;
	if (name !== "form_submit" && !name.endsWith("_submit")) return null;

	const props = parseEventProps(event.eventProps);
	const formName = String(props.form ?? props.source ?? event.pathname ?? "");
	return formName.length > 0 ? formName : null;
}

// ---------------------------------------------------------------------------
// D1 write helpers — build batched statements for each event type
// ---------------------------------------------------------------------------

const SCROLL_FIELDS = new Set(["scroll25", "scroll50", "scroll75", "scroll100"]);

/** Max length for property keys stored in D1. */
const MAX_PROP_KEY_LENGTH = 100;

/** Max length for property values stored in D1. */
const MAX_PROP_VALUE_LENGTH = 200;

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

		case "custom": {
			if (event.eventName) {
				const truncatedName = event.eventName.slice(0, MAX_EVENT_NAME_LENGTH);
				stmts.push(
					db.prepare(
						`INSERT INTO daily_custom_events (date, event_name, count) VALUES (?, ?, ?)
						 ON CONFLICT (date, event_name) DO UPDATE SET count = count + 1`,
					).bind(date, truncatedName, 1),
				);

				// Unique visitor tracking per custom event name (for goals)
				if (event.visitorId) {
					stmts.push(
						db.prepare(
							`INSERT OR IGNORE INTO daily_custom_event_visitors (date, event_name, visitor_id) VALUES (?, ?, ?)`,
						).bind(date, truncatedName, event.visitorId),
					);
				}

				// Property key/value pairs for property breakdowns
				const props = parseEventProps(event.eventProps);
				for (const [key, value] of Object.entries(props)) {
					const strValue = String(value).slice(0, MAX_PROP_VALUE_LENGTH);
					if (strValue.length > 0) {
						stmts.push(
							db.prepare(
								`INSERT INTO daily_custom_event_props (date, event_name, prop_key, prop_value, count) VALUES (?, ?, ?, ?, ?)
								 ON CONFLICT (date, event_name, prop_key, prop_value) DO UPDATE SET count = count + 1`,
							).bind(date, truncatedName, key.slice(0, MAX_PROP_KEY_LENGTH), strValue, 1),
						);
					}
				}

				// Form submission detection for catalog discovery
				const formName = extractFormName(event);
				if (formName) {
					stmts.push(
						db.prepare(
							`INSERT INTO daily_form_submissions (date, form_name, count) VALUES (?, ?, ?)
							 ON CONFLICT (date, form_name) DO UPDATE SET count = count + 1`,
						).bind(date, formName, 1),
					);

					// Unique visitor tracking per form (for goals)
					if (event.visitorId) {
						stmts.push(
							db.prepare(
								`INSERT OR IGNORE INTO daily_form_visitors (date, form_name, visitor_id) VALUES (?, ?, ?)`,
							).bind(date, formName, event.visitorId),
						);
					}
				}
			}
			break;
		}
	}

	return stmts;
}

// ---------------------------------------------------------------------------
// Portable legacy writer — events + custom_events only (no daily_stats)
// ---------------------------------------------------------------------------
//
// Remaining portable reads in CF mode (all Pro-gated):
//
// events:
//   - dashboard funnels section (queryRawEvents, gated by isPro)
//
// custom_events:
//   - dashboard forms analytics    (canViewFormsAnalytics, Pro)
//
// NOT read by (already migrated to D1/reporting backend):
//   - core dashboard stats, top pages, referrers, campaigns
//   - custom events listing + trends
//   - catalog (pages, event names, forms)
//   - property breakdowns
//   - goals (all three types: page, event, form)
//
// Making writes conditional on license is not viable because:
//   - handleTrack() has no license info (adding KV read adds latency)
//   - license can change between write time and read time
//   - ingestion should remain plan-agnostic
//
// To fully eliminate these writes, migrate funnels and forms-analytics
// to D1 or AE. Each is an independent future slice.
// ---------------------------------------------------------------------------

/**
 * Writes raw events and custom events to portable storage.
 * Skips daily_stats — D1 handles aggregated reporting in CF mode.
 *
 * These writes serve exclusively Pro features (funnels, goals,
 * forms analytics, property breakdowns). They cannot be conditioned
 * on license at ingestion time without coupling ingestion to licensing.
 */
async function writePortableLegacy(event: NormalizedEvent, storage: IngestionStorage): Promise<void> {
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
}

// ---------------------------------------------------------------------------
// CloudflareIngestionBackend
// ---------------------------------------------------------------------------

/**
 * Ingestion backend that writes to:
 * 1. Cloudflare Analytics Engine (raw event stream, source of truth)
 * 2. D1 (aggregated tables for real-time reporting)
 * 3. Portable storage — events + custom_events only (Pro feature reads)
 *
 * Does NOT write to portable daily_stats. Core reporting reads from D1.
 * Portable writes cannot be removed until Pro sections (funnels, goals,
 * forms analytics, property breakdowns) are migrated to D1/AE.
 */
export class CloudflareIngestionBackend implements AnalyticsIngestionBackend {
	private readonly dataset: AnalyticsEngineDataset;
	private readonly d1: D1Database;

	constructor(dataset: AnalyticsEngineDataset, d1: D1Database) {
		this.dataset = dataset;
		this.d1 = d1;
	}

	async ingest(event: NormalizedEvent, storage: IngestionStorage): Promise<void> {
		// 1. Write to Analytics Engine (fire-and-forget, source of truth)
		this.dataset.writeDataPoint(serializeEvent(event));

		// 2. Write aggregated data to D1 (powers CloudflareReportingBackend)
		await ensureD1Schema(this.d1);
		const date = today();
		const stmts = buildD1Statements(this.d1, event, date);
		await this.d1.batch(stmts);

		// 3. Write raw events + custom events to portable storage (legacy reads)
		await writePortableLegacy(event, storage);
	}
}
