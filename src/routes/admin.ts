// ---------------------------------------------------------------------------
// POST /admin — Admin UI interactions handler
// ---------------------------------------------------------------------------

import type { PluginContext, RouteContext } from "emdash";
import type { LicenseProvider } from "../types.js";
import { getLicense, activateLicense, isFreePlan } from "../license/features.js";
import { buildDashboard } from "../admin/dashboard.js";
import { buildWidget } from "../admin/widget.js";
import { handleDeactivateLicense } from "../admin/license.js";

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
		// If license key exists but not activated yet, activate on first page load
		if (isFreePlan(license) && _provider) {
			const licenseKey = typeof process !== "undefined" ? (process.env?.ANALYTICS_HUB_LICENSE_KEY ?? "") : "";
			if (licenseKey) {
				const siteUrl = (ctx as any).site?.url ?? (ctx as any).url?.("/") ?? "unknown";
				const result = await activateLicense(ctx.kv, _provider, licenseKey, siteUrl);
				if (result.valid) {
					const updated = await getLicense(ctx.kv);
					return buildDashboard(ctx, 7, updated);
				}
			}
		}
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

	// ─── License: Deactivate ─────────────────────────────────────
	if (
		interaction.type === "form_submit" &&
		interaction.action_id === "deactivate_license"
	) {
		if (!_provider) return { blocks: [] };
		return handleDeactivateLicense(ctx, _provider);
	}

	return { blocks: [] };
}
