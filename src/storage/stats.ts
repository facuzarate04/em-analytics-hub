// ---------------------------------------------------------------------------
// Daily stats storage operations
// ---------------------------------------------------------------------------

import type { DailyStats } from "../types.js";
import { statsId } from "../helpers/date.js";
import { normalizeDailyStats } from "../helpers/aggregation.js";
import type { StorageCollection } from "./queries.js";
import { queryByDateRange } from "./queries.js";

/**
 * Gets or creates a DailyStats record for the given pathname and date.
 * Returns a fully normalized record with all fields populated.
 */
export async function getOrCreateDailyStats(
	collection: StorageCollection<DailyStats>,
	pathname: string,
	date: string,
): Promise<DailyStats> {
	const id = statsId(pathname, date);
	const existing = await collection.get(id);

	if (existing) {
		return normalizeDailyStats(
			existing as Partial<DailyStats> & Pick<DailyStats, "pathname" | "date">,
		);
	}

	return normalizeDailyStats({ pathname, date });
}

/**
 * Persists a DailyStats record to the collection.
 */
export async function saveDailyStats(
	collection: StorageCollection<DailyStats>,
	stats: DailyStats,
): Promise<void> {
	const id = statsId(stats.pathname, stats.date);
	await collection.put(id, stats);
}

/**
 * Queries daily stats for a date range, optionally filtered by pathname.
 * Returns all matching records across all pages.
 */
export async function queryStatsForRange(
	collection: StorageCollection<DailyStats>,
	dateFrom: string,
	dateTo: string,
	pathname?: string,
): Promise<Array<{ id: string; data: DailyStats }>> {
	const extraWhere = pathname ? { pathname } : undefined;
	return queryByDateRange(collection, "date", dateFrom, dateTo, extraWhere);
}
