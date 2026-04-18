// ---------------------------------------------------------------------------
// GET /top-pages — Admin ranked pages API
// ---------------------------------------------------------------------------

import type { PluginContext, RouteContext } from "emdash";
import { today, dateNDaysAgo } from "../helpers/date.js";
import { MAX_DATE_RANGE_DAYS, MAX_TOP_PAGES, DEFAULT_TOP_PAGES_LIMIT } from "../constants.js";
import { getTopPagesReport } from "../reporting/service.js";
import { reportingBackend, reportingStorage } from "../reporting/backend.js";

export async function handleTopPages(
	routeCtx: RouteContext,
	ctx: PluginContext,
): Promise<Record<string, unknown>> {
	const url = new URL(routeCtx.request.url);
	const days = Math.min(
		parseInt(url.searchParams.get("days") ?? "7", 10) || 7,
		MAX_DATE_RANGE_DAYS,
	);
	const limit = Math.min(
		parseInt(url.searchParams.get("limit") ?? String(DEFAULT_TOP_PAGES_LIMIT), 10) || DEFAULT_TOP_PAGES_LIMIT,
		MAX_TOP_PAGES,
	);

	const pages = await getTopPagesReport(reportingBackend(), {
		dateFrom: dateNDaysAgo(days),
		dateTo: today(),
		limit,
	}, reportingStorage(ctx));

	return { pages };
}
