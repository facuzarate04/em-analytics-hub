// ---------------------------------------------------------------------------
// Cloudflare D1 — Typed interfaces and schema management
// ---------------------------------------------------------------------------

/**
 * Minimal typed interface for Cloudflare D1 database binding.
 * @see https://developers.cloudflare.com/d1/
 */
export interface D1Database {
	prepare(query: string): D1PreparedStatement;
	batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
	exec(query: string): Promise<D1ExecResult>;
}

export interface D1PreparedStatement {
	bind(...values: unknown[]): D1PreparedStatement;
	first<T = unknown>(colName?: string): Promise<T | null>;
	run<T = unknown>(): Promise<D1Result<T>>;
	all<T = unknown>(): Promise<D1Result<T>>;
}

export interface D1Result<T = unknown> {
	results?: T[];
	success: boolean;
}

export interface D1ExecResult {
	count: number;
	duration: number;
}

// ---------------------------------------------------------------------------
// D1 Schema
// ---------------------------------------------------------------------------
//
// Tables:
//
// daily_pages      — per (date, pathname) aggregated metrics
// daily_visitors   — per (date, pathname, visitor_id) for unique counting
// daily_referrers  — per (date, referrer) view counts
// daily_countries  — per (date, country) view counts
// daily_campaigns  — per (date, dimension, name) view counts
//                    dimension = 'source' | 'medium' | 'campaign'
// daily_custom_events — per (date, event_name) custom event counts
// daily_form_submissions — per (date, form_name) form submission counts
// ---------------------------------------------------------------------------

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS daily_pages (
  date TEXT NOT NULL,
  pathname TEXT NOT NULL,
  template TEXT DEFAULT '',
  collection TEXT DEFAULT '',
  views INTEGER DEFAULT 0,
  reads INTEGER DEFAULT 0,
  time_total INTEGER DEFAULT 0,
  time_count INTEGER DEFAULT 0,
  scroll25 INTEGER DEFAULT 0,
  scroll50 INTEGER DEFAULT 0,
  scroll75 INTEGER DEFAULT 0,
  scroll100 INTEGER DEFAULT 0,
  engaged_views INTEGER DEFAULT 0,
  recircs INTEGER DEFAULT 0,
  PRIMARY KEY (date, pathname)
);

CREATE TABLE IF NOT EXISTS daily_visitors (
  date TEXT NOT NULL,
  pathname TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  PRIMARY KEY (date, pathname, visitor_id)
);

CREATE TABLE IF NOT EXISTS daily_referrers (
  date TEXT NOT NULL,
  referrer TEXT NOT NULL,
  count INTEGER DEFAULT 0,
  PRIMARY KEY (date, referrer)
);

CREATE TABLE IF NOT EXISTS daily_countries (
  date TEXT NOT NULL,
  country TEXT NOT NULL,
  count INTEGER DEFAULT 0,
  PRIMARY KEY (date, country)
);

CREATE TABLE IF NOT EXISTS daily_campaigns (
  date TEXT NOT NULL,
  dimension TEXT NOT NULL,
  name TEXT NOT NULL,
  count INTEGER DEFAULT 0,
  PRIMARY KEY (date, dimension, name)
);

CREATE TABLE IF NOT EXISTS daily_custom_events (
  date TEXT NOT NULL,
  event_name TEXT NOT NULL,
  count INTEGER DEFAULT 0,
  PRIMARY KEY (date, event_name)
);

CREATE TABLE IF NOT EXISTS daily_form_submissions (
  date TEXT NOT NULL,
  form_name TEXT NOT NULL,
  count INTEGER DEFAULT 0,
  PRIMARY KEY (date, form_name)
);
`;

let _schemaReady = false;

/**
 * Ensures D1 tables exist. Idempotent — runs CREATE TABLE IF NOT EXISTS
 * only on first call per process lifetime.
 */
export async function ensureD1Schema(db: D1Database): Promise<void> {
	if (_schemaReady) return;
	await db.exec(SCHEMA_SQL);
	_schemaReady = true;
}

/** Reset schema flag — for testing only. */
export function resetD1SchemaFlag(): void {
	_schemaReady = false;
}
