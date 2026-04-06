// ---------------------------------------------------------------------------
// Detection catalog — discovers pages, forms, and events for goal/funnel config
// ---------------------------------------------------------------------------

import type { PluginContext } from "emdash";
import type { CustomEvent, DetectionCatalog } from "../types.js";
import type { StorageCollection } from "../storage/queries.js";
import { dateNDaysAgo, today } from "../helpers/date.js";
import { queryCustomEvents } from "../storage/custom-events.js";
import { buildDetectionCatalog } from "./config.js";
import { getTopPagesReport, getCustomEventsReport } from "../reporting/service.js";
import { reportingBackend, reportingStorage } from "../reporting/backend.js";

/**
 * Extracts form names from raw custom event items.
 *
 * LEGACY: Requires raw event props (form, source) which are only available
 * from portable storage. Cannot be served from D1 until a props table exists.
 */
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

/**
 * Extracts unique event names from raw custom event items.
 * Used only by portable mode — CF mode uses getCustomEventsReport instead.
 */
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
 * - Pages: reporting backend (D1 in CF mode, portable otherwise)
 * - Event names: reporting backend via getCustomEvents (D1 in CF mode)
 * - Forms: LEGACY — reads from portable storage directly because form
 *   detection requires raw event props (form, source) not stored in D1.
 */
export async function buildCatalogFromStorage(ctx: PluginContext): Promise<DetectionCatalog> {
	const dateFrom = dateNDaysAgo(30);
	const dateTo = today();
	const backend = reportingBackend();
	const storage = reportingStorage(ctx);

	const [topPages, customEventsReport, formEvents] = await Promise.all([
		getTopPagesReport(backend, { dateFrom, dateTo, limit: 50 }, storage),
		getCustomEventsReport(backend, { dateFrom, dateTo, limit: 50 }, storage),
		// LEGACY: portable read for form detection (needs raw props)
		queryCustomEvents(ctx.storage.custom_events as StorageCollection<CustomEvent>, dateFrom, dateTo),
	]);

	return buildDetectionCatalog({
		pages: topPages.map((p) => p.pathname),
		forms: extractForms(formEvents),
		events: customEventsReport.events.map((e) => e.name),
	});
}
