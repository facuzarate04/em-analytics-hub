// ---------------------------------------------------------------------------
// em-analytics-hub — Plugin runtime (sandbox entry)
// ---------------------------------------------------------------------------
//
// This file is the thin wiring layer that connects all modules to the EmDash
// plugin system. It registers hooks, routes, and delegates to specialized
// handlers in the routes/, admin/, storage/, and helpers/ directories.
//

import { definePlugin } from "emdash";
import type { PluginContext, RouteContext } from "emdash";
import { generateBeaconScript } from "./beacon.js";
import { dateNDaysAgo } from "./helpers/date.js";
import { KV_KEYS, CRON_JOBS } from "./constants.js";
import {
	getLicense,
	saveLicense,
	getMaxRetentionDays,
	activateLicense,
	validateLicense,
	deactivateLicense,
	FREE_LICENSE,
} from "./license/features.js";
import { LemonSqueezyProvider } from "./license/providers/lemon-squeezy.js";
import { pruneOlderThan } from "./storage/queries.js";
import { handleTrack } from "./routes/track.js";
import { handleStats } from "./routes/stats.js";
import { handleTopPages } from "./routes/top-pages.js";
import { handleReferrers } from "./routes/referrers.js";
import { handleCampaigns } from "./routes/campaigns.js";
import { handleAdmin } from "./routes/admin.js";

// ─── License Provider (v1: Lemon Squeezy direct) ───────────────────────────

const licenseProvider = new LemonSqueezyProvider();

// ─── Plugin Definition ──────────────────────────────────────────────────────

export default definePlugin({
	hooks: {
		// ── Lifecycle ────────────────────────────────────────────────

		"plugin:install": {
			handler: async (_event: unknown, ctx: PluginContext) => {
				const salt = crypto.randomUUID();
				await ctx.kv.set(KV_KEYS.DAILY_SALT, salt);
				await saveLicense(ctx.kv, FREE_LICENSE);
			},
		},

		"plugin:activate": {
			handler: async (_event: unknown, ctx: PluginContext) => {
				if (ctx.cron) {
					await ctx.cron.schedule(CRON_JOBS.ROTATE_SALT, {
						schedule: "0 0 * * *",
					});
					await ctx.cron.schedule(CRON_JOBS.PRUNE_EVENTS, {
						schedule: "0 3 * * *",
					});
					await ctx.cron.schedule(CRON_JOBS.VALIDATE_LICENSE, {
						schedule: "0 6 * * *",
					});
				}

				// If a license key is already configured, try to activate it
				try {
					const licenseKey = await ctx.kv.get<string>(KV_KEYS.SETTINGS_LICENSE_KEY);
					if (licenseKey) {
						const siteUrl = ctx.site?.url ?? ctx.url?.("/") ?? "unknown";
						await activateLicense(ctx.kv, licenseProvider, licenseKey, siteUrl);
					}
				} catch (error) {
					report(error);
				}
			},
		},

		"plugin:deactivate": {
			handler: async (_event: unknown, ctx: PluginContext) => {
				if (ctx.cron) {
					await ctx.cron.cancel(CRON_JOBS.ROTATE_SALT);
					await ctx.cron.cancel(CRON_JOBS.PRUNE_EVENTS);
					await ctx.cron.cancel(CRON_JOBS.VALIDATE_LICENSE);
				}
			},
		},

		// ── Cron Jobs ────────────────────────────────────────────────

		cron: {
			handler: async (event: { name: string }, ctx: PluginContext) => {
				if (event.name === CRON_JOBS.ROTATE_SALT) {
					const salt = crypto.randomUUID();
					await ctx.kv.set(KV_KEYS.DAILY_SALT, salt);
				}

				if (event.name === CRON_JOBS.PRUNE_EVENTS) {
					try {
						const license = await getLicense(ctx.kv);
						const retentionDays = getMaxRetentionDays(license);
						const cutoff = dateNDaysAgo(retentionDays);

						const prunedEvents = await pruneOlderThan(
							ctx.storage.events as any,
							"createdAt",
							cutoff,
						);

						const prunedCustom = await pruneOlderThan(
							ctx.storage.custom_events as any,
							"createdAt",
							cutoff,
						);

						if (prunedEvents > 0 || prunedCustom > 0) {
							ctx.log.info(
								`Pruned ${prunedEvents} events and ${prunedCustom} custom events older than ${cutoff}`,
							);
						}
					} catch (error) {
						report(error);
					}
				}

				if (event.name === CRON_JOBS.VALIDATE_LICENSE) {
					try {
						await validateLicense(ctx.kv, licenseProvider);
					} catch (error) {
						report(error);
					}
				}
			},
		},

		// ── Page Injection ───────────────────────────────────────────

		"page:fragments": {
			errorPolicy: "continue" as const,
			handler: async (_event: unknown, _ctx: PluginContext) => {
				return [
					{
						kind: "inline-script",
						placement: "body:end",
						code: generateBeaconScript(
							"/_emdash/api/plugins/analytics-hub/track",
						),
						key: "analytics-hub-beacon",
					},
				];
			},
		},
	},

	// ── Routes ───────────────────────────────────────────────────────────────

	routes: {
		"beacon.js": {
			public: true,
			handler: async (_routeCtx: RouteContext, _ctx: PluginContext) => {
				const script = generateBeaconScript(
					"/_emdash/api/plugins/analytics-hub/track",
				);
				return new Response(script, {
					headers: {
						"Content-Type": "application/javascript; charset=utf-8",
						"Cache-Control": "public, max-age=3600",
					},
				});
			},
		},

		track: {
			public: true,
			handler: handleTrack as any,
		},

		stats: {
			handler: handleStats as any,
		},

		"top-pages": {
			handler: handleTopPages as any,
		},

		referrers: {
			handler: handleReferrers as any,
		},

		campaigns: {
			handler: handleCampaigns as any,
		},

		admin: {
			handler: handleAdmin as any,
		},
	},
});

// ── Error reporting helper ───────────────────────────────────────────────────

function report(error: unknown): void {
	if (error instanceof Error) {
		console.error(`[analytics-hub] ${error.message}`, error.stack);
	} else {
		console.error("[analytics-hub] Unknown error", error);
	}
}
