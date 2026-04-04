// ---------------------------------------------------------------------------
// POST /admin — Admin UI interactions handler
// ---------------------------------------------------------------------------

import type { PluginContext, RouteContext } from "emdash";
import { getLicense } from "../license/features.js";
import { buildDashboard } from "../admin/dashboard.js";
import { buildWidget } from "../admin/widget.js";

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
	};

	const license = await getLicense(ctx.kv);

	// ─── Dashboard Widget ────────────────────────────────────────
	if (
		interaction.type === "page_load" &&
		interaction.page === "widget:site-overview"
	) {
		return buildWidget(ctx, license);
	}

	// ─── Analytics Page ──────────────────────────────────────────
	if (
		interaction.type === "page_load" &&
		interaction.page === "/analytics"
	) {
		return buildDashboard(ctx, 7, license);
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
		return buildDashboard(ctx, days, license);
	}

	return { blocks: [] };
}
