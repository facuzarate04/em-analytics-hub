// ---------------------------------------------------------------------------
// License status UI and actions
// ---------------------------------------------------------------------------

import type { PluginContext } from "emdash";
import type { LicenseCache } from "../types.js";
import {
	getLicense,
	isFreePlan,
	isInGracePeriod,
	deactivateLicense,
} from "../license/features.js";
import type { LicenseProvider } from "../types.js";
import { header, banner, statsBlock } from "./components.js";

// ---------------------------------------------------------------------------
// License status page builder
// ---------------------------------------------------------------------------

/**
 * Builds the license status section.
 * Used both standalone and as part of the dashboard.
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
				"Unlock funnels, campaign intelligence, countries, and deeper event insights.",
			),
		);

		return { blocks };
	}

	// Pro or Business
	const planLabel = license.plan === "pro" ? "Pro" : "Business";

	const items = [
		{ label: "Plan", value: planLabel },
		{ label: "Status", value: isInGracePeriod(license) ? "Grace Period" : "Active" },
	];

	if (license.siteUrl) {
		items.push({ label: "Site", value: license.siteUrl });
	}

	blocks.push(statsBlock(items));

	if (isInGracePeriod(license)) {
		blocks.push(
			banner(
				"Validation failed",
				"Pro features remain active during the grace period. The plugin will retry automatically.",
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
