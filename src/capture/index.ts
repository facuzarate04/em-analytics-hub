import type { TrackPayload } from "../types.js";
import type { CaptureResult, CaptureContext } from "./types.js";
import { isBotRequest, isValidPayload, isExcludedPath, isExcludedIp } from "./filters.js";
import { normalizePathname, buildNormalizedEvent } from "./enrich.js";
import { extractIp } from "../helpers/ip.js";

export type { NormalizedEvent, CaptureResult, CaptureContext } from "./types.js";

export async function captureEvent(
	payload: TrackPayload,
	headers: Headers,
	captureCtx: CaptureContext,
): Promise<CaptureResult> {
	const ua = headers.get("user-agent") ?? "";
	if (isBotRequest(ua)) {
		return { accepted: false, reason: "bot" };
	}

	if (!isValidPayload(payload)) {
		return { accepted: false, reason: "invalid" };
	}

	const pathname = normalizePathname(payload.p);
	if (isExcludedPath(pathname, captureCtx.excludedPaths)) {
		return { accepted: false, reason: "excluded_path" };
	}

	const ip = extractIp(headers);
	if (isExcludedIp(ip, captureCtx.excludedIPs)) {
		return { accepted: false, reason: "excluded_ip" };
	}

	const event = await buildNormalizedEvent(payload, headers, captureCtx.salt);
	return { accepted: true, event };
}
