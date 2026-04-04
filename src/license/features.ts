// ---------------------------------------------------------------------------
// License & feature gating
// ---------------------------------------------------------------------------

import type { LicenseCache, PlanId } from "../types.js";
import { PLANS, DEFAULT_RETENTION_DAYS } from "../constants.js";

/** Default free plan license cache. */
export const FREE_LICENSE: LicenseCache = {
	plan: "free",
	validUntil: "",
	checkedAt: "",
};

/**
 * Retrieves the current license from KV store, falling back to free plan.
 * Uses `data_get` pattern for safe access.
 */
export async function getLicense(kv: {
	get: <T>(key: string) => Promise<T | null | undefined>;
}): Promise<LicenseCache> {
	try {
		const cached = await kv.get<LicenseCache>("state:license_cache");
		if (cached) return cached;
	} catch {
		// KV read failed — fall back to free
	}
	return FREE_LICENSE;
}

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
// Convenience feature checks for common gating points
// ---------------------------------------------------------------------------

/** Whether custom event property breakdowns are available. */
export function canViewEventProperties(license: LicenseCache): boolean {
	return hasFeature(license, "custom_events_property_breakdowns");
}

/** Whether custom event trend charts are available (Free+). */
export function canViewEventTrends(license: LicenseCache): boolean {
	return hasFeature(license, "custom_events_trends");
}

/** Whether custom event funnels are available. */
export function canViewFunnels(license: LicenseCache): boolean {
	return hasFeature(license, "custom_events_funnels");
}

/** Whether UTM term/content fields are available. */
export function canViewUtmTermContent(license: LicenseCache): boolean {
	return hasFeature(license, "utm_term_content");
}

/** Whether campaign comparison / intelligence is available. */
export function canViewCampaignIntelligence(license: LicenseCache): boolean {
	return hasFeature(license, "utm_campaign_comparison");
}

/** Whether data export is available. */
export function canExport(license: LicenseCache): boolean {
	return hasFeature(license, "export");
}

/** Whether country breakdown is available. */
export function canViewCountries(license: LicenseCache): boolean {
	return hasFeature(license, "countries");
}

/** Whether period comparison is available. */
export function canComparePeriods(license: LicenseCache): boolean {
	return hasFeature(license, "period_comparison");
}

/** Whether advanced segments are available. */
export function canUseAdvancedSegments(license: LicenseCache): boolean {
	return hasFeature(license, "advanced_segments");
}

/** Returns true if the user is on the free plan. */
export function isFreePlan(license: LicenseCache): boolean {
	return license.plan === "free";
}
