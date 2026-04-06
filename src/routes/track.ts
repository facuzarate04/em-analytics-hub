// ---------------------------------------------------------------------------
// POST /track — Public beacon endpoint
// ---------------------------------------------------------------------------

import { randomUUID } from "node:crypto";
import type { PluginContext } from "emdash";
import type { TrackPayload } from "../types.js";
import { KV_KEYS } from "../constants.js";
import { captureEvent } from "../capture/index.js";
import { ingestEvent } from "../ingestion/service.js";
import type { IngestionStorage } from "../ingestion/types.js";
import { PortableIngestionBackend } from "../backends/portable/ingestion.js";

const backend = new PortableIngestionBackend();

export async function handleTrack(
	routeCtx: { request: Request; input?: unknown },
	ctx: PluginContext,
): Promise<Record<string, unknown>> {
	const request = routeCtx.request;
	const payload = (routeCtx.input ?? {}) as TrackPayload;

	const excludedPaths = (await ctx.kv.get<string>(KV_KEYS.SETTINGS_EXCLUDED_PATHS)) ?? "/_emdash/,/admin/";
	const excludedIPs = (await ctx.kv.get<string>(KV_KEYS.SETTINGS_EXCLUDED_IPS)) ?? "";

	let salt = await ctx.kv.get<string>(KV_KEYS.DAILY_SALT);
	if (!salt) {
		salt = randomUUID();
		await ctx.kv.set(KV_KEYS.DAILY_SALT, salt);
	}

	const result = await captureEvent(payload, request.headers, {
		excludedPaths,
		excludedIPs,
		salt,
	});

	if (!result.accepted) {
		return result.reason === "invalid" ? { error: "Bad request" } : { ok: true };
	}

	const storage: IngestionStorage = {
		events: ctx.storage.events as IngestionStorage["events"],
		daily_stats: ctx.storage.daily_stats as IngestionStorage["daily_stats"],
		custom_events: ctx.storage.custom_events as IngestionStorage["custom_events"],
	};

	await ingestEvent(backend, result.event, storage);

	return { ok: true };
}
