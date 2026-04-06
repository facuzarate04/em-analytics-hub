import { describe, it, expect } from "vitest";
import { isValidPayload, isExcludedPath, isExcludedIp, isBotRequest } from "../capture/filters.js";
import {
	normalizePathname,
	normalizeTemplate,
	normalizeCollection,
	normalizeSeconds,
	normalizeScrollDepth,
	normalizeEventName,
	normalizeEventProps,
	buildNormalizedEvent,
} from "../capture/enrich.js";
import { captureEvent } from "../capture/index.js";
import type { TrackPayload } from "../types.js";
import type { CaptureContext } from "../capture/types.js";

// ─── Filters ───────────────────────────────────────────────────────────────

describe("isValidPayload", () => {
	it("accepts a valid pageview payload", () => {
		expect(isValidPayload({ t: "pageview", p: "/blog" })).toBe(true);
	});

	it("accepts all valid event types", () => {
		const types = ["pageview", "scroll", "ping", "read", "engaged", "recirc", "custom"] as const;
		for (const t of types) {
			expect(isValidPayload({ t, p: "/" })).toBe(true);
		}
	});

	it("rejects missing type", () => {
		expect(isValidPayload({ t: "" as any, p: "/blog" })).toBe(false);
	});

	it("rejects missing pathname", () => {
		expect(isValidPayload({ t: "pageview", p: "" })).toBe(false);
	});

	it("rejects unknown event type", () => {
		expect(isValidPayload({ t: "unknown" as any, p: "/blog" })).toBe(false);
	});
});

describe("isBotRequest", () => {
	it("detects Googlebot", () => {
		expect(isBotRequest("Googlebot/2.1")).toBe(true);
	});

	it("detects GPTBot", () => {
		expect(isBotRequest("GPTBot/1.0")).toBe(true);
	});

	it("detects ClaudeBot", () => {
		expect(isBotRequest("ClaudeBot/1.0")).toBe(true);
	});

	it("allows Chrome browser", () => {
		expect(isBotRequest("Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome/120.0")).toBe(false);
	});

	it("handles empty UA", () => {
		expect(isBotRequest("")).toBe(false);
	});
});

describe("isExcludedPath", () => {
	it("excludes matching prefix", () => {
		expect(isExcludedPath("/_emdash/settings", "/_emdash/,/admin/")).toBe(true);
	});

	it("excludes admin paths", () => {
		expect(isExcludedPath("/admin/dashboard", "/_emdash/,/admin/")).toBe(true);
	});

	it("allows non-matching paths", () => {
		expect(isExcludedPath("/blog/post-1", "/_emdash/,/admin/")).toBe(false);
	});

	it("returns false for empty config", () => {
		expect(isExcludedPath("/anything", "")).toBe(false);
	});

	it("handles whitespace in config", () => {
		expect(isExcludedPath("/admin/x", " /admin/ , /test/ ")).toBe(true);
	});
});

describe("isExcludedIp", () => {
	it("excludes matching IP", () => {
		expect(isExcludedIp("1.2.3.4", "1.2.3.4,5.6.7.8")).toBe(true);
	});

	it("allows non-matching IP", () => {
		expect(isExcludedIp("9.9.9.9", "1.2.3.4,5.6.7.8")).toBe(false);
	});

	it("returns false for empty config", () => {
		expect(isExcludedIp("1.2.3.4", "")).toBe(false);
	});

	it("returns false for unknown IP", () => {
		expect(isExcludedIp("unknown", "1.2.3.4")).toBe(false);
	});

	it("handles whitespace in config", () => {
		expect(isExcludedIp("1.2.3.4", " 1.2.3.4 , 5.6.7.8 ")).toBe(true);
	});
});

// ─── Enrichment ────────────────────────────────────────────────────────────

describe("normalizePathname", () => {
	it("truncates to max length", () => {
		const long = "/".padEnd(3000, "x");
		expect(normalizePathname(long).length).toBe(2048);
	});

	it("keeps short paths unchanged", () => {
		expect(normalizePathname("/blog")).toBe("/blog");
	});
});

describe("normalizeTemplate", () => {
	it("returns empty for undefined", () => {
		expect(normalizeTemplate(undefined)).toBe("");
	});

	it("truncates to 256", () => {
		expect(normalizeTemplate("a".repeat(300)).length).toBe(256);
	});
});

describe("normalizeCollection", () => {
	it("returns empty for undefined", () => {
		expect(normalizeCollection(undefined)).toBe("");
	});

	it("truncates to 256", () => {
		expect(normalizeCollection("b".repeat(300)).length).toBe(256);
	});
});

describe("normalizeSeconds", () => {
	it("returns seconds for ping events", () => {
		expect(normalizeSeconds("ping", 120)).toBe(120);
	});

	it("caps at 1800", () => {
		expect(normalizeSeconds("ping", 5000)).toBe(1800);
	});

	it("returns 0 for non-ping events", () => {
		expect(normalizeSeconds("pageview", 120)).toBe(0);
	});

	it("defaults to 0 when undefined", () => {
		expect(normalizeSeconds("ping", undefined)).toBe(0);
	});
});

describe("normalizeScrollDepth", () => {
	it("returns depth for scroll events", () => {
		expect(normalizeScrollDepth("scroll", 75)).toBe(75);
	});

	it("returns 0 for non-scroll events", () => {
		expect(normalizeScrollDepth("pageview", 75)).toBe(0);
	});

	it("defaults to 0 when undefined", () => {
		expect(normalizeScrollDepth("scroll", undefined)).toBe(0);
	});
});

describe("normalizeEventName", () => {
	it("returns name for custom events", () => {
		expect(normalizeEventName("custom", "signup")).toBe("signup");
	});

	it("truncates long names", () => {
		expect(normalizeEventName("custom", "a".repeat(200)).length).toBe(100);
	});

	it("returns empty for non-custom events", () => {
		expect(normalizeEventName("pageview", "signup")).toBe("");
	});

	it("defaults to empty when undefined", () => {
		expect(normalizeEventName("custom", undefined)).toBe("");
	});
});

describe("normalizeEventProps", () => {
	it("returns sanitized JSON for custom events", () => {
		const input = JSON.stringify({ plan: "pro", count: 5 });
		const result = normalizeEventProps("custom", input);
		expect(JSON.parse(result)).toEqual({ plan: "pro", count: 5 });
	});

	it("truncates to max props", () => {
		const obj: Record<string, number> = {};
		for (let i = 0; i < 30; i++) obj[`key${i}`] = i;
		const result = normalizeEventProps("custom", JSON.stringify(obj));
		expect(Object.keys(JSON.parse(result)).length).toBe(20);
	});

	it("returns empty for invalid JSON", () => {
		expect(normalizeEventProps("custom", "not-json")).toBe("");
	});

	it("returns empty for non-custom events", () => {
		expect(normalizeEventProps("pageview", '{"a":1}')).toBe("");
	});

	it("returns empty for undefined", () => {
		expect(normalizeEventProps("custom", undefined)).toBe("");
	});

	it("returns empty for non-object JSON", () => {
		expect(normalizeEventProps("custom", '"just a string"')).toBe("");
	});
});

// ─── buildNormalizedEvent ──────────────────────────────────────────────────

describe("buildNormalizedEvent", () => {
	const basePayload: TrackPayload = {
		t: "pageview",
		p: "/blog/hello",
		r: "https://www.google.com/search",
		tpl: "post",
		col: "blog",
		us: "Twitter",
		um: "Social",
		uc: "Launch",
		ut: "Analytics",
		ux: "Banner",
	};

	const headers = new Headers({
		"cf-connecting-ip": "1.2.3.4",
		"cf-ipcountry": "AR",
		"user-agent": "Mozilla/5.0",
	});

	it("builds a complete normalized event", async () => {
		const ev = await buildNormalizedEvent(basePayload, headers, "test-salt");

		expect(ev.pathname).toBe("/blog/hello");
		expect(ev.type).toBe("pageview");
		expect(ev.referrer).toBe("google.com");
		expect(ev.visitorId).toMatch(/^[0-9a-f]{16}$/);
		expect(ev.country).toBe("AR");
		expect(ev.template).toBe("post");
		expect(ev.collection).toBe("blog");
		expect(ev.utmSource).toBe("twitter");
		expect(ev.utmMedium).toBe("social");
		expect(ev.utmCampaign).toBe("launch");
		expect(ev.utmTerm).toBe("analytics");
		expect(ev.utmContent).toBe("banner");
		expect(ev.seconds).toBe(0);
		expect(ev.scrollDepth).toBe(0);
		expect(ev.eventName).toBe("");
		expect(ev.eventProps).toBe("");
		expect(ev.createdAt).toBeTruthy();
	});

	it("normalizes referrer to direct when empty", async () => {
		const ev = await buildNormalizedEvent({ ...basePayload, r: undefined }, headers, "salt");
		expect(ev.referrer).toBe("direct");
	});

	it("sets seconds only for ping events", async () => {
		const ev = await buildNormalizedEvent({ ...basePayload, t: "ping", s: 300 }, headers, "salt");
		expect(ev.seconds).toBe(300);
	});

	it("sets scrollDepth only for scroll events", async () => {
		const ev = await buildNormalizedEvent({ ...basePayload, t: "scroll", d: 75 }, headers, "salt");
		expect(ev.scrollDepth).toBe(75);
	});
});

// ─── captureEvent pipeline ─────────────────────────────────────────────────

describe("captureEvent", () => {
	const defaultCtx: CaptureContext = {
		excludedPaths: "/_emdash/,/admin/",
		excludedIPs: "",
		salt: "test-salt",
	};

	const normalHeaders = new Headers({
		"user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome/120",
		"cf-connecting-ip": "1.2.3.4",
		"cf-ipcountry": "US",
	});

	it("accepts a valid pageview", async () => {
		const result = await captureEvent(
			{ t: "pageview", p: "/blog" },
			normalHeaders,
			defaultCtx,
		);
		expect(result.accepted).toBe(true);
		if (result.accepted) {
			expect(result.event.pathname).toBe("/blog");
			expect(result.event.type).toBe("pageview");
		}
	});

	it("rejects bots", async () => {
		const botHeaders = new Headers({
			"user-agent": "Googlebot/2.1",
			"cf-connecting-ip": "1.2.3.4",
		});
		const result = await captureEvent({ t: "pageview", p: "/" }, botHeaders, defaultCtx);
		expect(result).toEqual({ accepted: false, reason: "bot" });
	});

	it("rejects invalid payload", async () => {
		const result = await captureEvent(
			{ t: "unknown" as any, p: "/" },
			normalHeaders,
			defaultCtx,
		);
		expect(result).toEqual({ accepted: false, reason: "invalid" });
	});

	it("rejects excluded paths", async () => {
		const result = await captureEvent(
			{ t: "pageview", p: "/_emdash/settings" },
			normalHeaders,
			defaultCtx,
		);
		expect(result).toEqual({ accepted: false, reason: "excluded_path" });
	});

	it("rejects excluded IPs", async () => {
		const result = await captureEvent(
			{ t: "pageview", p: "/blog" },
			normalHeaders,
			{ ...defaultCtx, excludedIPs: "1.2.3.4" },
		);
		expect(result).toEqual({ accepted: false, reason: "excluded_ip" });
	});

	it("enriches visitor identity consistently", async () => {
		const r1 = await captureEvent({ t: "pageview", p: "/a" }, normalHeaders, defaultCtx);
		const r2 = await captureEvent({ t: "pageview", p: "/b" }, normalHeaders, defaultCtx);
		if (r1.accepted && r2.accepted) {
			expect(r1.event.visitorId).toBe(r2.event.visitorId);
		}
	});

	it("produces different visitor IDs with different salts", async () => {
		const r1 = await captureEvent({ t: "pageview", p: "/" }, normalHeaders, { ...defaultCtx, salt: "salt-1" });
		const r2 = await captureEvent({ t: "pageview", p: "/" }, normalHeaders, { ...defaultCtx, salt: "salt-2" });
		if (r1.accepted && r2.accepted) {
			expect(r1.event.visitorId).not.toBe(r2.event.visitorId);
		}
	});

	it("enriches UTM fields from payload", async () => {
		const result = await captureEvent(
			{ t: "pageview", p: "/", us: "Newsletter", um: "Email", uc: "Spring" },
			normalHeaders,
			defaultCtx,
		);
		if (result.accepted) {
			expect(result.event.utmSource).toBe("newsletter");
			expect(result.event.utmMedium).toBe("email");
			expect(result.event.utmCampaign).toBe("spring");
		}
	});

	it("normalizes referrer", async () => {
		const result = await captureEvent(
			{ t: "pageview", p: "/", r: "https://www.twitter.com/post/123" },
			normalHeaders,
			defaultCtx,
		);
		if (result.accepted) {
			expect(result.event.referrer).toBe("twitter.com");
		}
	});

	it("handles custom event with props", async () => {
		const props = JSON.stringify({ plan: "pro" });
		const result = await captureEvent(
			{ t: "custom", p: "/pricing", n: "signup", pr: props },
			normalHeaders,
			defaultCtx,
		);
		if (result.accepted) {
			expect(result.event.eventName).toBe("signup");
			expect(JSON.parse(result.event.eventProps)).toEqual({ plan: "pro" });
		}
	});
});
