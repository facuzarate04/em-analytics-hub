// ---------------------------------------------------------------------------
// Reusable Block Kit component builders
// ---------------------------------------------------------------------------

import { formatNumber, formatDuration, calculateTrend } from "../helpers/format.js";

/** Stat card item for the "stats" block type. */
export interface StatItem {
	label: string;
	value: string;
	trend?: string;
	trend_direction?: "up" | "down" | "flat";
}

/** Creates a stats block with multiple metric cards. */
export function statsBlock(items: StatItem[]): Record<string, unknown> {
	return { type: "stats", items };
}

/** Creates a stat item with an optional trend comparison. */
export function statCard(
	label: string,
	current: number,
	previous: number | undefined,
	options?: { format?: "number" | "percent" | "duration" },
): StatItem {
	const fmt = options?.format ?? "number";
	let value: string;

	switch (fmt) {
		case "percent":
			value = `${current}%`;
			break;
		case "duration":
			value = formatDuration(current);
			break;
		default:
			value = formatNumber(current);
	}

	if (previous !== undefined) {
		const trend = calculateTrend(current, previous);
		return { label, value, ...trend };
	}

	return { label, value };
}

/** Creates a table block with columns and rows. */
export function tableBlock(
	columns: Array<{ key: string; label: string }>,
	rows: Array<Record<string, unknown>>,
): Record<string, unknown> {
	return { type: "table", columns, rows };
}

/** Creates a timeseries chart block. */
export function timeseriesChart(
	series: Array<{ name: string; data: number[][]; color: string }>,
	options?: { height?: number; style?: "line" | "bar" },
): Record<string, unknown> {
	const style = options?.style ?? (series[0]?.data?.length === 1 ? "bar" : "line");
	return {
		type: "chart",
		config: {
			chart_type: "timeseries",
			series,
			y_axis_name: "Count",
			style,
			gradient: style === "line",
			height: options?.height ?? 300,
		},
	};
}

/** Creates a pie/donut chart block. */
export function pieChart(
	data: Array<{ name: string; value: number }>,
	options?: { height?: number },
): Record<string, unknown> {
	return {
		type: "chart",
		config: {
			chart_type: "custom",
			options: {
				backgroundColor: "transparent",
				series: [
					{
						type: "pie",
						radius: ["40%", "70%"],
						data,
					},
				],
			},
			height: options?.height ?? 250,
		},
	};
}

/** Creates a bar chart block. */
export function barChart(
	categories: string[],
	values: number[],
	options?: { color?: string; height?: number },
): Record<string, unknown> {
	return {
		type: "chart",
		config: {
			chart_type: "custom",
			options: {
				backgroundColor: "transparent",
				xAxis: { type: "category", data: categories },
				yAxis: { type: "value" },
				series: [
					{
						type: "bar",
						data: values,
						itemStyle: { color: options?.color ?? "#6366F1" },
					},
				],
			},
			height: options?.height ?? 250,
		},
	};
}

/** Creates a header block. */
export function header(text: string): Record<string, unknown> {
	return { type: "header", text };
}

/** Creates a divider block. */
export function divider(): Record<string, unknown> {
	return { type: "divider" };
}

/** Creates a context/info text block. */
export function context(text: string): Record<string, unknown> {
	return { type: "context", text };
}

/** Creates a banner block for empty states or notices. */
export function banner(
	title: string,
	description: string,
	variant: "default" | "warning" | "success" = "default",
): Record<string, unknown> {
	return { type: "banner", title, description, variant };
}

/** Creates a two-column layout block. */
export function columns(
	left: Record<string, unknown>[],
	right: Record<string, unknown>[],
): Record<string, unknown> {
	return { type: "columns", columns: [left, right] };
}

/** Creates a form block with a select field and submit button. */
export function rangeForm(
	currentDays: number,
	rangeOptions: Array<{ label: string; value: string }>,
): Record<string, unknown> {
	return {
		type: "form",
		block_id: "range-form",
		fields: [
			{
				type: "select",
				action_id: "range",
				label: "Period",
				initial_value: String(currentDays),
				options: rangeOptions,
			},
		],
		submit: { label: "Apply", action_id: "apply_range" },
	};
}
