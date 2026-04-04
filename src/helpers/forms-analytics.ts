// ---------------------------------------------------------------------------
// Forms Analytics — Pro feature
// ---------------------------------------------------------------------------

import type { CustomEvent } from "../types.js";

export interface FormAnalyticsRow {
	form: string;
	event: string;
	submissions: number;
	visitors: number;
	submitRate: number;
}

function inferFormLabel(event: CustomEvent): string {
	const form = event.props.form;
	if (form) return String(form);
	const source = event.props.source;
	if (source) return String(source);
	return event.pathname || "unknown";
}

export function aggregateFormsAnalytics(
	items: Array<{ id: string; data: CustomEvent }>,
	totalVisitors: number,
): FormAnalyticsRow[] {
	const byKey = new Map<string, { form: string; event: string; submissions: number; visitors: Set<string> }>();

	for (const item of items) {
		const event = item.data;
		const isFormEvent = event.name === "form_submit" || event.name.endsWith("_submit");
		if (!isFormEvent) continue;

		const form = inferFormLabel(event);
		const key = `${event.name}:${form}`;
		let bucket = byKey.get(key);
		if (!bucket) {
			bucket = { form, event: event.name, submissions: 0, visitors: new Set<string>() };
			byKey.set(key, bucket);
		}

		bucket.submissions += 1;
		if (event.visitorId) bucket.visitors.add(event.visitorId);
	}

	return Array.from(byKey.values())
		.map((bucket) => ({
			form: bucket.form,
			event: bucket.event,
			submissions: bucket.submissions,
			visitors: bucket.visitors.size,
			submitRate: totalVisitors > 0 ? Math.round((bucket.visitors.size / totalVisitors) * 100) : 0,
		}))
		.sort((a, b) => b.submissions - a.submissions)
		.slice(0, 6);
}
