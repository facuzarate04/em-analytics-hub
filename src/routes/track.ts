// ---------------------------------------------------------------------------
// POST /track — Public beacon endpoint
// ---------------------------------------------------------------------------

import type { PluginContext } from "emdash";
import type { TrackPayload } from "../types.js";
import { MAX_EVENT_NAME_LENGTH, MAX_CUSTOM_EVENT_PROPS, KV_KEYS } from "../constants.js";
import { today } from "../helpers/date.js";
import { writeEvent } from "../storage/events.js";
import { getOrCreateDailyStats, saveDailyStats } from "../storage/stats.js";
import { writeCustomEvent } from "../storage/custom-events.js";
import { captureEvent } from "../capture/index.js";
import type { NormalizedEvent } from "../capture/index.js";

/**
 * Handles incoming beacon events from the client-side tracking script.
 * Validates input, filters bots/excluded paths, hashes visitor identity,
 * stores raw events and updates daily aggregates.
 */
export async function handleTrack(
	routeCtx: { request: Request; input?: unknown },
	ctx: PluginContext,
): Promise<Record<string, unknown>> {
	const request = routeCtx.request;
	const payload = (routeCtx.input ?? {}) as TrackPayload;

	const excludedPaths = (await ctx.kv.get<string>(KV_KEYS.SETTINGS_EXCLUDED_PATHS)) ?? "/_emdash/,/admin/";
	const excludedIPs = (await ctx.kv.get<string>(KV_KEYS.SETTINGS_EXCLUDED_IPS)) ?? "";

	let salt = await ctx.kv.get<string>(KV_KEYS.DAILY_SALT);
	if (!salt) {
		salt = crypto.randomUUID();
		await ctx.kv.set(KV_KEYS.DAILY_SALT, salt);
	}

	const result = await captureEvent(payload, request.headers, {
		excludedPaths,
		excludedIPs,
		salt,
	});

	if (!result.accepted) {
		return result.reason === "invalid" ? { error: "Bad request" } : { ok: true };
	}

	const ev = result.event;

	// ── Write raw event ──────────────────────────────────────────
	await writeEvent(ctx.storage.events as any, ev);

	// ── Write custom event to dedicated collection ───────────────
	if (ev.type === "custom" && ev.eventName) {
		let props: Record<string, string | number | boolean> = {};
		if (ev.eventProps) {
			try {
				const parsed = JSON.parse(ev.eventProps);
				if (typeof parsed === "object" && parsed !== null) {
					const entries = Object.entries(parsed).slice(0, MAX_CUSTOM_EVENT_PROPS);
					props = Object.fromEntries(entries) as Record<string, string | number | boolean>;
				}
			} catch {
				// Invalid JSON — ignore props
			}
		}

		await writeCustomEvent(ctx.storage.custom_events as any, {
			name: ev.eventName.slice(0, MAX_EVENT_NAME_LENGTH),
			pathname: ev.pathname,
			props,
			visitorId: ev.visitorId,
			createdAt: ev.createdAt,
		});
	}

	// ── Update daily aggregate ────────────────────────────────────
	const date = today();
	const stats = await getOrCreateDailyStats(ctx.storage.daily_stats as any, ev.pathname, date);

	if (ev.template && !stats.template) stats.template = ev.template;
	if (ev.collection && !stats.collection) stats.collection = ev.collection;

	updateStatsFromEvent(stats, ev);

	await saveDailyStats(ctx.storage.daily_stats as any, stats);

	return { ok: true };
}

function updateStatsFromEvent(stats: any, ev: NormalizedEvent): void {
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
