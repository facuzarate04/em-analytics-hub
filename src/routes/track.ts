// ---------------------------------------------------------------------------
// POST /track — Public beacon endpoint
// ---------------------------------------------------------------------------

import type { PluginContext } from "emdash";
import type { RawEvent, TrackPayload, EventType } from "../types.js";
import { EVENT_TYPES, MAX_PATHNAME_LENGTH, MAX_ATTENTION_SECONDS, MAX_EVENT_NAME_LENGTH, MAX_CUSTOM_EVENT_PROPS, KV_KEYS } from "../constants.js";
import { today, nowIso } from "../helpers/date.js";
import { hashIp, isBot, parseReferrerDomain } from "../helpers/privacy.js";
import { extractIp, extractCountry } from "../helpers/ip.js";
import { extractUtmFromPayload } from "../helpers/utm.js";
import { writeEvent } from "../storage/events.js";
import { getOrCreateDailyStats, saveDailyStats } from "../storage/stats.js";
import { writeCustomEvent } from "../storage/custom-events.js";

const VALID_EVENT_TYPES = new Set<string>(EVENT_TYPES);

function sanitizeUtmField(value: string | undefined): string {
	if (!value) return "";
	return value.trim().toLowerCase().slice(0, 256);
}

/**
 * Checks if a pathname should be excluded from tracking
 * based on the configured excluded paths list.
 */
function isExcludedPath(pathname: string, excludedPaths: string): boolean {
	if (!excludedPaths) return false;
	const prefixes = excludedPaths.split(",").map((p) => p.trim()).filter(Boolean);
	return prefixes.some((prefix) => pathname.startsWith(prefix));
}

/**
 * Checks if an IP should be excluded from tracking
 * based on the configured excluded IPs list.
 */
function isExcludedIp(ip: string, excludedIPs: string): boolean {
	if (!excludedIPs || ip === "unknown") return false;
	const ips = excludedIPs.split(",").map((i) => i.trim()).filter(Boolean);
	return ips.includes(ip);
}

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

	// Bot filtering
	const ua = request.headers.get("user-agent") ?? "";
	if (isBot(ua)) {
		return { ok: true };
	}

	// Parse payload
	const payload = (routeCtx.input ?? {}) as TrackPayload;

	if (!payload.t || !payload.p || !VALID_EVENT_TYPES.has(payload.t)) {
		return { error: "Bad request" };
	}

	// Truncate pathname
	const pathname = payload.p.slice(0, MAX_PATHNAME_LENGTH);

	// Check excluded paths
	const excludedPaths = (await ctx.kv.get<string>(KV_KEYS.SETTINGS_EXCLUDED_PATHS)) ?? "/_emdash/,/admin/";
	if (isExcludedPath(pathname, excludedPaths)) {
		return { ok: true };
	}

	// Check excluded IPs
	const ip = extractIp(request.headers);
	const excludedIPs = (await ctx.kv.get<string>(KV_KEYS.SETTINGS_EXCLUDED_IPS)) ?? "";
	if (isExcludedIp(ip, excludedIPs)) {
		return { ok: true };
	}

	// Resolve visitor identity
	let salt = await ctx.kv.get<string>(KV_KEYS.DAILY_SALT);
	if (!salt) {
		salt = crypto.randomUUID();
		await ctx.kv.set(KV_KEYS.DAILY_SALT, salt);
	}
	const visitorId = await hashIp(ip, salt);

	// Country from Cloudflare header (empty on Node)
	const country = extractCountry(request.headers);

	// UTM extraction
	const utm = extractUtmFromPayload(payload);

	// Referrer
	const referrer = parseReferrerDomain(payload.r ?? "");

	// Template and collection from beacon
	const template = (payload.tpl ?? "").slice(0, 256);
	const collection = (payload.col ?? "").slice(0, 256);

	const seconds = Math.min(payload.s ?? 0, MAX_ATTENTION_SECONDS);
	const date = today();

	// ── Write raw event ──────────────────────────────────────────
	const rawEvent: RawEvent = {
		pathname,
		type: payload.t,
		referrer,
		visitorId,
		country,
		template,
		collection,
		utmSource: utm.utmSource,
		utmMedium: utm.utmMedium,
		utmCampaign: utm.utmCampaign,
		utmTerm: sanitizeUtmField(payload.ut),
		utmContent: sanitizeUtmField(payload.ux),
		seconds: payload.t === "ping" ? seconds : 0,
		scrollDepth: payload.t === "scroll" ? (payload.d ?? 0) : 0,
		eventName: payload.t === "custom" ? (payload.n ?? "").slice(0, MAX_EVENT_NAME_LENGTH) : "",
		eventProps: payload.t === "custom" ? (payload.pr ?? "") : "",
		createdAt: nowIso(),
	};

	await writeEvent(ctx.storage.events as any, rawEvent);

	// ── Write custom event to dedicated collection ───────────────
	if (payload.t === "custom" && payload.n) {
		let props: Record<string, string | number | boolean> = {};
		if (payload.pr) {
			try {
				const parsed = JSON.parse(payload.pr);
				if (typeof parsed === "object" && parsed !== null) {
					const entries = Object.entries(parsed).slice(0, MAX_CUSTOM_EVENT_PROPS);
					props = Object.fromEntries(entries) as Record<string, string | number | boolean>;
				}
			} catch {
				// Invalid JSON — ignore props
			}
		}

		await writeCustomEvent(ctx.storage.custom_events as any, {
			name: payload.n.slice(0, MAX_EVENT_NAME_LENGTH),
			pathname,
			props,
			visitorId,
			createdAt: nowIso(),
		});
	}

	// ── Update daily aggregate ────────────────────────────────────
	const stats = await getOrCreateDailyStats(ctx.storage.daily_stats as any, pathname, date);

	// Set template/collection if not already set for this stats record
	if (template && !stats.template) stats.template = template;
	if (collection && !stats.collection) stats.collection = collection;

	switch (payload.t) {
		case "pageview": {
			stats.views += 1;
			if (!stats.visitors.includes(visitorId)) {
				stats.visitors.push(visitorId);
			}
			stats.referrers[referrer] = (stats.referrers[referrer] ?? 0) + 1;
			if (country) {
				stats.countries[country] = (stats.countries[country] ?? 0) + 1;
			}
			if (utm.utmSource) {
				stats.utmSources[utm.utmSource] = (stats.utmSources[utm.utmSource] ?? 0) + 1;
			}
			if (utm.utmMedium) {
				stats.utmMediums[utm.utmMedium] = (stats.utmMediums[utm.utmMedium] ?? 0) + 1;
			}
			if (utm.utmCampaign) {
				stats.utmCampaigns[utm.utmCampaign] = (stats.utmCampaigns[utm.utmCampaign] ?? 0) + 1;
			}
			break;
		}
		case "read": {
			stats.reads += 1;
			break;
		}
		case "ping": {
			if (seconds > 0) {
				stats.timeTotal += seconds;
				stats.timeCount += 1;
			}
			break;
		}
		case "scroll": {
			const depth = payload.d;
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

	await saveDailyStats(ctx.storage.daily_stats as any, stats);

	return { ok: true };
}
