// ---------------------------------------------------------------------------
// Funnels v1 — Pro feature
// ---------------------------------------------------------------------------

import type { FunnelDefinition, FunnelStepDefinition, RawEvent } from "../types.js";

export interface FunnelStep {
	key: string;
	label: string;
}

export interface FunnelRow {
	step: string;
	visitors: number;
	conversionRate: number;
	dropOffRate: number;
}

function getEventKey(event: RawEvent): string {
	if (event.type === "custom" && event.eventName) {
		return `custom:${event.eventName}`;
	}
	return event.type;
}

function normalizeFormName(event: RawEvent): string {
	try {
		const props = event.eventProps ? JSON.parse(event.eventProps) as Record<string, unknown> : {};
		if (typeof props.form === "string" && props.form.length > 0) return props.form;
		if (typeof props.source === "string" && props.source.length > 0) return props.source;
	} catch {
		// Ignore malformed eventProps.
	}
	return event.pathname || "unknown";
}

function matchesConfiguredStep(event: RawEvent, step: FunnelStepDefinition): boolean {
	if (step.type === "page") {
		return event.type === "pageview" && event.pathname === step.target;
	}

	if (step.type === "event") {
		return event.type === "custom" && event.eventName === step.target;
	}

	if (event.type !== "custom") return false;
	const isFormEvent = event.eventName === "form_submit" || event.eventName.endsWith("_submit");
	return isFormEvent && normalizeFormName(event) === step.target;
}

function hasEvent(items: Array<{ id: string; data: RawEvent }>, key: string): boolean {
	return items.some((item) => getEventKey(item.data) === key);
}

function topCustomEvent(items: Array<{ id: string; data: RawEvent }>): string | null {
	const counts = new Map<string, number>();
	for (const item of items) {
		const event = item.data;
		if (event.type !== "custom" || !event.eventName) continue;
		counts.set(event.eventName, (counts.get(event.eventName) ?? 0) + 1);
	}
	const top = Array.from(counts.entries()).sort(([, a], [, b]) => b - a)[0];
	return top?.[0] ?? null;
}

export function buildDefaultFunnelSteps(
	items: Array<{ id: string; data: RawEvent }>,
): FunnelStep[] {
	const canonicalSteps: FunnelStep[] = [
		{ key: "pageview", label: "Page View" },
		{ key: "read", label: "Read" },
		{ key: "engaged", label: "Engaged" },
		{ key: "custom:cta_click", label: "CTA Click" },
		{ key: "custom:plan_select", label: "Plan Select" },
		{ key: "custom:signup_submit", label: "Signup Submit" },
		{ key: "custom:form_submit", label: "Form Submit" },
		{ key: "recirc", label: "Recirculation" },
	];

	const steps = canonicalSteps.filter((step) => hasEvent(items, step.key));
	if (steps.length >= 2) return steps.slice(0, 5);

	const fallback: FunnelStep[] = [];
	if (hasEvent(items, "pageview")) fallback.push({ key: "pageview", label: "Page View" });
	if (hasEvent(items, "read")) fallback.push({ key: "read", label: "Read" });
	if (hasEvent(items, "engaged")) fallback.push({ key: "engaged", label: "Engaged" });

	const custom = topCustomEvent(items);
	if (custom) fallback.push({ key: `custom:${custom}`, label: custom });
	else if (hasEvent(items, "recirc")) fallback.push({ key: "recirc", label: "Recirculation" });

	return fallback.slice(0, 4);
}

export function aggregateFunnel(
	items: Array<{ id: string; data: RawEvent }>,
	steps: FunnelStep[],
): FunnelRow[] {
	if (steps.length < 2) return [];

	const byVisitor = new Map<string, RawEvent[]>();
	for (const item of items) {
		const event = item.data;
		if (!event.visitorId) continue;
		const list = byVisitor.get(event.visitorId) ?? [];
		list.push(event);
		byVisitor.set(event.visitorId, list);
	}

	const completedCounts = new Array<number>(steps.length).fill(0);

	for (const events of byVisitor.values()) {
		events.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
		let stepIndex = 0;

		for (const event of events) {
			if (stepIndex >= steps.length) break;
			if (getEventKey(event) === steps[stepIndex].key) {
				completedCounts[stepIndex] += 1;
				stepIndex += 1;
			}
		}
	}

	const firstStep = completedCounts[0] || 1;
	return steps.map((step, index) => {
		const visitors = completedCounts[index];
		const previous = index === 0 ? completedCounts[0] : completedCounts[index - 1];
		const conversionRate = Math.round((visitors / firstStep) * 100);
		const dropOffRate = index === 0 || previous === 0
			? 0
			: Math.max(0, 100 - Math.round((visitors / previous) * 100));

		return {
			step: step.label,
			visitors,
			conversionRate,
			dropOffRate,
		};
	});
}

export function aggregateConfiguredFunnel(
	items: Array<{ id: string; data: RawEvent }>,
	funnel: FunnelDefinition,
): FunnelRow[] {
	if (funnel.steps.length < 2) return [];

	const byVisitor = new Map<string, RawEvent[]>();
	for (const item of items) {
		const event = item.data;
		if (!event.visitorId) continue;
		const list = byVisitor.get(event.visitorId) ?? [];
		list.push(event);
		byVisitor.set(event.visitorId, list);
	}

	const completedCounts = new Array<number>(funnel.steps.length).fill(0);

	for (const events of byVisitor.values()) {
		events.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
		let stepIndex = 0;

		for (const event of events) {
			if (stepIndex >= funnel.steps.length) break;
			if (matchesConfiguredStep(event, funnel.steps[stepIndex])) {
				completedCounts[stepIndex] += 1;
				stepIndex += 1;
			}
		}
	}

	const firstStep = completedCounts[0] || 1;
	return funnel.steps.map((step, index) => {
		const visitors = completedCounts[index];
		const previous = index === 0 ? completedCounts[0] : completedCounts[index - 1];
		const conversionRate = Math.round((visitors / firstStep) * 100);
		const dropOffRate = index === 0 || previous === 0
			? 0
			: Math.max(0, 100 - Math.round((visitors / previous) * 100));

		return {
			step: step.label,
			visitors,
			conversionRate,
			dropOffRate,
		};
	});
}
