// ---------------------------------------------------------------------------
// Privacy utilities — IP hashing and bot detection
// ---------------------------------------------------------------------------

/**
 * Hashes an IP address with a daily-rotating salt using SHA-256.
 * Returns first 16 hex characters (8 bytes) for compact storage.
 * The daily rotation ensures visitors can't be cross-matched across days.
 */
export async function hashIp(ip: string, salt: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(ip + salt);
	const hash = await crypto.subtle.digest("SHA-256", data);
	const arr = new Uint8Array(hash);
	return Array.from(arr.slice(0, 8))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/** Known bot/crawler User-Agent patterns. */
const BOT_PATTERN =
	/bot|crawl|spider|slurp|mediapartners|facebookexternalhit|bingpreview|googleother|gptbot|bytespider|ahrefsbot|semrushbot|dotbot|mj12bot|yandexbot|baiduspider|duckduckbot|applebot|twitterbot|linkedinbot|pinterestbot|discordbot|telegrambot|whatsapp|petalbot|ccbot|chatgpt|claudebot|anthropic/i;

/** Returns true if the User-Agent matches a known bot pattern. */
export function isBot(ua: string): boolean {
	if (!ua) return false;
	return BOT_PATTERN.test(ua);
}

/**
 * Parses a referrer URL into a clean domain name.
 * Returns "direct" for empty/missing referrers, "other" for unparseable URLs.
 */
export function parseReferrerDomain(referrer: string): string {
	if (!referrer) return "direct";
	try {
		const hostname = new URL(referrer).hostname.replace(/^www\./, "");
		if (hostname === "localhost" || hostname === "127.0.0.1") return "same-site";
		return hostname;
	} catch {
		return "other";
	}
}
