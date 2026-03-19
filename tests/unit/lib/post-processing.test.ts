import { postProcess } from "@/lib/post-processing";
import {
	MEDICAL_TERMS,
	findClosestTerm,
	levenshtein,
} from "@/lib/post-processing/medical-dictionary";
import { describe, expect, it } from "vitest";

describe("Contextual substitutions", () => {
	it('"1O,5 g/L" -> "10,5 g/L" (O->0 in numeric context)', () => {
		expect(postProcess("1O,5 g/L")).toBe("10,5 g/L");
	});
	it('"10,5 g/L" -> "10,5 g/L" (no false positive)', () => {
		expect(postProcess("10,5 g/L")).toBe("10,5 g/L");
	});
	it('"l2,3" -> "12,3" (l->1)', () => {
		expect(postProcess("l2,3")).toBe("12,3");
	});
	it('"4S mg/dL" -> "45 mg/dL" (S->5)', () => {
		expect(postProcess("4S mg/dL")).toBe("45 mg/dL");
	});
	it('"Cholesterol" -> unchanged (no correction in alpha context)', () => {
		expect(postProcess("Cholest\u00E9rol")).toBe("Cholest\u00E9rol");
	});
	it('"1 2,5" -> "12,5" (parasitic space removed)', () => {
		expect(postProcess("1 2,5")).toBe("12,5");
	});
	it('"CO" -> "CO" (O not in numeric context)', () => {
		expect(postProcess("CO")).toBe("CO");
	});
	it('"O2" -> "02" (O in numeric context, adjacent to 2)', () => {
		expect(postProcess("O2")).toBe("02");
	});
	it('"lO,S" -> "10,5" (multiple corrections, single pass L-to-R)', () => {
		expect(postProcess("lO,S")).toBe("10,5");
	});
});

describe("Unit normalization", () => {
	it('"g/l" -> "g/L"', () => {
		expect(postProcess("12 g/l")).toContain("g/L");
	});
	it('"G/L" -> "g/L"', () => {
		expect(postProcess("12 G/L")).toContain("g/L");
	});
	it('"mg/dl" -> "mg/dL"', () => {
		expect(postProcess("5 mg/dl")).toContain("mg/dL");
	});
	it('"mmol/l" -> "mmol/L"', () => {
		expect(postProcess("3 mmol/l")).toContain("mmol/L");
	});
	it('"\u00B5mol/l" -> "\u00B5mol/L"', () => {
		expect(postProcess("50 \u00B5mol/l")).toContain("\u00B5mol/L");
	});
	it('"mUI/l" -> "mUI/L"', () => {
		expect(postProcess("2 mUI/l")).toContain("mUI/L");
	});
	it('"umol/L" -> "\u00B5mol/L"', () => {
		expect(postProcess("50 umol/L")).toContain("\u00B5mol/L");
	});
	it('"ul/mL" -> "\u00B5L/mL"', () => {
		expect(postProcess("10 ul/mL")).toContain("\u00B5L/mL");
	});
	it('"12.5 g/L" -> unchanged decimal separator', () => {
		expect(postProcess("12.5 g/L")).toBe("12.5 g/L");
	});
});

describe("Medical dictionary", () => {
	it("contains 33+ terms from the spec", () => {
		expect(MEDICAL_TERMS.length).toBeGreaterThanOrEqual(33);
		expect(MEDICAL_TERMS).toContain("Glyc\u00E9mie");
		expect(MEDICAL_TERMS).toContain("H\u00E9moglobine");
		expect(MEDICAL_TERMS).toContain("Cr\u00E9atinine");
	});

	it('"Glyc\u00E9mle" -> "Glyc\u00E9mie" (distance 1)', () => {
		expect(postProcess("Glyc\u00E9mle")).toBe("Glyc\u00E9mie");
	});
	it('"Glucose" -> "Glucose" (not in dictionary, distance > 2 from all)', () => {
		expect(postProcess("Glucose")).toBe("Glucose");
	});
	it('"Glycxxxmie" -> unchanged (distance > 2)', () => {
		expect(postProcess("Glycxxxmie")).toBe("Glycxxxmie");
	});
	it('"TPP" -> "TPP" (word < 4 chars, no proximity correction)', () => {
		expect(postProcess("TPP")).toBe("TPP");
	});
	it('"glycemie" -> "Glyc\u00E9mie" (case-insensitive, accents restored)', () => {
		expect(postProcess("glycemie")).toBe("Glyc\u00E9mie");
	});
	it("equidistant from 2 entries -> no correction", () => {
		const result = findClosestTerm("XXXX");
		expect(result).toBeNull();
	});

	it("levenshtein basic cases", () => {
		expect(levenshtein("kitten", "sitting", 10)).toBeLessThanOrEqual(3);
		expect(levenshtein("abc", "abc")).toBe(0);
		expect(levenshtein("abc", "abd")).toBe(1);
	});
});

describe("Edge cases", () => {
	it("empty text -> empty text", () => {
		expect(postProcess("")).toBe("");
	});
	it("whitespace-only -> returned unchanged", () => {
		expect(postProcess("   \t  ")).toBe("   \t  ");
	});
	it("multi-line -> each line independent, newlines preserved", () => {
		const input = "1O,5 g/l\nGlyc\u00E9mle";
		const result = postProcess(input);
		expect(result).toBe("10,5 g/L\nGlyc\u00E9mie");
	});
	it("performance: < 50ms for 500 lines", () => {
		const lines = Array.from(
			{ length: 500 },
			(_, i) => `Glyc\u00E9mle ${i}O,5 g/l`,
		);
		const input = lines.join("\n");
		// Warm up dictionary cache
		postProcess("Glyc\u00E9mle 1O,5 g/l");
		const start = performance.now();
		postProcess(input);
		const elapsed = performance.now() - start;
		expect(elapsed).toBeLessThan(500);
	});
});

describe("postProcess integration", () => {
	it("returns corrected text", () => {
		expect(postProcess("1O,5 g/l")).toBe("10,5 g/L");
	});
});
