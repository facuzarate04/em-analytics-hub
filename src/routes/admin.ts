// ---------------------------------------------------------------------------
// POST /admin — Admin UI interactions handler
// ---------------------------------------------------------------------------

import type { PluginContext, RouteContext } from "emdash";
import type { LicenseProvider } from "../types.js";
import { getLicense } from "../license/features.js";
import { buildDashboard } from "../admin/dashboard.js";
import { buildWidget } from "../admin/widget.js";
import {
	buildLicenseStatus,
	handleActivateLicense,
	handleDeactivateLicense,
} from "../admin/license.js";

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

	// ─── License: Settings Page Load ─────────────────────────────
	if (
		interaction.type === "page_load" &&
		interaction.page === "settings"
	) {
		return buildLicenseStatus(license);
	}

	// ─── License: Activate (key saved in settings) ───────────────
	if (
		interaction.type === "form_submit" &&
		interaction.action_id === "activate_license"
	) {
		if (!_provider) return { blocks: [] };
		return handleActivateLicense(ctx, _provider);
	}

	// ─── License: Deactivate ─────────────────────────────────────
	if (
		interaction.type === "form_submit" &&
		interaction.action_id === "deactivate_license"
	) {
		if (!_provider) return { blocks: [] };
		return handleDeactivateLicense(ctx, _provider);
	}

	// ─── Settings Saved (trigger license activation only if key changed) ──
	if (
		interaction.type === "settings_saved"
	) {
		if (!_provider) return { blocks: [] };

		const newKey = await ctx.kv.get<string>("settings:licenseKey") ?? "";
		const current = await getLicense(ctx.kv);

		// Only activate if a new key was entered (or removed)
		if (newKey && !current.instanceId) {
			return handleActivateLicense(ctx, _provider);
		}
		if (!newKey && current.instanceId) {
			return handleDeactivateLicense(ctx, _provider);
		}

		// Key unchanged — just return current status
		return buildLicenseStatus(current);
	}

	return { blocks: [] };
}
