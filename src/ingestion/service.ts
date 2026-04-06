import type { NormalizedEvent } from "../capture/types.js";
import type { AnalyticsIngestionBackend, IngestionStorage } from "./types.js";

export async function ingestEvent(
	backend: AnalyticsIngestionBackend,
	event: NormalizedEvent,
	storage: IngestionStorage,
): Promise<void> {
	await backend.ingest(event, storage);
}
