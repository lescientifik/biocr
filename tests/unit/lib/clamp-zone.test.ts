import { clampZoneToCanvas } from "@/lib/clamp-zone.ts";
import { describe, expect, it } from "vitest";

describe("clampZoneToCanvas", () => {
	it("clamps undersized dimensions to minimum 20x20", () => {
		const result = clampZoneToCanvas(
			{ left: 0, top: 0, width: 10, height: 10 },
			{ width: 800, height: 600 },
		);

		expect(result.width).toBe(20);
		expect(result.height).toBe(20);
	});

	it("clamps left when rect overflows canvas width", () => {
		const result = clampZoneToCanvas(
			{ left: 750, top: 0, width: 100, height: 80 },
			{ width: 800, height: 600 },
		);

		expect(result.left).toBe(700);
	});

	it("clamps negative positions to zero", () => {
		const result = clampZoneToCanvas(
			{ left: -10, top: -5, width: 50, height: 50 },
			{ width: 800, height: 600 },
		);

		expect(result.left).toBe(0);
		expect(result.top).toBe(0);
	});

	it("applies min-size clamp before boundary clamp", () => {
		const result = clampZoneToCanvas(
			{ left: 790, top: 590, width: 5, height: 5 },
			{ width: 800, height: 600 },
		);

		expect(result.left).toBe(780);
		expect(result.top).toBe(580);
		expect(result.width).toBe(20);
		expect(result.height).toBe(20);
	});

	it("returns the same values when rect is already valid", () => {
		const result = clampZoneToCanvas(
			{ left: 100, top: 100, width: 200, height: 150 },
			{ width: 800, height: 600 },
		);

		expect(result).toEqual({ left: 100, top: 100, width: 200, height: 150 });
	});
});
