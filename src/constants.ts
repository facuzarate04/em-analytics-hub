// ---------------------------------------------------------------------------
// em-analytics-hub — Constants and defaults
// ---------------------------------------------------------------------------

import type { EventType, PlanDefinition } from "./types.js";

/** All valid event types. */
export const EVENT_TYPES: EventType[] = [
	"pageview",
	"scroll",
	"ping",
	"read",
	"engaged",
	"recirc",
	"custom",
];

/** Default excluded path prefixes. */
export const DEFAULT_EXCLUDED_PATHS = "/_emdash/,/admin/";

/** Default data retention in days (free plan). */
export const DEFAULT_RETENTION_DAYS = 30;

/** Maximum custom event property keys allowed per event. */
export const MAX_CUSTOM_EVENT_PROPS = 20;

/** Maximum custom event name length. */
export const MAX_EVENT_NAME_LENGTH = 100;

/** Maximum pathname length to store. */
export const MAX_PATHNAME_LENGTH = 2048;

/** Maximum attention seconds to accept (30 minutes). */
export const MAX_ATTENTION_SECONDS = 1800;

/** Maximum number of top pages to return. */
export const MAX_TOP_PAGES = 50;

/** Default number of top pages to return. */
export const DEFAULT_TOP_PAGES_LIMIT = 10;

/** Default date range in days for admin queries. */
export const DEFAULT_DATE_RANGE_DAYS = 7;

// ---------------------------------------------------------------------------
// Plan definitions
// ---------------------------------------------------------------------------

// Feature gating matrix:
//
// Feature                              | Free | Pro  | Business
// -------------------------------------|------|------|--------
// Dashboard                            |  ✅  |  ✅  |  ✅
// Top Pages                            |  ✅  |  ✅  |  ✅
// Referrers                            |  ✅  |  ✅  |  ✅
// Template Segmentation                |  ✅  |  ✅  |  ✅
// Collection Segmentation              |  ✅  |  ✅  |  ✅
// Native Tracking                      |  ✅  |  ✅  |  ✅
// UTM — source/medium/campaign         |  ✅  |  ✅  |  ✅
// UTM — term/content                   |  ❌  |  ✅  |  ✅
// UTM — campaign comparison            |  ❌  |  ✅  |  ✅
// UTM — conversion/engagement analysis |  ❌  |  ✅  |  ✅
// UTM — export                         |  ❌  |  ✅  |  ✅
// Custom Events — tracking             |  ✅  |  ✅  |  ✅
// Custom Events — list + counts        |  ✅  |  ✅  |  ✅
// Custom Events — trend by event       |  ✅  |  ✅  |  ✅
// Custom Events — property breakdowns  |  ❌  |  ✅  |  ✅
// Custom Events — property filters     |  ❌  |  ✅  |  ✅
// Custom Events — funnels              |  ❌  |  ✅  |  ✅
// Countries                            |  ❌  |  ✅  |  ✅
// Goals / Conversion Tracking          |  ❌  |  ✅  |  ✅
// Forms Analytics                      |  ❌  |  ✅  |  ✅
// Search Analytics                     |  ❌  |  ✅  |  ✅
// Annotations                          |  ❌  |  ✅  |  ✅
// Alerts / Anomaly Detection           |  ❌  |  ✅  |  ✅
// Period Comparison                    |  ❌  |  ✅  |  ✅
// Export                               |  ❌  |  ✅  |  ✅
// Advanced Segments                    |  ❌  |  ✅  |  ✅
// Multi-Site                           |  ❌  |  ✅  |  ✅
// Integrations                         |  ❌  |  ✅  |  ✅
// SSO                                  |  ❌  |  ❌  |  ✅
// Advanced Permissions                 |  ❌  |  ❌  |  ✅
// Executive Reports                    |  ❌  |  ❌  |  ✅
// White Label                          |  ❌  |  ❌  |  ✅
// Priority Support / SLA               |  ❌  |  ❌  |  ✅

export const PLANS: Record<string, PlanDefinition> = {
	free: {
		id: "free",
		maxRetentionDays: 30,
		maxDateRange: 30,
		features: [
			// Core dashboard
			"dashboard",
			"top_pages",
			"referrers",
			"template_segmentation",
			"collection_segmentation",
			"native_tracking",
			// UTM basics (source, medium, campaign — no term/content)
			"utm_basic",
			// Custom events (tracking + list + counts + trends — no props/funnels)
			"custom_events_tracking",
			"custom_events_list",
			"custom_events_trends",
		],
	},
	pro: {
		id: "pro",
		maxRetentionDays: 365,
		maxDateRange: 365,
		features: [
			// All Free features
			"dashboard",
			"top_pages",
			"referrers",
			"template_segmentation",
			"collection_segmentation",
			"native_tracking",
			"utm_basic",
			"custom_events_tracking",
			"custom_events_list",
			"custom_events_trends",
			// UTM advanced
			"utm_term_content",
			"utm_campaign_comparison",
			"utm_conversion_analysis",
			"utm_export",
			// Custom events advanced
			"custom_events_property_breakdowns",
			"custom_events_property_filters",
			"custom_events_funnels",
			// Pro features
			"countries",
			"goals",
			"forms_analytics",
			"search_analytics",
			"annotations",
			"alerts",
			"period_comparison",
			"export",
			"advanced_segments",
			"multi_site",
			"integrations",
		],
	},
	business: {
		id: "business",
		maxRetentionDays: 730,
		maxDateRange: 730,
		features: [
			// All Pro features
			"dashboard",
			"top_pages",
			"referrers",
			"template_segmentation",
			"collection_segmentation",
			"native_tracking",
			"utm_basic",
			"custom_events_tracking",
			"custom_events_list",
			"custom_events_trends",
			"utm_term_content",
			"utm_campaign_comparison",
			"utm_conversion_analysis",
			"utm_export",
			"custom_events_property_breakdowns",
			"custom_events_property_filters",
			"custom_events_funnels",
			"countries",
			"goals",
			"forms_analytics",
			"search_analytics",
			"annotations",
			"alerts",
			"period_comparison",
			"export",
			"advanced_segments",
			"multi_site",
			"integrations",
			// Business-only features
			"sso",
			"advanced_permissions",
			"executive_reports",
			"white_label",
			"priority_support",
		],
	},
};

// ---------------------------------------------------------------------------
// KV keys
// ---------------------------------------------------------------------------

export const KV_KEYS = {
	DAILY_SALT: "state:daily_salt",
	LICENSE_CACHE: "state:license_cache",
	SETTINGS_EXCLUDED_PATHS: "settings:excludedPaths",
	SETTINGS_EXCLUDED_IPS: "settings:excludedIPs",
	SETTINGS_RETENTION_DAYS: "settings:retentionDays",
	SETTINGS_LICENSE_KEY: "settings:licenseKey",
} as const;

// ---------------------------------------------------------------------------
// Cron job names
// ---------------------------------------------------------------------------

export const CRON_JOBS = {
	ROTATE_SALT: "rotate-salt",
	PRUNE_EVENTS: "prune-events",
	VALIDATE_LICENSE: "validate-license",
} as const;
