// ---------------------------------------------------------------------------
// License status UI for admin dashboard
// ---------------------------------------------------------------------------

import type { PluginContext } from "emdash";
import type { LicenseCache, LicenseCheckResult } from "../types.js";
import {
	getLicense,
	isFreePlan,
	isInGracePeriod,
	activateLicense,
	deactivateLicense,
} from "../license/features.js";
import type { LicenseProvider } from "../types.js";
import { KV_KEYS } from "../constants.js";
import { header, banner, context, statsBlock, divider } from "./components.js";

// ---------------------------------------------------------------------------
// License status page builder
// ---------------------------------------------------------------------------

/**
 * Builds the license status section shown in the admin settings area.
 * Shows current plan, status, site URL, and action buttons.
 */
export function buildLicenseStatus(license: LicenseCache): Record<string, unknown> {
	const blocks: Record<string, unknown>[] = [];

	blocks.push(header("License"));

	if (isFreePlan(license)) {
		blocks.push(
			statsBlock([
				{ label: "Plan", value: "Free" },
				{ label: "Status", value: "Active" },
			]),
			banner(
				"Pro",
				"Unlock funnels, campaign intelligence, and integrations.",
			),
		);

		return { blocks };
	}

	// Pro or Business
	const planLabel = license.plan === "pro" ? "Pro" : "Business";
	const statusLabel = formatStatus(license);

	const items = [
		{ label: "Plan", value: planLabel },
		{ label: "Status", value: statusLabel },
	];

	if (license.siteUrl) {
		items.push({ label: "Site", value: license.siteUrl });
	}

	if (license.validUntil) {
		items.push({ label: "Valid Until", value: formatDate(license.validUntil) });
	}

	blocks.push(statsBlock(items));

	// Grace period warning
	if (isInGracePeriod(license)) {
		blocks.push(
			banner(
				"License validation failed",
				"Pro features remain active during the grace period. The plugin will retry validation automatically. If this persists, check your subscription status.",
				"warning",
			),
		);
	}

	// Deactivate button
	blocks.push({
		type: "form",
		block_id: "license-actions",
		fields: [],
		submit: { label: "Deactivate License", action_id: "deactivate_license" },
	});

	return { blocks };
}

// ---------------------------------------------------------------------------
// License action handlers
// ---------------------------------------------------------------------------

/**
 * Handles the "activate_license" action from admin settings.
 * Called when the user saves a license key.
 */
export async function handleActivateLicense(
	ctx: PluginContext,
	provider: LicenseProvider,
): Promise<Record<string, unknown>> {
	const licenseKey = await ctx.kv.get<string>(KV_KEYS.SETTINGS_LICENSE_KEY);

	if (!licenseKey) {
		return {
			blocks: [
				banner(
					"No license key",
					"Enter your license key in the settings above and save to activate Pro.",
					"warning",
				),
			],
		};
	}

	const siteUrl = (ctx as any).site?.url ?? (ctx as any).url?.("/") ?? "unknown";
	const result = await activateLicense(ctx.kv, provider, licenseKey, siteUrl);

	if (result.valid) {
		const license = await getLicense(ctx.kv);
		return buildLicenseStatus(license);
	}

	return {
		blocks: [
			banner(
				"Activation failed",
				result.error ?? "Could not activate the license key. Check that the key is valid and you have available activations.",
				"warning",
			),
		],
	};
}

/**
 * Handles the "deactivate_license" action from admin UI.
 * Releases the slot in the provider and reverts to free.
 */
export async function handleDeactivateLicense(
	ctx: PluginContext,
	provider: LicenseProvider,
): Promise<Record<string, unknown>> {
	try {
		await deactivateLicense(ctx.kv, provider);
	} catch (error) {
		if (error instanceof Error) {
			console.error(`[analytics-hub] Deactivation error: ${error.message}`, error.stack);
		}
	}

	const license = await getLicense(ctx.kv);
	return buildLicenseStatus(license);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatStatus(license: LicenseCache): string {
	if (isInGracePeriod(license)) return "Grace Period";
	switch (license.status) {
		case "active": return "Active";
		case "expired": return "Expired";
		case "inactive": return "Inactive";
		default: return "Unknown";
	}
}

function formatDate(iso: string): string {
	if (!iso) return "—";
	try {
		return new Date(iso).toLocaleDateString("en-US", {
			year: "numeric",
			month: "short",
			day: "numeric",
		});
	} catch {
		return iso.slice(0, 10);
	}
}
