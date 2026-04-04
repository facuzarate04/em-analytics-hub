// ---------------------------------------------------------------------------
// Date utilities
// ---------------------------------------------------------------------------

/** Returns today's date as YYYY-MM-DD. */
export function today(): string {
	return new Date().toISOString().slice(0, 10);
}

/** Returns current timestamp in ISO 8601 format. */
export function nowIso(): string {
	return new Date().toISOString();
}

/** Returns the date N days ago as YYYY-MM-DD. */
export function dateNDaysAgo(n: number): string {
	const d = new Date();
	d.setDate(d.getDate() - n);
	return d.toISOString().slice(0, 10);
}

/** Generates a unique event ID using timestamp + random suffix. */
export function eventId(): string {
	return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Generates a composite key for daily stats: `pathname:date`. */
export function statsId(pathname: string, date: string): string {
	return `${pathname}:${date}`;
}
