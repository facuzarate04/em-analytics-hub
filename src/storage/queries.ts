// ---------------------------------------------------------------------------
// Shared query builders for storage operations
// ---------------------------------------------------------------------------

import type { DailyStats } from "../types.js";

/** Generic storage collection interface matching EmDash's plugin storage API. */
export interface StorageCollection<T = unknown> {
	get: (id: string) => Promise<T | undefined>;
	put: (id: string, data: T) => Promise<void>;
	query: (options: QueryOptions) => Promise<PaginatedResult<T>>;
	deleteMany: (ids: string[]) => Promise<void>;
}

export interface QueryOptions {
	where?: Record<string, unknown>;
	orderBy?: Record<string, "asc" | "desc">;
	limit?: number;
	cursor?: string;
}

export interface PaginatedResult<T> {
	items: Array<{ id: string; data: T }>;
	cursor?: string;
}

/**
 * Queries all items matching a date range with cursor-based pagination.
 * Exhausts all pages to return the complete result set.
 */
export async function queryByDateRange<T>(
	collection: StorageCollection<T>,
	dateField: string,
	dateFrom: string,
	dateTo: string,
	extraWhere?: Record<string, unknown>,
): Promise<Array<{ id: string; data: T }>> {
	const where: Record<string, unknown> = {
		[dateField]: { gte: dateFrom, lte: dateTo },
		...extraWhere,
	};

	const allItems: Array<{ id: string; data: T }> = [];
	let cursor: string | undefined;

	do {
		const result = await collection.query({
			where,
			orderBy: { [dateField]: "desc" },
			limit: 100,
			cursor,
		});

		allItems.push(
			...result.items.map((item) => ({
				id: item.id as string,
				data: item.data as T,
			})),
		);
		cursor = result.cursor;
	} while (cursor);

	return allItems;
}

/**
 * Deletes all items older than a cutoff date using cursor-based pagination.
 * Returns the total number of items pruned.
 */
export async function pruneOlderThan<T>(
	collection: StorageCollection<T>,
	dateField: string,
	cutoff: string,
): Promise<number> {
	let pruned = 0;
	let cursor: string | undefined;

	do {
		const result = await collection.query({
			where: { [dateField]: { lt: cutoff } },
			orderBy: { [dateField]: "asc" },
			limit: 100,
			cursor,
		});

		if (result.items.length === 0) break;

		const ids = result.items.map((item) => item.id as string);
		await collection.deleteMany(ids);
		pruned += ids.length;
		cursor = result.cursor;
	} while (cursor);

	return pruned;
}
