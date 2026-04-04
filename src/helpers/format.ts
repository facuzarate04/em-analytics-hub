// ---------------------------------------------------------------------------
// Formatting utilities
// ---------------------------------------------------------------------------

/** Formats seconds into a human-readable duration (e.g. "2m 5s"). */
export function formatDuration(seconds: number): string {
	const m = Math.floor(seconds / 60);
	const s = Math.round(seconds % 60);
	return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/** Formats a number with K/M suffixes (e.g. 1500 → "1.5K"). */
export function formatNumber(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
	return n.toString();
}

/** Formats a percentage value (e.g. 0.456 → "46%"). */
export function formatPercent(ratio: number): string {
	return `${Math.round(ratio * 100)}%`;
}

/**
 * Calculates a trend between current and previous period values.
 * Returns a trend string and direction for display in stat cards.
 */
export function calculateTrend(
	current: number,
	previous: number,
): { trend: string; trend_direction: "up" | "down" | "flat" } {
	if (previous === 0) {
		return current > 0
			? { trend: "+100%", trend_direction: "up" }
			: { trend: "0%", trend_direction: "flat" };
	}
	const pct = Math.round(((current - previous) / previous) * 100);
	if (pct === 0) return { trend: "0%", trend_direction: "flat" };
	return {
		trend: `${pct > 0 ? "+" : ""}${pct}%`,
		trend_direction: pct > 0 ? "up" : "down",
	};
}
