// ---------------------------------------------------------------------------
// Raw event storage operations
// ---------------------------------------------------------------------------

import type { RawEvent } from "../types.js";
import { eventId } from "../helpers/date.js";
import type { StorageCollection } from "./queries.js";

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
