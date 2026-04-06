import type { TrackPayload } from "../types.js";
import { EVENT_TYPES } from "../constants.js";
import { isBot } from "../helpers/privacy.js";

const VALID_EVENT_TYPES = new Set<string>(EVENT_TYPES);

export function isBotRequest(ua: string): boolean {
	return isBot(ua);
}

export function isValidPayload(payload: TrackPayload): boolean {
	return !!(payload.t && payload.p && VALID_EVENT_TYPES.has(payload.t));
}

export function isExcludedPath(pathname: string, excludedPaths: string): boolean {
	if (!excludedPaths) return false;
	const prefixes = excludedPaths.split(",").map((p) => p.trim()).filter(Boolean);
	return prefixes.some((prefix) => pathname.startsWith(prefix));
}

export function isExcludedIp(ip: string, excludedIPs: string): boolean {
	if (!excludedIPs || ip === "unknown") return false;
	const ips = excludedIPs.split(",").map((i) => i.trim()).filter(Boolean);
	return ips.includes(ip);
}
