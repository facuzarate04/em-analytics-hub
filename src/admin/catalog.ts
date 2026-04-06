// ---------------------------------------------------------------------------
// Detection catalog — discovers pages, forms, and events for goal/funnel config
// ---------------------------------------------------------------------------

import type { PluginContext } from "emdash";
import type { CustomEvent, DetectionCatalog } from "../types.js";
import { dateNDaysAgo, today } from "../helpers/date.js";
import { buildDetectionCatalog } from "./config.js";
import { getTopPagesReport, getCustomEventsReport, getDetectedFormsReport } from "../reporting/service.js";
import { reportingBackend, reportingStorage } from "../reporting/backend.js";

/**
 * Extracts form names from raw custom event items.
 *
 * Kept as a public helper for any caller that already has raw items.
 * The reporting backend now has getDetectedForms which handles this
 * at the storage/D1 level, so catalog no longer calls this directly.
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
 *
 * Kept as a public helper for any caller that already has raw items.
 * The reporting backend now has getCustomEvents which handles this
 * at the storage/D1 level, so catalog no longer calls this directly.
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
 * All three dimensions now use the reporting backend:
 * - Pages: getTopPages (D1 in CF mode, daily_stats in portable)
 * - Event names: getCustomEvents (D1 in CF mode, custom_events in portable)
 * - Forms: getDetectedForms (D1 in CF mode, custom_events in portable)
 *
 * In Cloudflare mode, this function no longer reads from portable storage.
 */
export async function buildCatalogFromStorage(ctx: PluginContext): Promise<DetectionCatalog> {
	const dateFrom = dateNDaysAgo(30);
	const dateTo = today();
	const backend = reportingBackend();
	const storage = reportingStorage(ctx);

	const [topPages, customEventsReport, forms] = await Promise.all([
		getTopPagesReport(backend, { dateFrom, dateTo, limit: 50 }, storage),
		getCustomEventsReport(backend, { dateFrom, dateTo, limit: 50 }, storage),
		getDetectedFormsReport(backend, { dateFrom, dateTo, limit: 50 }, storage),
	]);

	return buildDetectionCatalog({
		pages: topPages.map((p) => p.pathname),
		forms,
		events: customEventsReport.events.map((e) => e.name),
	});
}
