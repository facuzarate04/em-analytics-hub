// ---------------------------------------------------------------------------
// License & feature gating
// ---------------------------------------------------------------------------

import type { LicenseCache, LicenseProvider, LicenseCheckResult, PlanId } from "../types.js";
import { PLANS, DEFAULT_RETENTION_DAYS, KV_KEYS } from "../constants.js";

/** Grace period in days after last successful validation. */
const GRACE_PERIOD_DAYS = 7;

/** Revalidation interval in hours. */
const REVALIDATION_INTERVAL_HOURS = 24;

// ---------------------------------------------------------------------------
// KV access type (matches EmDash's KVAccess)
// ---------------------------------------------------------------------------

export interface KVAccess {
	get: <T>(key: string) => Promise<T | null | undefined>;
	set: (key: string, value: unknown) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Default license cache
// ---------------------------------------------------------------------------

/** Default free plan license cache. */
export const FREE_LICENSE: LicenseCache = {
	plan: "free",
	validUntil: "",
	checkedAt: "",
	status: "inactive",
	instanceId: "",
	siteUrl: "",
	graceEndsAt: "",
};

// ---------------------------------------------------------------------------
// License cache read/write
// ---------------------------------------------------------------------------

/**
 * Retrieves the current license from KV store, falling back to free plan.
 */
export async function getLicense(kv: KVAccess): Promise<LicenseCache> {
	try {
		const cached = await kv.get<LicenseCache>(KV_KEYS.LICENSE_CACHE);
		if (cached) return { ...FREE_LICENSE, ...cached };
	} catch (error) {
		report(error);
	}
	return FREE_LICENSE;
}

/**
 * Persists the license cache to KV store.
 */
export async function saveLicense(kv: KVAccess, cache: LicenseCache): Promise<void> {
	await kv.set(KV_KEYS.LICENSE_CACHE, cache);
}

// ---------------------------------------------------------------------------
// License activation and validation
// ---------------------------------------------------------------------------

/**
 * Activates a license key for a site using the configured provider.
 * Stores the result in KV cache on success.
 */
export async function activateLicense(
	kv: KVAccess,
	provider: LicenseProvider,
	licenseKey: string,
	siteUrl: string,
): Promise<LicenseCheckResult> {
	const result = await provider.activate(licenseKey, siteUrl);

	if (result.valid) {
		const cache: LicenseCache = {
			plan: result.plan,
			validUntil: result.validUntil,
			checkedAt: new Date().toISOString(),
			status: "active",
			instanceId: result.instanceId,
			siteUrl,
			graceEndsAt: "",
		};
		await saveLicense(kv, cache);
	}

	return result;
}

/**
 * Validates the current license using the configured provider.
 * The license key is passed from plugin options (astro.config.mjs),
 * not read from KV.
 *
 * Handles:
 * - Key provided but not activated → activate it
 * - Key removed (empty) → deactivate and revert to free
 * - Existing activation → revalidate with grace period
 */
export async function validateLicense(
	kv: KVAccess,
	provider: LicenseProvider,
	siteUrl?: string,
	licenseKey?: string,
): Promise<LicenseCache> {
	const current = await getLicense(kv);
	const key = licenseKey ?? "";

	// ── Key removed → deactivate and revert to free ─────────────
	if (!key && current.instanceId) {
		try {
			await provider.deactivate("", current.instanceId);
		} catch {
			// Best effort
		}
		await saveLicense(kv, FREE_LICENSE);
		return FREE_LICENSE;
	}

	// ── No key set and never activated → nothing to do ───────────
	if (!key) {
		return current;
	}

	// ── Key provided but not activated yet → activate it ────────
	if (!current.instanceId || current.plan === "free") {
		const site = siteUrl ?? current.siteUrl ?? "unknown";
		const result = await activateLicense(kv, provider, key, site);
		if (result.valid) {
			return getLicense(kv);
		}
		return current;
	}

	// ── Existing activation — check if revalidation is due ──────
	if (current.checkedAt && !isRevalidationDue(current.checkedAt)) {
		return current;
	}

	const result = await provider.validate(key, current.instanceId);

	if (result.valid) {
		// Success — update cache, clear grace
		const updated: LicenseCache = {
			...current,
			plan: result.plan,
			validUntil: result.validUntil,
			checkedAt: new Date().toISOString(),
			status: "active",
			graceEndsAt: "",
		};
		await saveLicense(kv, updated);
		return updated;
	}

	// Validation failed — apply grace period logic
	return applyGracePeriod(kv, current, result);
}

/**
 * Deactivates the current license and reverts to free plan.
 */
export async function deactivateLicense(
	kv: KVAccess,
	provider: LicenseProvider,
): Promise<void> {
	const current = await getLicense(kv);

	if (current.instanceId) {
		try {
			await provider.deactivate("", current.instanceId);
		} catch (error) {
			report(error);
		}
	}

	await saveLicense(kv, FREE_LICENSE);
}

// ---------------------------------------------------------------------------
// Grace period
// ---------------------------------------------------------------------------

/**
 * Applies grace period logic when validation fails.
 * - If no grace period active: starts one (7 days from now)
 * - If grace period active and not expired: keep Pro, return current cache
 * - If grace period expired: degrade to free
 */
async function applyGracePeriod(
	kv: KVAccess,
	current: LicenseCache,
	failedResult: LicenseCheckResult,
): Promise<LicenseCache> {
	const now = new Date();

	// If status is explicitly expired (not a network error), shorter tolerance
	if (failedResult.status === "expired") {
		const updated: LicenseCache = {
			...current,
			plan: "free",
			status: "expired",
			checkedAt: now.toISOString(),
			graceEndsAt: "",
		};
		await saveLicense(kv, updated);
		return updated;
	}

	// Network error or unknown — apply grace period
	if (!current.graceEndsAt) {
		// Start grace period
		const graceEnd = new Date(now);
		graceEnd.setDate(graceEnd.getDate() + GRACE_PERIOD_DAYS);

		const updated: LicenseCache = {
			...current,
			status: "active", // Keep active during grace
			graceEndsAt: graceEnd.toISOString(),
		};
		await saveLicense(kv, updated);
		return updated;
	}

	// Grace period already active — check if expired
	if (new Date(current.graceEndsAt) < now) {
		// Grace period expired — degrade to free
		const updated: LicenseCache = {
			...current,
			plan: "free",
			status: "inactive",
			checkedAt: now.toISOString(),
			graceEndsAt: "",
		};
		await saveLicense(kv, updated);
		return updated;
	}

	// Still within grace period — keep current state
	return current;
}

/**
 * Checks if enough time has passed since last validation to revalidate.
 */
function isRevalidationDue(checkedAt: string): boolean {
	if (!checkedAt) return true;
	const lastCheck = new Date(checkedAt).getTime();
	const now = Date.now();
	const intervalMs = REVALIDATION_INTERVAL_HOURS * 60 * 60 * 1000;
	return (now - lastCheck) >= intervalMs;
}

// ---------------------------------------------------------------------------
// Feature gating
// ---------------------------------------------------------------------------

/** Checks if a specific feature is available on the current plan. */
export function hasFeature(license: LicenseCache, feature: string): boolean {
	const plan = PLANS[license.plan];
	if (!plan) return false;
	return plan.features.includes(feature);
}

/** Returns the current plan ID. */
export function getPlan(license: LicenseCache): PlanId {
	return license.plan;
}

/** Returns the maximum allowed date range in days for the current plan. */
export function getMaxDateRange(license: LicenseCache): number {
	const plan = PLANS[license.plan];
	return plan?.maxDateRange ?? DEFAULT_RETENTION_DAYS;
}

/** Returns the maximum retention days for the current plan. */
export function getMaxRetentionDays(license: LicenseCache): number {
	const plan = PLANS[license.plan];
	return plan?.maxRetentionDays ?? DEFAULT_RETENTION_DAYS;
}

// ---------------------------------------------------------------------------
// Convenience feature checks
// ---------------------------------------------------------------------------

export function canViewEventProperties(license: LicenseCache): boolean {
	return hasFeature(license, "custom_events_property_breakdowns");
}

export function canViewEventTrends(license: LicenseCache): boolean {
	return hasFeature(license, "custom_events_trends");
}

export function canViewFunnels(license: LicenseCache): boolean {
	return hasFeature(license, "custom_events_funnels");
}

export function canViewUtmTermContent(license: LicenseCache): boolean {
	return hasFeature(license, "utm_term_content");
}

export function canViewCampaignIntelligence(license: LicenseCache): boolean {
	return hasFeature(license, "utm_campaign_comparison");
}

export function canExport(license: LicenseCache): boolean {
	return hasFeature(license, "export");
}

export function canViewCountries(license: LicenseCache): boolean {
	return hasFeature(license, "countries");
}

export function canComparePeriods(license: LicenseCache): boolean {
	return hasFeature(license, "period_comparison");
}

export function canUseAdvancedSegments(license: LicenseCache): boolean {
	return hasFeature(license, "advanced_segments");
}

export function isFreePlan(license: LicenseCache): boolean {
	return license.plan === "free";
}

/** Whether the license is in grace period (validation failed but not expired yet). */
export function isInGracePeriod(license: LicenseCache): boolean {
	return !!license.graceEndsAt && new Date(license.graceEndsAt) > new Date();
}

// ---------------------------------------------------------------------------
// Error reporting
// ---------------------------------------------------------------------------

function report(error: unknown): void {
	if (error instanceof Error) {
		console.error(`[analytics-hub:license] ${error.message}`, error.stack);
	} else {
		console.error("[analytics-hub:license] Unknown error", error);
	}
}
