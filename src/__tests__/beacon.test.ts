import { describe, it, expect } from "vitest";
import { generateBeaconScript } from "../beacon.js";

describe("generateBeaconScript", () => {
	const script = generateBeaconScript("/api/track");

	it("generates an IIFE", () => {
		expect(script).toMatch(/^\(function\(\)\{/);
		expect(script).toMatch(/\}\)\(\);$/);
	});

	it("respects DNT", () => {
		expect(script).toContain('navigator.doNotTrack==="1"');
	});

	it("includes the track URL", () => {
		expect(script).toContain("/api/track");
	});

	it("sends pageview on load", () => {
		expect(script).toContain('t:"pageview"');
	});

	it("reads UTM parameters from URL", () => {
		expect(script).toContain("utm_source");
		expect(script).toContain("utm_medium");
		expect(script).toContain("utm_campaign");
	});

	it("reads meta tags for template and collection", () => {
		expect(script).toContain("em:template");
		expect(script).toContain("em:collection");
	});

	it("exposes window.emAnalytics.track API", () => {
		expect(script).toContain("window.emAnalytics=");
		expect(script).toContain("track:function");
	});

	it("sends custom events", () => {
		expect(script).toContain('t:"custom"');
	});

	it("tracks scroll depth milestones", () => {
		expect(script).toContain('t:"scroll"');
		expect(script).toContain("d:25");
		expect(script).toContain("d:50");
		expect(script).toContain("d:75");
		expect(script).toContain("d:100");
	});

	it("tracks engaged views", () => {
		expect(script).toContain('t:"engaged"');
	});

	it("tracks recirculation clicks", () => {
		expect(script).toContain('t:"recirc"');
	});

	it("sends ping on page leave", () => {
		expect(script).toContain('t:"ping"');
		expect(script).toContain("pagehide");
		expect(script).toContain("beforeunload");
	});

	it("uses sendBeacon transport", () => {
		expect(script).toContain("navigator.sendBeacon");
	});

	it("caps attention time at 1800 seconds", () => {
		expect(script).toContain("1800");
	});
});
