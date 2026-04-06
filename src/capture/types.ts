import type { EventType } from "../types.js";

export interface NormalizedEvent {
	pathname: string;
	type: EventType;
	referrer: string;
	visitorId: string;
	country: string;
	template: string;
	collection: string;
	utmSource: string;
	utmMedium: string;
	utmCampaign: string;
	utmTerm: string;
	utmContent: string;
	seconds: number;
	scrollDepth: number;
	eventName: string;
	eventProps: string;
	createdAt: string;
}

export type CaptureResult =
	| { accepted: true; event: NormalizedEvent }
	| { accepted: false; reason: "bot" | "invalid" | "excluded_path" | "excluded_ip" };

export interface CaptureContext {
	excludedPaths: string;
	excludedIPs: string;
	salt: string;
}
