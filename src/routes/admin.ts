// ---------------------------------------------------------------------------
// POST /admin — Admin UI interactions handler
// ---------------------------------------------------------------------------

import type { PluginContext, RouteContext } from "emdash";
import { buildDashboard } from "../admin/dashboard.js";
import { buildWidget } from "../admin/widget.js";
import { buildCatalogFromStorage } from "../admin/catalog.js";
import {
	createFunnelDefinition,
	createFunnelPreset,
	createGoalDefinition,
	createGoalPreset,
	loadFunnelBuilderStepCount,
	loadFunnelDefinitions,
	loadGoalDefinitions,
	saveFunnelBuilderStepCount,
	saveFunnelDefinitions,
	saveGoalDefinitions,
} from "../admin/config.js";
import {
	buildFunnelsPage,
	buildGoalsPage,
} from "../admin/config-pages.js";

/**
 * Handles admin UI interactions (page_load, form_submit, block_action).
 * Routes to the appropriate page/widget builder.
 */
export async function handleAdmin(
	routeCtx: RouteContext,
	ctx: PluginContext,
): Promise<Record<string, unknown>> {
	const interaction = routeCtx.input as {
		type: string;
		page?: string;
		widget?: string;
		action_id?: string;
		values?: Record<string, unknown>;
		value?: unknown;
	};

	// ─── Dashboard Widget ────────────────────────────────────────
	if (
		interaction.type === "page_load" &&
		interaction.page === "widget:site-overview"
	) {
		return buildWidget(ctx);
	}

	// ─── Analytics Page ──────────────────────────────────────────
	if (
		interaction.type === "page_load" &&
		interaction.page === "/analytics"
	) {
		return buildDashboard(ctx, 7);
	}

	if (interaction.type === "page_load" && interaction.page === "/analytics/goals") {
		const [goals, catalog] = await Promise.all([
			loadGoalDefinitions(ctx),
			buildCatalogFromStorage(ctx),
		]);
		return buildGoalsPage({ goals, catalog });
	}

	if (interaction.type === "page_load" && interaction.page === "/analytics/funnels") {
		const [funnels, catalog, stepCount] = await Promise.all([
			loadFunnelDefinitions(ctx),
			buildCatalogFromStorage(ctx),
			loadFunnelBuilderStepCount(ctx),
		]);
		return buildFunnelsPage({ funnels, catalog, stepCount });
	}

	// ─── Date Range Change ───────────────────────────────────────
	if (
		interaction.type === "form_submit" &&
		interaction.action_id === "apply_range"
	) {
		const days = parseInt(
			(interaction.values?.range as string) ?? "7",
			10,
		);
		return buildDashboard(ctx, days);
	}

	if (interaction.type === "form_submit" && interaction.action_id === "add_goal_preset") {
		const preset = String(interaction.values?.goal_preset ?? "");
		const next = createGoalPreset(preset);
		const goals = await loadGoalDefinitions(ctx);
		if (next && !goals.some((goal) => goal.name === next.name)) {
			goals.push(next);
			await saveGoalDefinitions(ctx, goals);
		}
		return buildGoalsPage({ goals: await loadGoalDefinitions(ctx), catalog: await buildCatalogFromStorage(ctx) });
	}

	if (interaction.type === "form_submit" && interaction.action_id === "save_goal") {
		const type = String(interaction.values?.goal_type ?? "page") as "page" | "form" | "event";
		const target = String(
			type === "page"
				? interaction.values?.goal_page_target ?? ""
				: type === "form"
					? interaction.values?.goal_form_target ?? ""
					: interaction.values?.goal_event_target ?? "",
		);
		const name = String(interaction.values?.goal_name ?? "").trim();
		const active = Boolean(interaction.values?.goal_active ?? true);
		const goals = await loadGoalDefinitions(ctx);
		if (name && target) {
			goals.push(createGoalDefinition({ name, type, target, active }));
			await saveGoalDefinitions(ctx, goals);
		}
		return buildGoalsPage({ goals: await loadGoalDefinitions(ctx), catalog: await buildCatalogFromStorage(ctx) });
	}

	if (interaction.type === "form_submit" && interaction.action_id === "delete_goal") {
		const goalId = String(interaction.values?.goal_id ?? "");
		const goals = (await loadGoalDefinitions(ctx)).filter((goal) => goal.id !== goalId);
		await saveGoalDefinitions(ctx, goals);
		return buildGoalsPage({ goals, catalog: await buildCatalogFromStorage(ctx) });
	}

	if (interaction.type === "form_submit" && interaction.action_id === "add_funnel_preset") {
		const preset = String(interaction.values?.funnel_preset ?? "");
		const next = createFunnelPreset(preset);
		const funnels = await loadFunnelDefinitions(ctx);
		if (next && !funnels.some((funnel) => funnel.name === next.name)) {
			funnels.push(next);
			await saveFunnelDefinitions(ctx, funnels);
		}
		return buildFunnelsPage({
			funnels: await loadFunnelDefinitions(ctx),
			catalog: await buildCatalogFromStorage(ctx),
			stepCount: await loadFunnelBuilderStepCount(ctx),
		});
	}

	if (interaction.type === "block_action" && interaction.action_id === "add_funnel_step") {
		const current = await loadFunnelBuilderStepCount(ctx);
		await saveFunnelBuilderStepCount(ctx, current + 1);
		return buildFunnelsPage({
			funnels: await loadFunnelDefinitions(ctx),
			catalog: await buildCatalogFromStorage(ctx),
			stepCount: await loadFunnelBuilderStepCount(ctx),
		});
	}

	if (interaction.type === "block_action" && interaction.action_id === "remove_funnel_step") {
		const current = await loadFunnelBuilderStepCount(ctx);
		await saveFunnelBuilderStepCount(ctx, current - 1);
		return buildFunnelsPage({
			funnels: await loadFunnelDefinitions(ctx),
			catalog: await buildCatalogFromStorage(ctx),
			stepCount: await loadFunnelBuilderStepCount(ctx),
		});
	}

	if (interaction.type === "form_submit" && interaction.action_id === "save_funnel") {
		const name = String(interaction.values?.funnel_name ?? "").trim();
		const active = Boolean(interaction.values?.funnel_active ?? true);
		const stepCount = await loadFunnelBuilderStepCount(ctx);
		const steps = Array.from({ length: stepCount }, (_, idx) => idx + 1)
			.map((index) => {
				const type = String(interaction.values?.[`funnel_step_${index}_type`] ?? (index === 1 ? "page" : "event")) as "page" | "form" | "event";
				const target = String(
					type === "page"
						? interaction.values?.[`funnel_step_${index}_page_target`] ?? ""
						: type === "form"
							? interaction.values?.[`funnel_step_${index}_form_target`] ?? ""
							: interaction.values?.[`funnel_step_${index}_event_target`] ?? "",
				).trim();
				const label = String(interaction.values?.[`funnel_step_${index}_label`] ?? "").trim();
				if (!label || !target) return null;
				return { label, type, target };
			})
			.filter((step): step is { label: string; type: "page" | "form" | "event"; target: string } => !!step);

		const funnels = await loadFunnelDefinitions(ctx);
		if (name && steps.length >= 2) {
			funnels.push(createFunnelDefinition({ name, steps, active }));
			await saveFunnelDefinitions(ctx, funnels);
		}
		return buildFunnelsPage({
			funnels: await loadFunnelDefinitions(ctx),
			catalog: await buildCatalogFromStorage(ctx),
			stepCount: await loadFunnelBuilderStepCount(ctx),
		});
	}

	if (interaction.type === "form_submit" && interaction.action_id === "delete_funnel") {
		const funnelId = String(interaction.values?.funnel_id ?? "");
		const funnels = (await loadFunnelDefinitions(ctx)).filter((funnel) => funnel.id !== funnelId);
		await saveFunnelDefinitions(ctx, funnels);
		return buildFunnelsPage({
			funnels,
			catalog: await buildCatalogFromStorage(ctx),
			stepCount: await loadFunnelBuilderStepCount(ctx),
		});
	}

	return { blocks: [] };
}
