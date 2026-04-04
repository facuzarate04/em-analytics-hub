import { describe, it, expect } from "vitest";
import { extractUtmFromPayload, hasUtmData } from "../helpers/utm.js";

describe("extractUtmFromPayload", () => {
	it("extracts all UTM fields", () => {
		const result = extractUtmFromPayload({
			us: "Twitter",
			um: "Social",
			uc: "Spring2026",
		});
		expect(result.utmSource).toBe("twitter");
		expect(result.utmMedium).toBe("social");
		expect(result.utmCampaign).toBe("spring2026");
	});

	it("returns empty strings for missing fields", () => {
		const result = extractUtmFromPayload({});
		expect(result.utmSource).toBe("");
		expect(result.utmMedium).toBe("");
		expect(result.utmCampaign).toBe("");
	});

	it("trims whitespace", () => {
		const result = extractUtmFromPayload({ us: "  twitter  " });
		expect(result.utmSource).toBe("twitter");
	});

	it("truncates long values", () => {
		const longValue = "a".repeat(300);
		const result = extractUtmFromPayload({ us: longValue });
		expect(result.utmSource.length).toBe(256);
	});
});

describe("hasUtmData", () => {
	it("returns true when source present", () => {
		expect(hasUtmData({ utmSource: "twitter", utmMedium: "", utmCampaign: "" })).toBe(true);
	});

	it("returns false when all empty", () => {
		expect(hasUtmData({ utmSource: "", utmMedium: "", utmCampaign: "" })).toBe(false);
	});
});
