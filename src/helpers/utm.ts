// ---------------------------------------------------------------------------
// UTM parameter utilities
// ---------------------------------------------------------------------------

/** Standard UTM parameters extracted from URL query strings. */
export interface UtmParams {
	utmSource: string;
	utmMedium: string;
	utmCampaign: string;
	utmTerm: string;
	utmContent: string;
}

/** Maximum length for any single UTM value. */
const MAX_UTM_LENGTH = 256;

/**
 * Sanitizes a UTM parameter value.
 * Trims whitespace, truncates to max length, and converts to lowercase.
 */
function sanitizeUtmValue(value: string | undefined | null): string {
	if (!value) return "";
	return value.trim().toLowerCase().slice(0, MAX_UTM_LENGTH);
}

/**
 * Extracts UTM parameters from beacon payload fields.
 * The beacon script reads UTM params from the URL and sends them
 * as compact fields (us, um, uc).
 */
export function extractUtmFromPayload(payload: {
	us?: string;
	um?: string;
	uc?: string;
}): Pick<UtmParams, "utmSource" | "utmMedium" | "utmCampaign"> {
	return {
		utmSource: sanitizeUtmValue(payload.us),
		utmMedium: sanitizeUtmValue(payload.um),
		utmCampaign: sanitizeUtmValue(payload.uc),
	};
}

/**
 * Checks if any UTM parameter is present in the extracted data.
 */
export function hasUtmData(utm: Pick<UtmParams, "utmSource" | "utmMedium" | "utmCampaign">): boolean {
	return !!(utm.utmSource || utm.utmMedium || utm.utmCampaign);
}
