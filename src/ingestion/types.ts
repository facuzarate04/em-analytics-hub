import type { NormalizedEvent } from "../capture/types.js";
import type { RawEvent, DailyStats, CustomEvent } from "../types.js";
import type { StorageCollection } from "../storage/queries.js";

export interface IngestionStorage {
	events: StorageCollection<RawEvent>;
	daily_stats: StorageCollection<DailyStats>;
	custom_events: StorageCollection<CustomEvent>;
}

export interface AnalyticsIngestionBackend {
	ingest(event: NormalizedEvent, storage: IngestionStorage): Promise<void>;
}
