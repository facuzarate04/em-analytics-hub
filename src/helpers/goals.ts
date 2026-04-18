// ---------------------------------------------------------------------------
// Goals — Pro feature
// ---------------------------------------------------------------------------

import type { CustomEvent, GoalDefinition, GoalMetricRow, RawEvent } from "../types.js";

export const PRIORITY_GOALS = [
	"signup_submit",
	"form_submit",
	"demo_request",
	"purchase",
	"cta_click",
	"plan_select",
];

/** Returns true if the event name qualifies as an auto-detected goal candidate. */
export function isAutoGoalCandidate(name: string): boolean {
	return PRIORITY_GOALS.includes(name) || name.endsWith("_submit") || name.endsWith("_request");
}

export function prettifyGoalName(name: string): string {
	return name.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

export function aggregateGoals(
	items: Array<{ id: string; data: CustomEvent }>,
	totalVisitors: number,
): GoalMetricRow[] {
	const byName = new Map<string, { completions: number; visitors: Set<string> }>();

	for (const item of items) {
		const event = item.data;
		if (!isAutoGoalCandidate(event.name)) continue;

		let bucket = byName.get(event.name);
		if (!bucket) {
			bucket = { completions: 0, visitors: new Set<string>() };
			byName.set(event.name, bucket);
		}

		bucket.completions += 1;
		if (event.visitorId) bucket.visitors.add(event.visitorId);
	}

	return Array.from(byName.entries())
		.map(([name, bucket]) => ({
			goal: prettifyGoalName(name),
			completions: bucket.completions,
			visitors: bucket.visitors.size,
			conversionRate: totalVisitors > 0 ? Math.round((bucket.visitors.size / totalVisitors) * 100) : 0,
		}))
		.sort((a, b) => b.completions - a.completions)
		.slice(0, 5);
}

function normalizeFormName(event: CustomEvent): string {
	const form = event.props.form;
	if (form) return String(form);
	const source = event.props.source;
	if (source) return String(source);
	return event.pathname || "unknown";
}

export function aggregateConfiguredGoals(input: {
	goals: GoalDefinition[];
	rawEvents: Array<{ id: string; data: RawEvent }>;
	customEvents: Array<{ id: string; data: CustomEvent }>;
	totalVisitors: number;
}): GoalMetricRow[] {
	const { goals, rawEvents, customEvents, totalVisitors } = input;
	const rows: GoalMetricRow[] = [];

	for (const goal of goals.filter((item) => item.active)) {
		if (goal.type === "page") {
			let completions = 0;
			const visitors = new Set<string>();
			for (const item of rawEvents) {
				const event = item.data;
				if (event.type !== "pageview" || event.pathname !== goal.target) continue;
				completions += 1;
				if (event.visitorId) visitors.add(event.visitorId);
			}
			rows.push({
				goal: goal.name,
				completions,
				visitors: visitors.size,
				conversionRate: totalVisitors > 0 ? Math.round((visitors.size / totalVisitors) * 100) : 0,
			});
			continue;
		}

		let completions = 0;
		const visitors = new Set<string>();
		for (const item of customEvents) {
			const event = item.data;
			const matches =
				goal.type === "event"
					? event.name === goal.target
					: normalizeFormName(event) === goal.target && (event.name === "form_submit" || event.name.endsWith("_submit"));
			if (!matches) continue;
			completions += 1;
			if (event.visitorId) visitors.add(event.visitorId);
		}

		rows.push({
			goal: goal.name,
			completions,
			visitors: visitors.size,
			conversionRate: totalVisitors > 0 ? Math.round((visitors.size / totalVisitors) * 100) : 0,
		});
	}

	return rows
		.filter((row) => row.completions > 0)
		.sort((a, b) => b.completions - a.completions);
}
