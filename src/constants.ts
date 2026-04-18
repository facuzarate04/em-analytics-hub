// ---------------------------------------------------------------------------
// em-analytics-hub — Constants and defaults
// ---------------------------------------------------------------------------

import type { EventType } from "./types.js";

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

/** Default data retention in days. */
export const DEFAULT_RETENTION_DAYS = 365;

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

/** Maximum allowed date range in days. */
export const MAX_DATE_RANGE_DAYS = 730;

// ---------------------------------------------------------------------------
// KV keys
// ---------------------------------------------------------------------------

export const KV_KEYS = {
	DAILY_SALT: "state:daily_salt",
	GOAL_DEFINITIONS: "state:goal_definitions",
	FUNNEL_DEFINITIONS: "state:funnel_definitions",
	FUNNEL_BUILDER_STEPS: "state:funnel_builder_steps",
	SETTINGS_EXCLUDED_PATHS: "settings:excludedPaths",
	SETTINGS_EXCLUDED_IPS: "settings:excludedIPs",
	SETTINGS_RETENTION_DAYS: "settings:retentionDays",
} as const;

// ---------------------------------------------------------------------------
// Cron job names
// ---------------------------------------------------------------------------

export const CRON_JOBS = {
	ROTATE_SALT: "rotate-salt",
	PRUNE_EVENTS: "prune-events",
} as const;
