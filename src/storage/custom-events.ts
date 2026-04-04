// ---------------------------------------------------------------------------
// Custom events storage operations
// ---------------------------------------------------------------------------

import type { CustomEvent } from "../types.js";
import { eventId } from "../helpers/date.js";
import type { StorageCollection } from "./queries.js";
import { queryByDateRange } from "./queries.js";

/**
 * Writes a custom event to the custom_events collection.
 */
export async function writeCustomEvent(
	collection: StorageCollection<CustomEvent>,
	event: CustomEvent,
): Promise<string> {
	const id = eventId();
	await collection.put(id, event);
	return id;
}

/**
 * Queries custom events for a date range, optionally filtered by event name.
 */
export async function queryCustomEvents(
	collection: StorageCollection<CustomEvent>,
	dateFrom: string,
	dateTo: string,
	name?: string,
): Promise<Array<{ id: string; data: CustomEvent }>> {
	const extraWhere = name ? { name } : undefined;
	return queryByDateRange(
		collection,
		"createdAt",
		`${dateFrom}T00:00:00.000Z`,
		`${dateTo}T23:59:59.999Z`,
		extraWhere,
	);
}

/**
 * Aggregates custom events into a summary by event name.
 * Returns a map of event name → count.
 */
export function aggregateCustomEvents(
	items: Array<{ id: string; data: CustomEvent }>,
): Record<string, number> {
	const counts: Record<string, number> = {};
	for (const item of items) {
		const name = item.data.name;
		counts[name] = (counts[name] ?? 0) + 1;
	}
	return counts;
}

/**
 * Aggregates custom events into daily trends per event name.
 * Returns a map of event name → array of [timestamp, count] for timeseries.
 * Available on Free tier to show simple trend lines per event.
 */
export function aggregateCustomEventTrends(
	items: Array<{ id: string; data: CustomEvent }>,
): Record<string, number[][]> {
	// Group by name → date → count
	const byNameDate = new Map<string, Map<string, number>>();

	for (const item of items) {
		const name = item.data.name;
		const date = item.data.createdAt.slice(0, 10); // YYYY-MM-DD

		let dateMap = byNameDate.get(name);
		if (!dateMap) {
			dateMap = new Map();
			byNameDate.set(name, dateMap);
		}
		dateMap.set(date, (dateMap.get(date) ?? 0) + 1);
	}

	// Convert to timeseries format: name → [[timestamp, count], ...]
	const result: Record<string, number[][]> = {};

	for (const [name, dateMap] of byNameDate) {
		result[name] = Array.from(dateMap.entries())
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([date, count]) => [new Date(date).getTime(), count]);
	}

	return result;
}

/**
 * Aggregates custom event property values for a specific event name.
 * Returns a map of property key → { value → count }.
 * Only available on Pro tier.
 */
export function aggregateCustomEventProperties(
	items: Array<{ id: string; data: CustomEvent }>,
	eventName: string,
): Record<string, Record<string, number>> {
	const propBreakdowns: Record<string, Record<string, number>> = {};

	for (const item of items) {
		if (item.data.name !== eventName) continue;

		for (const [key, value] of Object.entries(item.data.props)) {
			if (!propBreakdowns[key]) {
				propBreakdowns[key] = {};
			}
			const strValue = String(value);
			propBreakdowns[key][strValue] = (propBreakdowns[key][strValue] ?? 0) + 1;
		}
	}

	return propBreakdowns;
}
