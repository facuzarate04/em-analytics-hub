// ---------------------------------------------------------------------------
// Site Overview dashboard widget
// ---------------------------------------------------------------------------

import type { PluginContext } from "emdash";
import type { LicenseCache } from "../types.js";
import { dateNDaysAgo, today } from "../helpers/date.js";
import { formatNumber, calculateTrend } from "../helpers/format.js";
import { statsBlock, tableBlock } from "./components.js";
import { getStatsReport, getTopPagesReport } from "../reporting/service.js";
import { reportingBackend, reportingStorage } from "../reporting/backend.js";

export async function buildWidget(
	ctx: PluginContext,
	_license: LicenseCache,
): Promise<Record<string, unknown>> {
	const storage = reportingStorage(ctx);
	const backend = reportingBackend();

	const [report, prevReport, topPages] = await Promise.all([
		getStatsReport(backend, { dateFrom: dateNDaysAgo(7), dateTo: today() }, storage),
		getStatsReport(backend, { dateFrom: dateNDaysAgo(14), dateTo: dateNDaysAgo(8) }, storage),
		getTopPagesReport(backend, { dateFrom: dateNDaysAgo(7), dateTo: today(), limit: 5 }, storage),
	]);

	const viewsTrend = calculateTrend(report.views, prevReport.views);
	const visitorsTrend = calculateTrend(report.visitors, prevReport.visitors);

	const pageRows = topPages.map((p) => ({
		page: p.pathname,
		views: formatNumber(p.views),
	}));

	return {
		blocks: [
			statsBlock([
				{
					label: "Views (7d)",
					value: formatNumber(report.views),
					...viewsTrend,
				},
				{
					label: "Visitors (7d)",
					value: formatNumber(report.visitors),
					...visitorsTrend,
				},
			]),
			tableBlock(
				[
					{ key: "page", label: "Page" },
					{ key: "views", label: "Views" },
				],
				pageRows,
			),
		],
	};
}
