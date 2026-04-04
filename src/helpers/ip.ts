// ---------------------------------------------------------------------------
// Portable IP extraction
// ---------------------------------------------------------------------------

/**
 * Extracts the client IP address from request headers using a fallback chain:
 * 1. cf-connecting-ip (Cloudflare Workers)
 * 2. x-forwarded-for (reverse proxies — first IP in the chain)
 * 3. x-real-ip (Nginx/common proxies)
 * 4. "unknown" fallback
 *
 * Works on both Cloudflare and Node.js self-hosted environments.
 */
export function extractIp(headers: Headers): string {
	const cfIp = headers.get("cf-connecting-ip");
	if (cfIp) return cfIp.trim();

	const forwarded = headers.get("x-forwarded-for");
	if (forwarded) {
		const first = forwarded.split(",")[0];
		if (first) return first.trim();
	}

	const realIp = headers.get("x-real-ip");
	if (realIp) return realIp.trim();

	return "unknown";
}

/**
 * Extracts the country code from Cloudflare headers.
 * Returns empty string on non-Cloudflare environments.
 */
export function extractCountry(headers: Headers): string {
	return headers.get("cf-ipcountry") ?? "";
}
