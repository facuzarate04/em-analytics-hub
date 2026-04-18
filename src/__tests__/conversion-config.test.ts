import { describe, expect, it } from "vitest";
import { aggregateConfiguredGoals } from "../helpers/goals.js";
import { aggregateConfiguredFunnel } from "../helpers/funnels.js";
import type { CustomEvent, FunnelDefinition, GoalDefinition, RawEvent } from "../types.js";

function rawEvent(overrides: Partial<RawEvent>): { id: string; data: RawEvent } {
	return {
		id: Math.random().toString(36).slice(2),
		data: {
			pathname: "/pricing",
			type: "pageview",
			referrer: "direct",
			visitorId: "visitor-1",
			country: "",
			template: "",
			collection: "",
			utmSource: "",
			utmMedium: "",
			utmCampaign: "",
			utmTerm: "",
			utmContent: "",
			seconds: 0,
			scrollDepth: 0,
			eventName: "",
			eventProps: "",
			createdAt: "2026-04-04T12:00:00.000Z",
			...overrides,
		},
	};
}

function customEvent(overrides: Partial<CustomEvent>): { id: string; data: CustomEvent } {
	return {
		id: Math.random().toString(36).slice(2),
		data: {
			name: "cta_click",
			pathname: "/pricing",
			props: {},
			visitorId: "visitor-1",
			createdAt: "2026-04-04T12:00:01.000Z",
			...overrides,
		},
	};
}

describe("configured goals", () => {
	it("counts page goals with completions and unique visitors", () => {
		const goals: GoalDefinition[] = [
			{ id: "g1", name: "Pricing Goal", type: "page", target: "/pricing", active: true },
		];

		const rows = aggregateConfiguredGoals({
			goals,
			rawEvents: [
				rawEvent({ pathname: "/pricing", visitorId: "visitor-1" }),
				rawEvent({ pathname: "/pricing", visitorId: "visitor-1", createdAt: "2026-04-04T12:05:00.000Z" }),
				rawEvent({ pathname: "/blog", visitorId: "visitor-2" }),
			],
			customEvents: [],
			totalVisitors: 2,
		});

		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			goal: "Pricing Goal",
			completions: 2,
			visitors: 1,
			conversionRate: 50,
		});
	});

	it("counts form and event goals from custom events", () => {
		const goals: GoalDefinition[] = [
			{ id: "g1", name: "CTA Goal", type: "event", target: "cta_click", active: true },
			{ id: "g2", name: "Newsletter Goal", type: "form", target: "newsletter", active: true },
		];

		const rows = aggregateConfiguredGoals({
			goals,
			rawEvents: [],
			customEvents: [
				customEvent({ name: "cta_click", visitorId: "visitor-1" }),
				customEvent({ name: "cta_click", visitorId: "visitor-2", createdAt: "2026-04-04T12:02:00.000Z" }),
				customEvent({ name: "signup_submit", props: { form: "newsletter" }, visitorId: "visitor-2" }),
			],
			totalVisitors: 3,
		});

		expect(rows[0]).toMatchObject({ goal: "CTA Goal", completions: 2, visitors: 2, conversionRate: 67 });
		expect(rows[1]).toMatchObject({ goal: "Newsletter Goal", completions: 1, visitors: 1, conversionRate: 33 });
	});
});

describe("configured funnels", () => {
	it("tracks ordered step completion per visitor", () => {
		const funnel: FunnelDefinition = {
			id: "f1",
			name: "Lead Funnel",
			active: true,
			steps: [
				{ label: "Pricing Page", type: "page", target: "/pricing" },
				{ label: "CTA Click", type: "event", target: "cta_click" },
				{ label: "Signup Submit", type: "event", target: "signup_submit" },
			],
		};

		const rows = aggregateConfiguredFunnel(
			[
				rawEvent({ pathname: "/pricing", visitorId: "visitor-1", createdAt: "2026-04-04T12:00:00.000Z" }),
				rawEvent({ type: "custom", eventName: "cta_click", visitorId: "visitor-1", createdAt: "2026-04-04T12:00:01.000Z" }),
				rawEvent({ type: "custom", eventName: "signup_submit", visitorId: "visitor-1", createdAt: "2026-04-04T12:00:02.000Z" }),
				rawEvent({ pathname: "/pricing", visitorId: "visitor-2", createdAt: "2026-04-04T12:01:00.000Z" }),
				rawEvent({ type: "custom", eventName: "cta_click", visitorId: "visitor-2", createdAt: "2026-04-04T12:01:01.000Z" }),
			],
			funnel,
		);

		expect(rows).toHaveLength(3);
		expect(rows[0]).toMatchObject({ step: "Pricing Page", visitors: 2, conversionRate: 100, dropOffRate: 0 });
		expect(rows[1]).toMatchObject({ step: "CTA Click", visitors: 2, conversionRate: 100, dropOffRate: 0 });
		expect(rows[2]).toMatchObject({ step: "Signup Submit", visitors: 1, conversionRate: 50, dropOffRate: 50 });
	});
});
