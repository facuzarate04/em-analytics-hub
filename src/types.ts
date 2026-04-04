// ---------------------------------------------------------------------------
// em-analytics-hub — Type definitions
// ---------------------------------------------------------------------------

/** Supported event types captured by the beacon script. */
export type EventType =
	| "pageview"
	| "scroll"
	| "ping"
	| "read"
	| "engaged"
	| "recirc"
	| "custom";

/** Raw event stored in the `events` collection. */
export interface RawEvent {
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
	seconds: number;
	scrollDepth: number;
	eventName: string;
	eventProps: string;
	createdAt: string;
}

/** Pre-aggregated daily stats stored in the `daily_stats` collection. */
export interface DailyStats {
	pathname: string;
	date: string;
	template: string;
	collection: string;
	views: number;
	visitors: string[];
	reads: number;
	timeTotal: number;
	timeCount: number;
	referrers: Record<string, number>;
	countries: Record<string, number>;
	utmSources: Record<string, number>;
	utmMediums: Record<string, number>;
	utmCampaigns: Record<string, number>;
	scroll25: number;
	scroll50: number;
	scroll75: number;
	scroll100: number;
	engagedViews: number;
	recircs: number;
}

/** Custom event stored in the `custom_events` collection. */
export interface CustomEvent {
	name: string;
	pathname: string;
	props: Record<string, string | number | boolean>;
	visitorId: string;
	createdAt: string;
}

// ---------------------------------------------------------------------------
// Beacon payload (compact field names for minimal transfer)
// ---------------------------------------------------------------------------

/** Payload sent from the beacon script to the /track endpoint. */
export interface TrackPayload {
	/** Event type */
	t: EventType;
	/** Pathname */
	p: string;
	/** Referrer domain */
	r?: string;
	/** Template */
	tpl?: string;
	/** Collection */
	col?: string;
	/** UTM source */
	us?: string;
	/** UTM medium */
	um?: string;
	/** UTM campaign */
	uc?: string;
	/** Seconds of active attention (ping events) */
	s?: number;
	/** Scroll depth percentage (scroll events) */
	d?: number;
	/** Custom event name */
	n?: string;
	/** Custom event properties (JSON string) */
	pr?: string;
}

// ---------------------------------------------------------------------------
// Aggregated query results
// ---------------------------------------------------------------------------

/** Aggregated stats returned by the /stats admin API. */
export interface AggregatedStats {
	plan: string;
	views: number;
	visitors: number;
	reads: number;
	readRate: number;
	avgTimeSeconds: number;
	engagedViews: number;
	engagedRate: number;
	recircs: number;
	recircRate: number;
	scrollDepth: Record<string, number>;
	referrers: Record<string, number>;
	utmSources: Record<string, number>;
	utmMediums: Record<string, number>;
	utmCampaigns: Record<string, number>;
	daily: Record<string, { views: number; visitors: number; reads: number; engagedViews: number }>;
	countries?: Record<string, number>;
}

/** Single page entry returned by the /top-pages admin API. */
export interface TopPageEntry {
	pathname: string;
	template: string;
	collection: string;
	views: number;
	visitors: number;
	reads: number;
	readRate: number;
	avgTime: number;
	engagedRate: number;
	recircRate: number;
}

// ---------------------------------------------------------------------------
// License / Plan
// ---------------------------------------------------------------------------

export type PlanId = "free" | "pro" | "business";

export interface PlanDefinition {
	id: PlanId;
	maxRetentionDays: number;
	maxDateRange: number;
	features: string[];
}

/** Cached license state stored in KV. */
export interface LicenseCache {
	plan: PlanId;
	/** ISO 8601 — when the license/subscription expires. Empty for free. */
	validUntil: string;
	/** ISO 8601 — last successful validation timestamp. */
	checkedAt: string;
	/** License status from the provider. */
	status: LicenseStatus;
	/** Provider-specific instance ID (e.g. Lemon Squeezy instance). */
	instanceId: string;
	/** The site URL this license is activated for. */
	siteUrl: string;
	/** ISO 8601 — when grace period ends after validation failure. */
	graceEndsAt: string;
}

export type LicenseStatus = "active" | "expired" | "inactive" | "unknown";

// ---------------------------------------------------------------------------
// License provider abstraction
// ---------------------------------------------------------------------------

/** Result of a license activation or validation call. */
export interface LicenseCheckResult {
	valid: boolean;
	plan: PlanId;
	status: LicenseStatus;
	instanceId: string;
	validUntil: string;
	error?: string;
}

/**
 * Abstract interface for license providers.
 * The plugin calls this interface; the implementation handles the specifics
 * of whichever platform is used (Lemon Squeezy, custom Worker, etc.).
 */
export interface LicenseProvider {
	/** Activate a license key for a specific site. */
	activate(licenseKey: string, siteUrl: string): Promise<LicenseCheckResult>;

	/** Validate an already-activated license. */
	validate(licenseKey: string, instanceId: string): Promise<LicenseCheckResult>;

	/** Deactivate a license from a site. */
	deactivate(licenseKey: string, instanceId: string): Promise<LicenseCheckResult>;
}

// ---------------------------------------------------------------------------
// Plugin options
// ---------------------------------------------------------------------------

export interface AnalyticsHubOptions {
	/** Comma-separated path prefixes to exclude from tracking. Default: "/_emdash/,/admin/" */
	excludedPaths?: string;
}
