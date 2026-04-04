// ---------------------------------------------------------------------------
// Raw event storage operations
// ---------------------------------------------------------------------------

import type { RawEvent } from "../types.js";
import { eventId } from "../helpers/date.js";
import type { StorageCollection } from "./queries.js";
import { queryByDateRange } from "./queries.js";

/**
 * Writes a raw event to the events collection.
 * Generates a unique ID automatically.
 */
export async function writeEvent(
	collection: StorageCollection<RawEvent>,
	event: RawEvent,
): Promise<string> {
	const id = eventId();
	await collection.put(id, event);
	return id;
}

/**
 * Queries raw events for a date range, optionally filtered by pathname.
 */
export async function queryRawEvents(
	collection: StorageCollection<RawEvent>,
	dateFrom: string,
	dateTo: string,
	pathname?: string,
): Promise<Array<{ id: string; data: RawEvent }>> {
	const extraWhere = pathname ? { pathname } : undefined;
	return queryByDateRange(
		collection,
		"createdAt",
		`${dateFrom}T00:00:00.000Z`,
		`${dateTo}T23:59:59.999Z`,
		extraWhere,
	);
}
