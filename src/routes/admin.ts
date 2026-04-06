// ---------------------------------------------------------------------------
// POST /admin — Admin UI interactions handler
// ---------------------------------------------------------------------------

import type { PluginContext, RouteContext } from "emdash";
import type { LicenseProvider } from "../types.js";
import { canViewFunnels, canViewGoals, getLicense, validateLicense } from "../license/features.js";
import { KV_KEYS } from "../constants.js";
import { buildDashboard } from "../admin/dashboard.js";
import { buildWidget } from "../admin/widget.js";
import { handleDeactivateLicense } from "../admin/license.js";
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
	buildFunnelsUpgradePage,
	buildGoalsPage,
	buildGoalsUpgradePage,
} from "../admin/config-pages.js";

/** License provider injected by sandbox-entry. */
let _provider: LicenseProvider | null = null;

/** Called by sandbox-entry to inject the license provider. */
export function setLicenseProvider(provider: LicenseProvider): void {
	_provider = provider;
}

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

	const license = await getLicense(ctx.kv);

	// ─── Dashboard Widget ──────────���─────────────────────────────
	if (
		interaction.type === "page_load" &&
		interaction.page === "widget:site-overview"
	) {
		return buildWidget(ctx, license);
	}

	// ─── Analytics Page ───────────��─────────────────────────��────
	if (
		interaction.type === "page_load" &&
		interaction.page === "/analytics"
	) {
		if (_provider) {
			const fromSettings = (await ctx.kv.get<string>(KV_KEYS.SETTINGS_LICENSE_KEY)) ?? "";
			const fromEnv = typeof process !== "undefined" ? (process.env?.ANALYTICS_HUB_LICENSE_KEY ?? "") : "";
			const licenseKey = fromSettings || fromEnv;
			const siteUrl = (ctx as any).site?.url ?? (ctx as any).url?.("/") ?? "unknown";
			const updated = await validateLicense(ctx.kv, _provider, siteUrl, licenseKey);
			return buildDashboard(ctx, 7, updated);
		}
		return buildDashboard(ctx, 7, license);
	}

	if (interaction.type === "page_load" && interaction.page === "/analytics/goals") {
		if (!canViewGoals(license)) {
			return buildGoalsUpgradePage();
		}
		const [goals, catalog] = await Promise.all([
			loadGoalDefinitions(ctx),
			buildCatalogFromStorage(ctx),
		]);
		return buildGoalsPage({ goals, catalog });
	}

	if (interaction.type === "page_load" && interaction.page === "/analytics/funnels") {
		if (!canViewFunnels(license)) {
			return buildFunnelsUpgradePage();
		}
		const [funnels, catalog, stepCount] = await Promise.all([
			loadFunnelDefinitions(ctx),
			buildCatalogFromStorage(ctx),
			loadFunnelBuilderStepCount(ctx),
		]);
		return buildFunnelsPage({ funnels, catalog, stepCount });
	}

	// ─── Date Range Change ───────────���───────────────────────────
	if (
		interaction.type === "form_submit" &&
		interaction.action_id === "apply_range"
	) {
		const days = parseInt(
			(interaction.values?.range as string) ?? "7",
			10,
		);
		return buildDashboard(ctx, days, license);
	}

	// ─── License: Deactivate ───────���─────────────────────────────
	if (
		interaction.type === "form_submit" &&
		interaction.action_id === "deactivate_license"
	) {
		if (!_provider) return { blocks: [] };
		return handleDeactivateLicense(ctx, _provider);
	}

	if (interaction.type === "form_submit" && interaction.action_id === "add_goal_preset") {
		if (!canViewGoals(license)) return buildGoalsUpgradePage();
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
		if (!canViewGoals(license)) return buildGoalsUpgradePage();
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
		if (!canViewGoals(license)) return buildGoalsUpgradePage();
		const goalId = String(interaction.values?.goal_id ?? "");
		const goals = (await loadGoalDefinitions(ctx)).filter((goal) => goal.id !== goalId);
		await saveGoalDefinitions(ctx, goals);
		return buildGoalsPage({ goals, catalog: await buildCatalogFromStorage(ctx) });
	}

	if (interaction.type === "form_submit" && interaction.action_id === "add_funnel_preset") {
		if (!canViewFunnels(license)) return buildFunnelsUpgradePage();
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
		if (!canViewFunnels(license)) return buildFunnelsUpgradePage();
		const current = await loadFunnelBuilderStepCount(ctx);
		await saveFunnelBuilderStepCount(ctx, current + 1);
		return buildFunnelsPage({
			funnels: await loadFunnelDefinitions(ctx),
			catalog: await buildCatalogFromStorage(ctx),
			stepCount: await loadFunnelBuilderStepCount(ctx),
		});
	}

	if (interaction.type === "block_action" && interaction.action_id === "remove_funnel_step") {
		if (!canViewFunnels(license)) return buildFunnelsUpgradePage();
		const current = await loadFunnelBuilderStepCount(ctx);
		await saveFunnelBuilderStepCount(ctx, current - 1);
		return buildFunnelsPage({
			funnels: await loadFunnelDefinitions(ctx),
			catalog: await buildCatalogFromStorage(ctx),
			stepCount: await loadFunnelBuilderStepCount(ctx),
		});
	}

	if (interaction.type === "form_submit" && interaction.action_id === "save_funnel") {
		if (!canViewFunnels(license)) return buildFunnelsUpgradePage();
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
		if (!canViewFunnels(license)) return buildFunnelsUpgradePage();
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
