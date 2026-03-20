import { extractBioResults } from "@/lib/bio/pipeline";
import { describe, expect, it } from "vitest";

describe("Bio extraction pipeline", () => {
	it("extracts multiple parameters from multi-line OCR text", () => {
		const input = `Glycémie 0.95 g/L
Créatinine 78 µmol/L
Hémoglobine 13.5 g/dL`;

		const results = extractBioResults(input);
		expect(results).toHaveLength(3);
		for (const r of results) {
			expect(r).toHaveProperty("name");
			expect(r).toHaveProperty("value");
			expect(r).toHaveProperty("unit");
			expect(r).toHaveProperty("flagged");
		}
		expect(results.every((r) => r.flagged === false)).toBe(true);
	});

	it("skips non-result lines", () => {
		const input = `Laboratoire XYZ
Glycémie 0.95 g/L
Date: 15/03/2024
Créatinine 78 µmol/L`;

		const results = extractBioResults(input);
		expect(results).toHaveLength(2);
		expect(results[0].name).toBe("Glycémie");
		expect(results[1].name).toBe("Créatinine");
	});

	it("flags implausible values", () => {
		const input = `Glycémie 150 g/L
Créatinine 78 µmol/L`;

		const results = extractBioResults(input);
		expect(results).toHaveLength(2);
		expect(results[0].name).toBe("Glycémie");
		expect(results[0].flagged).toBe(true);
		expect(results[1].name).toBe("Créatinine");
		expect(results[1].flagged).toBe(false);
	});

	it("handles empty input", () => {
		expect(extractBioResults("")).toHaveLength(0);
		expect(extractBioResults("  \n  ")).toHaveLength(0);
	});

	it("handles OCR artifacts in input", () => {
		const input = `| Glycémie | 0.95 | g/L |
-----------
| Créatinine | 78 | µmol/L |`;

		const results = extractBioResults(input);
		expect(results.length).toBeGreaterThanOrEqual(1);
	});

	it("output matches BioResult interface", () => {
		const results = extractBioResults("Glycémie 0.95 g/L");
		expect(results).toHaveLength(1);
		const r = results[0];
		expect(typeof r.name).toBe("string");
		expect(typeof r.value).toBe("number");
		expect(typeof r.unit).toBe("string");
		expect(typeof r.flagged).toBe("boolean");
	});

	it("handles comma decimal separator", () => {
		const results = extractBioResults("Glycémie 0,95 g/L");
		expect(results).toHaveLength(1);
		expect(results[0].value).toBeCloseTo(0.95);
	});

	it("handles reference ranges in input", () => {
		const input = "Glycémie 0.95 g/L [0.70 - 1.10]";
		const results = extractBioResults(input);
		expect(results).toHaveLength(1);
		expect(results[0].value).toBeCloseTo(0.95);
		expect(results[0].unit).toBe("g/L");
	});
});
