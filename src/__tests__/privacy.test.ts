import { describe, it, expect } from "vitest";
import { hashIp } from "../helpers/privacy.js";

describe("hashIp", () => {
	it("produces a 16-character hex string", async () => {
		const result = await hashIp("1.2.3.4", "test-salt");
		expect(result).toMatch(/^[0-9a-f]{16}$/);
	});

	it("produces different hashes for different IPs", async () => {
		const hash1 = await hashIp("1.2.3.4", "salt");
		const hash2 = await hashIp("5.6.7.8", "salt");
		expect(hash1).not.toBe(hash2);
	});

	it("produces different hashes for different salts", async () => {
		const hash1 = await hashIp("1.2.3.4", "salt-day1");
		const hash2 = await hashIp("1.2.3.4", "salt-day2");
		expect(hash1).not.toBe(hash2);
	});

	it("produces same hash for same IP + salt", async () => {
		const hash1 = await hashIp("1.2.3.4", "same-salt");
		const hash2 = await hashIp("1.2.3.4", "same-salt");
		expect(hash1).toBe(hash2);
	});
});
