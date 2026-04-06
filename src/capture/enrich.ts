import type { TrackPayload } from "../types.js";
import type { NormalizedEvent } from "./types.js";
import { MAX_PATHNAME_LENGTH, MAX_ATTENTION_SECONDS, MAX_EVENT_NAME_LENGTH, MAX_CUSTOM_EVENT_PROPS } from "../constants.js";
import { hashIp, parseReferrerDomain } from "../helpers/privacy.js";
import { extractIp, extractCountry } from "../helpers/ip.js";
import { extractUtmFromPayload } from "../helpers/utm.js";
import { nowIso } from "../helpers/date.js";

function sanitizeUtmField(value: string | undefined): string {
	if (!value) return "";
	return value.trim().toLowerCase().slice(0, 256);
}

export function normalizePathname(raw: string): string {
	return raw.slice(0, MAX_PATHNAME_LENGTH);
}

export function normalizeTemplate(raw: string | undefined): string {
	return (raw ?? "").slice(0, 256);
}

export function normalizeCollection(raw: string | undefined): string {
	return (raw ?? "").slice(0, 256);
}

export function normalizeSeconds(type: string, raw: number | undefined): number {
	return type === "ping" ? Math.min(raw ?? 0, MAX_ATTENTION_SECONDS) : 0;
}

export function normalizeScrollDepth(type: string, raw: number | undefined): number {
	return type === "scroll" ? (raw ?? 0) : 0;
}

export function normalizeEventName(type: string, raw: string | undefined): string {
	return type === "custom" ? (raw ?? "").slice(0, MAX_EVENT_NAME_LENGTH) : "";
}

export function normalizeEventProps(type: string, raw: string | undefined): string {
	if (type !== "custom" || !raw) return "";
	try {
		const parsed = JSON.parse(raw);
		if (typeof parsed === "object" && parsed !== null) {
			const entries = Object.entries(parsed).slice(0, MAX_CUSTOM_EVENT_PROPS);
			return JSON.stringify(Object.fromEntries(entries));
		}
	} catch {
		// invalid JSON
	}
	return "";
}

export async function buildNormalizedEvent(
	payload: TrackPayload,
	headers: Headers,
	salt: string,
): Promise<NormalizedEvent> {
	const pathname = normalizePathname(payload.p);
	const ip = extractIp(headers);
	const visitorId = await hashIp(ip, salt);
	const country = extractCountry(headers);
	const utm = extractUtmFromPayload(payload);
	const referrer = parseReferrerDomain(payload.r ?? "");

	return {
		pathname,
		type: payload.t,
		referrer,
		visitorId,
		country,
		template: normalizeTemplate(payload.tpl),
		collection: normalizeCollection(payload.col),
		utmSource: utm.utmSource,
		utmMedium: utm.utmMedium,
		utmCampaign: utm.utmCampaign,
		utmTerm: sanitizeUtmField(payload.ut),
		utmContent: sanitizeUtmField(payload.ux),
		seconds: normalizeSeconds(payload.t, payload.s),
		scrollDepth: normalizeScrollDepth(payload.t, payload.d),
		eventName: normalizeEventName(payload.t, payload.n),
		eventProps: normalizeEventProps(payload.t, payload.pr),
		createdAt: nowIso(),
	};
}
