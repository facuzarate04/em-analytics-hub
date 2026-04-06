// ---------------------------------------------------------------------------
// Detection catalog — discovers pages, forms, and events from storage
// ---------------------------------------------------------------------------

import type { PluginContext } from "emdash";
import type { DailyStats, CustomEvent, DetectionCatalog } from "../types.js";
import type { StorageCollection } from "../storage/queries.js";
import { dateNDaysAgo, today } from "../helpers/date.js";
import { queryStatsForRange } from "../storage/stats.js";
import { queryCustomEvents } from "../storage/custom-events.js";
import { buildDetectionCatalog } from "./config.js";

export interface CatalogStorage {
	daily_stats: StorageCollection<DailyStats>;
	custom_events: StorageCollection<CustomEvent>;
}

export function extractPages(
	items: Array<{ id: string; data: DailyStats }>,
	limit = 50,
): string[] {
	return Array.from(
		new Set(
			items
				.map((item) => item.data.pathname)
				.filter((pathname): pathname is string => typeof pathname === "string" && pathname.length > 0),
		),
	).slice(0, limit);
}

export function extractForms(
	items: Array<{ id: string; data: CustomEvent }>,
	limit = 50,
): string[] {
	return Array.from(
		new Set(
			items
				.filter((item) => item.data.name === "form_submit" || item.data.name.endsWith("_submit"))
				.map((item) => String(item.data.props.form ?? item.data.props.source ?? item.data.pathname ?? ""))
				.filter((value) => value.length > 0),
		),
	).slice(0, limit);
}

export function extractEventNames(
	items: Array<{ id: string; data: CustomEvent }>,
	limit = 50,
): string[] {
	return Array.from(
		new Set(
			items
				.map((item) => item.data.name)
				.filter((name) => name.length > 0),
		),
	).slice(0, limit);
}

export async function buildCatalogFromStorage(ctx: PluginContext): Promise<DetectionCatalog> {
	const dateFrom = dateNDaysAgo(30);
	const dateTo = today();

	const [stats, customEvents] = await Promise.all([
		queryStatsForRange(ctx.storage.daily_stats as CatalogStorage["daily_stats"], dateFrom, dateTo),
		queryCustomEvents(ctx.storage.custom_events as CatalogStorage["custom_events"], dateFrom, dateTo),
	]);

	return buildDetectionCatalog({
		pages: extractPages(stats),
		forms: extractForms(customEvents),
		events: extractEventNames(customEvents),
	});
}
