import { describe, it, expect } from "vitest";
import { today, dateNDaysAgo, eventId, statsId } from "../helpers/date.js";
import { formatDuration, formatNumber, formatPercent, calculateTrend } from "../helpers/format.js";
import { parseReferrerDomain, isBot } from "../helpers/privacy.js";
import { extractIp, extractCountry } from "../helpers/ip.js";

// ─── Date Helpers ───────────────────────────────────────────────────────────

describe("today", () => {
	it("returns YYYY-MM-DD format", () => {
		expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});
});

describe("dateNDaysAgo", () => {
	it("returns a date N days in the past", () => {
		const result = dateNDaysAgo(7);
		expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		const diff = new Date(today()).getTime() - new Date(result).getTime();
		expect(Math.round(diff / (1000 * 60 * 60 * 24))).toBe(7);
	});
});

describe("eventId", () => {
	it("generates unique IDs", () => {
		const id1 = eventId();
		const id2 = eventId();
		expect(id1).not.toBe(id2);
	});

	it("contains timestamp and random suffix", () => {
		const id = eventId();
		expect(id).toMatch(/^\d+-[a-z0-9]+$/);
	});
});

describe("statsId", () => {
	it("creates composite key", () => {
		expect(statsId("/blog/post", "2026-04-03")).toBe("/blog/post:2026-04-03");
	});
});

// ─── Format Helpers ─────────────────────────────────────────────────────────

describe("formatDuration", () => {
	it("formats seconds only", () => {
		expect(formatDuration(45)).toBe("45s");
	});

	it("formats minutes and seconds", () => {
		expect(formatDuration(125)).toBe("2m 5s");
	});

	it("handles zero", () => {
		expect(formatDuration(0)).toBe("0s");
	});
});

describe("formatNumber", () => {
	it("returns plain number under 1000", () => {
		expect(formatNumber(999)).toBe("999");
	});

	it("formats thousands", () => {
		expect(formatNumber(1500)).toBe("1.5K");
	});

	it("formats millions", () => {
		expect(formatNumber(2500000)).toBe("2.5M");
	});
});

describe("formatPercent", () => {
	it("converts ratio to percentage", () => {
		expect(formatPercent(0.456)).toBe("46%");
	});
});

describe("calculateTrend", () => {
	it("returns +100% for new data", () => {
		const result = calculateTrend(100, 0);
		expect(result.trend).toBe("+100%");
		expect(result.trend_direction).toBe("up");
	});

	it("returns flat for no change", () => {
		const result = calculateTrend(100, 100);
		expect(result.trend).toBe("0%");
		expect(result.trend_direction).toBe("flat");
	});

	it("returns negative for decrease", () => {
		const result = calculateTrend(50, 100);
		expect(result.trend).toBe("-50%");
		expect(result.trend_direction).toBe("down");
	});

	it("returns positive for increase", () => {
		const result = calculateTrend(150, 100);
		expect(result.trend).toBe("+50%");
		expect(result.trend_direction).toBe("up");
	});

	it("returns flat for zero to zero", () => {
		const result = calculateTrend(0, 0);
		expect(result.trend).toBe("0%");
		expect(result.trend_direction).toBe("flat");
	});
});

// ─── Privacy Helpers ────────────────────────────────────────────────────────

describe("parseReferrerDomain", () => {
	it("returns direct for empty referrer", () => {
		expect(parseReferrerDomain("")).toBe("direct");
	});

	it("extracts domain from URL", () => {
		expect(parseReferrerDomain("https://www.google.com/search?q=test")).toBe("google.com");
	});

	it("strips www prefix", () => {
		expect(parseReferrerDomain("https://www.example.com")).toBe("example.com");
	});

	it("returns same-site for localhost", () => {
		expect(parseReferrerDomain("http://localhost:3000/page")).toBe("same-site");
	});

	it("returns other for invalid URLs", () => {
		expect(parseReferrerDomain("not-a-url")).toBe("other");
	});
});

describe("isBot", () => {
	it("detects common bots", () => {
		expect(isBot("Googlebot/2.1")).toBe(true);
		expect(isBot("bingbot/2.0")).toBe(true);
		expect(isBot("AhrefsBot/7.0")).toBe(true);
		expect(isBot("GPTBot/1.0")).toBe(true);
		expect(isBot("ClaudeBot/1.0")).toBe(true);
	});

	it("allows normal browsers", () => {
		expect(isBot("Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36")).toBe(false);
	});

	it("handles empty User-Agent", () => {
		expect(isBot("")).toBe(false);
	});
});

// ─── IP Helpers ─────────────────────────────────────────────────────────────

describe("extractIp", () => {
	it("prefers cf-connecting-ip", () => {
		const headers = new Headers({
			"cf-connecting-ip": "1.2.3.4",
			"x-forwarded-for": "5.6.7.8",
		});
		expect(extractIp(headers)).toBe("1.2.3.4");
	});

	it("falls back to x-forwarded-for", () => {
		const headers = new Headers({
			"x-forwarded-for": "5.6.7.8, 9.10.11.12",
		});
		expect(extractIp(headers)).toBe("5.6.7.8");
	});

	it("falls back to x-real-ip", () => {
		const headers = new Headers({
			"x-real-ip": "13.14.15.16",
		});
		expect(extractIp(headers)).toBe("13.14.15.16");
	});

	it("returns unknown when no headers present", () => {
		const headers = new Headers();
		expect(extractIp(headers)).toBe("unknown");
	});
});

describe("extractCountry", () => {
	it("returns country from Cloudflare header", () => {
		const headers = new Headers({ "cf-ipcountry": "AR" });
		expect(extractCountry(headers)).toBe("AR");
	});

	it("returns empty string when header missing", () => {
		const headers = new Headers();
		expect(extractCountry(headers)).toBe("");
	});
});
