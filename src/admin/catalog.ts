// ---------------------------------------------------------------------------
// Detection catalog — discovers pages, forms, and events for goal/funnel config
// ---------------------------------------------------------------------------

import type { PluginContext } from "emdash";
import type { CustomEvent, DetectionCatalog } from "../types.js";
import type { StorageCollection } from "../storage/queries.js";
import { dateNDaysAgo, today } from "../helpers/date.js";
import { queryCustomEvents } from "../storage/custom-events.js";
import { buildDetectionCatalog } from "./config.js";
import { getTopPagesReport } from "../reporting/service.js";
import { reportingBackend, reportingStorage } from "../reporting/backend.js";

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

/**
 * Builds a detection catalog for goal/funnel configuration pages.
 *
 * Pages come from the reporting backend (works with D1 in CF mode).
 * Forms and events still require custom_events from portable storage
 * (no reporting backend method for raw custom event queries yet).
 */
export async function buildCatalogFromStorage(ctx: PluginContext): Promise<DetectionCatalog> {
	const dateFrom = dateNDaysAgo(30);
	const dateTo = today();

	const [topPages, customEvents] = await Promise.all([
		getTopPagesReport(reportingBackend(), { dateFrom, dateTo, limit: 50 }, reportingStorage(ctx)),
		queryCustomEvents(ctx.storage.custom_events as StorageCollection<CustomEvent>, dateFrom, dateTo),
	]);

	return buildDetectionCatalog({
		pages: topPages.map((p) => p.pathname),
		forms: extractForms(customEvents),
		events: extractEventNames(customEvents),
	});
}
