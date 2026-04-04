// ---------------------------------------------------------------------------
// em-analytics-hub — Plugin descriptor
// ---------------------------------------------------------------------------

import type { PluginDescriptor } from "emdash";
import type { AnalyticsHubOptions } from "./types.js";
import { DEFAULT_EXCLUDED_PATHS } from "./constants.js";

/**
 * Creates the AnalyticsHub plugin descriptor for EmDash.
 *
 * @example
 * ```ts
 * // astro.config.mjs
 * import { analyticsHub } from "em-analytics-hub";
 *
 * export default defineConfig({
 *   integrations: [
 *     emdash({
 *       plugins: [analyticsHub()]
 *     })
 *   ]
 * });
 * ```
 */
export function analyticsHub(options?: AnalyticsHubOptions): PluginDescriptor {
	return {
		id: "analytics-hub",
		version: "0.1.0",
		format: "standard",
		entrypoint: "em-analytics-hub/sandbox",
		options: {
			excludedPaths: options?.excludedPaths ?? DEFAULT_EXCLUDED_PATHS,
		},
		capabilities: ["read:content", "network:fetch", "page:inject"],
		allowedHosts: ["api.lemonsqueezy.com"],
		storage: {
			events: {
				indexes: [
					"pathname",
					"type",
					"createdAt",
					"template",
					"collection",
					"utmSource",
					"utmCampaign",
					["pathname", "createdAt"] as unknown as string,
					["pathname", "type"] as unknown as string,
					["template", "createdAt"] as unknown as string,
					["collection", "createdAt"] as unknown as string,
				],
			},
			daily_stats: {
				indexes: [
					"pathname",
					"date",
					"template",
					"collection",
					["pathname", "date"] as unknown as string,
					["template", "date"] as unknown as string,
					["collection", "date"] as unknown as string,
				],
			},
			custom_events: {
				indexes: [
					"name",
					"pathname",
					"createdAt",
					["name", "createdAt"] as unknown as string,
					["name", "pathname"] as unknown as string,
				],
			},
		},
		adminPages: [
			{ path: "/analytics", label: "Analytics", icon: "bar-chart" },
		],
		adminWidgets: [
			{ id: "site-overview", title: "Site Overview", size: "full" },
		],
		admin: {
			settingsSchema: {
				excludedPaths: {
					type: "string",
					label: "Excluded Paths",
					description:
						"Comma-separated path prefixes to exclude from tracking (e.g. /_emdash/,/admin/)",
					default: DEFAULT_EXCLUDED_PATHS,
				},
				excludedIPs: {
					type: "string",
					label: "Excluded IPs",
					description:
						"Comma-separated IP addresses to filter out (e.g. your own IP for self-traffic filtering)",
					default: "",
				},
				retentionDays: {
					type: "number",
					label: "Data Retention (days)",
					description:
						"How long to keep raw event data. Free: 30 days. Pro: up to 365 days.",
					default: 30,
				},
			},
		},
	} as PluginDescriptor;
}
