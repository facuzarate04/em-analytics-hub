// ---------------------------------------------------------------------------
// Lemon Squeezy License Provider (v1)
// ---------------------------------------------------------------------------
//
// Calls the Lemon Squeezy License API directly from the plugin.
// No intermediate Worker or custom infrastructure needed.
//
// API docs: https://docs.lemonsqueezy.com/api/license-api
//

import type { LicenseProvider, LicenseCheckResult, PlanId } from "../../types.js";

const LS_API_BASE = "https://api.lemonsqueezy.com/v1/licenses";

/** Maps Lemon Squeezy variant names to internal plan IDs. */
const VARIANT_TO_PLAN: Record<string, PlanId> = {
	"pro monthly": "pro",
	"pro yearly": "pro",
	"pro": "pro",
	"business monthly": "business",
	"business yearly": "business",
	"business": "business",
};

/**
 * Extracts the plan ID from the Lemon Squeezy license response metadata.
 * Falls back to "pro" if the variant name is not recognized, since
 * any paid license should at least be Pro.
 */
function resolvePlan(meta: Record<string, unknown>): PlanId {
	const variantName = String(
		data_get(meta, "variant_name") ?? "",
	).toLowerCase().trim();

	return VARIANT_TO_PLAN[variantName] ?? "pro";
}

/**
 * Safe property access helper (data_get pattern).
 */
function data_get(obj: Record<string, unknown>, key: string): unknown {
	return obj[key];
}

/**
 * Parses the Lemon Squeezy License API response into a LicenseCheckResult.
 */
function parseResponse(body: Record<string, unknown>): LicenseCheckResult {
	const valid = data_get(body, "valid") === true;
	const error = valid ? undefined : String(data_get(body, "error") ?? "Unknown error");

	const licenseKey = (data_get(body, "license_key") ?? {}) as Record<string, unknown>;
	const instance = (data_get(body, "instance") ?? {}) as Record<string, unknown>;
	const meta = (data_get(body, "meta") ?? {}) as Record<string, unknown>;

	const status = String(data_get(licenseKey, "status") ?? "inactive");
	const expiresAt = String(data_get(licenseKey, "expires_at") ?? "");
	const instanceId = String(data_get(instance, "id") ?? "");

	return {
		valid,
		plan: valid ? resolvePlan(meta) : "free",
		status: valid ? "active" : (status === "expired" ? "expired" : "inactive"),
		instanceId,
		validUntil: expiresAt,
		error,
	};
}

/**
 * Makes a POST request to the Lemon Squeezy License API.
 */
async function lsRequest(
	endpoint: string,
	params: Record<string, string>,
): Promise<Record<string, unknown>> {
	const body = new URLSearchParams(params);

	const response = await fetch(`${LS_API_BASE}/${endpoint}`, {
		method: "POST",
		headers: {
			"Accept": "application/json",
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body: body.toString(),
	});

	if (!response.ok) {
		const text = await response.text();
		return {
			valid: false,
			error: `HTTP ${response.status}: ${text}`,
		};
	}

	return await response.json() as Record<string, unknown>;
}

/**
 * Lemon Squeezy License Provider.
 *
 * Uses the LS License API directly — no intermediate infrastructure.
 * Supports activate, validate, and deactivate operations.
 *
 * @see https://docs.lemonsqueezy.com/api/license-api
 */
export class LemonSqueezyProvider implements LicenseProvider {
	async activate(licenseKey: string, siteUrl: string): Promise<LicenseCheckResult> {
		try {
			const body = await lsRequest("activate", {
				license_key: licenseKey,
				instance_name: siteUrl,
			});

			return parseResponse(body);
		} catch (error) {
			report(error);
			return {
				valid: false,
				plan: "free",
				status: "unknown",
				instanceId: "",
				validUntil: "",
				error: "Network error during activation",
			};
		}
	}

	async validate(licenseKey: string, instanceId: string): Promise<LicenseCheckResult> {
		try {
			const body = await lsRequest("validate", {
				license_key: licenseKey,
				instance_id: instanceId,
			});

			return parseResponse(body);
		} catch (error) {
			report(error);
			return {
				valid: false,
				plan: "free",
				status: "unknown",
				instanceId,
				validUntil: "",
				error: "Network error during validation",
			};
		}
	}

	async deactivate(licenseKey: string, instanceId: string): Promise<LicenseCheckResult> {
		try {
			const body = await lsRequest("deactivate", {
				license_key: licenseKey,
				instance_id: instanceId,
			});

			return parseResponse(body);
		} catch (error) {
			report(error);
			return {
				valid: false,
				plan: "free",
				status: "inactive",
				instanceId,
				validUntil: "",
				error: "Network error during deactivation",
			};
		}
	}
}

function report(error: unknown): void {
	if (error instanceof Error) {
		console.error(`[analytics-hub:lemon-squeezy] ${error.message}`, error.stack);
	} else {
		console.error("[analytics-hub:lemon-squeezy] Unknown error", error);
	}
}
