// ---------------------------------------------------------------------------
// Dev License Provider — for local development and testing only
// ---------------------------------------------------------------------------
//
// Simulates a valid Pro license without calling any external API.
// Requires BOTH conditions to activate:
//   1. EM_ANALYTICS_HUB_DEV_LICENSE=1 environment variable
//   2. NODE_ENV !== "production"
//
// If either condition is missing, the provider will NOT be used.
// A warning is logged on every startup when this provider is active.
//
// WARNING: This provider does not validate anything. Never use in production.
//

import type { LicenseProvider, LicenseCheckResult } from "../../types.js";

/**
 * Checks whether the DevLicenseProvider should be used.
 * Returns true only if both conditions are met:
 * - EM_ANALYTICS_HUB_DEV_LICENSE=1
 * - NODE_ENV is not "production"
 */
export function shouldUseDevProvider(): boolean {
	if (typeof process === "undefined") return false;

	const devFlag = process.env?.EM_ANALYTICS_HUB_DEV_LICENSE === "1";
	const isProduction = process.env?.NODE_ENV === "production";

	return devFlag && !isProduction;
}

/**
 * Development-only license provider.
 * Always returns a valid Pro license for any key.
 */
export class DevLicenseProvider implements LicenseProvider {
	constructor() {
		console.warn(
			"[analytics-hub] WARNING: DevLicenseProvider is active. " +
			"All license checks will return Pro. " +
			"Do NOT use in production.",
		);
	}

	async activate(_licenseKey: string, siteUrl: string): Promise<LicenseCheckResult> {
		return {
			valid: true,
			plan: "pro",
			status: "active",
			instanceId: `dev-${siteUrl}`,
			validUntil: "2099-12-31T23:59:59Z",
		};
	}

	async validate(_licenseKey: string, instanceId: string): Promise<LicenseCheckResult> {
		return {
			valid: true,
			plan: "pro",
			status: "active",
			instanceId,
			validUntil: "2099-12-31T23:59:59Z",
		};
	}

	async deactivate(_licenseKey: string, _instanceId: string): Promise<LicenseCheckResult> {
		return {
			valid: false,
			plan: "free",
			status: "inactive",
			instanceId: "",
			validUntil: "",
		};
	}
}
