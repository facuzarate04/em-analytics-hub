// ---------------------------------------------------------------------------
// Goals / Funnels configuration storage and presets
// ---------------------------------------------------------------------------

import type { PluginContext } from "emdash";
import type {
	DetectionCatalog,
	FunnelDefinition,
	FunnelStepDefinition,
	GoalDefinition,
	GoalType,
} from "../types.js";
import { KV_KEYS } from "../constants.js";
import { eventId } from "../helpers/date.js";

function asStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function normalizeGoalDefinition(value: unknown): GoalDefinition | null {
	if (!value || typeof value !== "object") return null;
	const item = value as Record<string, unknown>;
	const type = item.type;
	if (type !== "page" && type !== "form" && type !== "event") return null;
	if (typeof item.id !== "string" || typeof item.name !== "string" || typeof item.target !== "string") {
		return null;
	}
	return {
		id: item.id,
		name: item.name,
		type,
		target: item.target,
		active: item.active !== false,
	};
}

function normalizeFunnelStep(value: unknown): FunnelStepDefinition | null {
	if (!value || typeof value !== "object") return null;
	const item = value as Record<string, unknown>;
	const type = item.type;
	if (type !== "page" && type !== "form" && type !== "event") return null;
	if (typeof item.label !== "string" || typeof item.target !== "string") return null;
	return { label: item.label, type, target: item.target };
}

function normalizeFunnelDefinition(value: unknown): FunnelDefinition | null {
	if (!value || typeof value !== "object") return null;
	const item = value as Record<string, unknown>;
	if (typeof item.id !== "string" || typeof item.name !== "string" || !Array.isArray(item.steps)) {
		return null;
	}
	const steps = item.steps.map(normalizeFunnelStep).filter((step): step is FunnelStepDefinition => !!step);
	if (steps.length < 2) return null;
	return {
		id: item.id,
		name: item.name,
		active: item.active !== false,
		steps,
	};
}

async function loadJson<T>(ctx: PluginContext, key: string, normalize: (value: unknown) => T | null): Promise<T[]> {
	const raw = await ctx.kv.get<string>(key);
	if (!raw) return [];

	try {
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed.map(normalize).filter((item): item is T => !!item);
	} catch {
		return [];
	}
}

async function saveJson<T>(ctx: PluginContext, key: string, items: T[]): Promise<void> {
	await ctx.kv.set(key, JSON.stringify(items));
}

export async function loadGoalDefinitions(ctx: PluginContext): Promise<GoalDefinition[]> {
	return loadJson(ctx, KV_KEYS.GOAL_DEFINITIONS, normalizeGoalDefinition);
}

export async function saveGoalDefinitions(ctx: PluginContext, items: GoalDefinition[]): Promise<void> {
	await saveJson(ctx, KV_KEYS.GOAL_DEFINITIONS, items);
}

export async function loadFunnelDefinitions(ctx: PluginContext): Promise<FunnelDefinition[]> {
	return loadJson(ctx, KV_KEYS.FUNNEL_DEFINITIONS, normalizeFunnelDefinition);
}

export async function saveFunnelDefinitions(ctx: PluginContext, items: FunnelDefinition[]): Promise<void> {
	await saveJson(ctx, KV_KEYS.FUNNEL_DEFINITIONS, items);
}

export async function loadFunnelBuilderStepCount(ctx: PluginContext): Promise<number> {
	const value = await ctx.kv.get<number>(KV_KEYS.FUNNEL_BUILDER_STEPS);
	if (typeof value !== "number" || Number.isNaN(value)) return 2;
	return Math.max(2, Math.min(5, value));
}

export async function saveFunnelBuilderStepCount(ctx: PluginContext, value: number): Promise<void> {
	await ctx.kv.set(KV_KEYS.FUNNEL_BUILDER_STEPS, Math.max(2, Math.min(5, value)));
}

export function createGoalDefinition(input: {
	name: string;
	type: GoalType;
	target: string;
	active?: boolean;
}): GoalDefinition {
	return {
		id: eventId(),
		name: input.name.trim(),
		type: input.type,
		target: input.target.trim(),
		active: input.active !== false,
	};
}

export function createFunnelDefinition(input: {
	name: string;
	active?: boolean;
	steps: FunnelStepDefinition[];
}): FunnelDefinition {
	return {
		id: eventId(),
		name: input.name.trim(),
		active: input.active !== false,
		steps: input.steps,
	};
}

export function createGoalPreset(preset: string): GoalDefinition | null {
	switch (preset) {
		case "newsletter_signup":
			return createGoalDefinition({ name: "Newsletter Signup", type: "form", target: "newsletter" });
		case "contact_form":
			return createGoalDefinition({ name: "Contact Form", type: "form", target: "contact" });
		case "pricing_cta":
			return createGoalDefinition({ name: "Pricing CTA Click", type: "event", target: "cta_click" });
		case "thank_you_page":
			return createGoalDefinition({ name: "Thank You Page", type: "page", target: "/thank-you" });
		default:
			return null;
	}
}

export function createFunnelPreset(preset: string): FunnelDefinition | null {
	switch (preset) {
		case "lead_generation":
			return createFunnelDefinition({
				name: "Lead Generation Funnel",
				steps: [
					{ label: "Pricing Page", type: "page", target: "/pricing" },
					{ label: "CTA Click", type: "event", target: "cta_click" },
					{ label: "Signup Submit", type: "event", target: "signup_submit" },
				],
			});
		case "newsletter":
			return createFunnelDefinition({
				name: "Newsletter Funnel",
				steps: [
					{ label: "Blog Visit", type: "page", target: "/" },
					{ label: "CTA Click", type: "event", target: "cta_click" },
					{ label: "Newsletter Submit", type: "form", target: "newsletter" },
				],
			});
		case "contact":
			return createFunnelDefinition({
				name: "Contact Funnel",
				steps: [
					{ label: "Contact Page", type: "page", target: "/contact" },
					{ label: "Form Submit", type: "form", target: "contact" },
				],
			});
		default:
			return null;
	}
}

export function buildDetectionCatalog(input: {
	pages?: string[];
	forms?: string[];
	events?: string[];
}): DetectionCatalog {
	return {
		pages: asStringArray(input.pages).sort((a, b) => a.localeCompare(b)),
		forms: asStringArray(input.forms).sort((a, b) => a.localeCompare(b)),
		events: asStringArray(input.events).sort((a, b) => a.localeCompare(b)),
	};
}
