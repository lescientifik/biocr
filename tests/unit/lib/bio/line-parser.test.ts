import { parseLine } from "@/lib/bio/line-parser";
import { describe, expect, it } from "vitest";

describe("Line parser", () => {
	it('parses standard format: "Glycémie 0.95 g/L"', () => {
		const result = parseLine("Glycémie 0.95 g/L");
		expect(result).not.toBeNull();
		expect(result?.param.name).toBe("Glycémie");
		expect(result?.value).toBeCloseTo(0.95);
		expect(result?.unit).toBe("g/L");
	});

	it("parses line with reference range", () => {
		const result = parseLine("Créatinine 78 µmol/L [60 - 110]");
		expect(result).not.toBeNull();
		expect(result?.param.name).toBe("Créatinine");
		expect(result?.value).toBe(78);
		expect(result?.unit).toBe("µmol/L");
	});

	it("parses line with colon separator", () => {
		const result = parseLine("Glycémie : 0.95 g/L");
		expect(result).not.toBeNull();
		expect(result?.param.name).toBe("Glycémie");
		expect(result?.value).toBeCloseTo(0.95);
		expect(result?.unit).toBe("g/L");
	});

	it("parses line with dot-leaders", () => {
		const result = parseLine("Glycémie ......... 0.95 g/L");
		expect(result).not.toBeNull();
		expect(result?.param.name).toBe("Glycémie");
		expect(result?.value).toBeCloseTo(0.95);
	});

	it("parses comma as decimal separator", () => {
		const result = parseLine("Glycémie 0,95 g/L");
		expect(result).not.toBeNull();
		expect(result?.value).toBeCloseTo(0.95);
	});

	it("parses abbreviation as parameter name", () => {
		const result = parseLine("Hb 13.5 g/dL");
		expect(result).not.toBeNull();
		expect(result?.param.name).toBe("Hémoglobine");
		expect(result?.value).toBeCloseTo(13.5);
		expect(result?.unit).toBe("g/dL");
	});

	it("returns null for non-result lines", () => {
		expect(parseLine("Laboratoire d'analyses médicales")).toBeNull();
		expect(parseLine("Date: 15/03/2024")).toBeNull();
		expect(parseLine("")).toBeNull();
	});

	it("handles percentage values", () => {
		const result = parseLine("Hématocrite 42.5 %");
		expect(result).not.toBeNull();
		expect(result?.param.name).toBe("Hématocrite");
		expect(result?.value).toBeCloseTo(42.5);
		expect(result?.unit).toBe("%");
	});

	it("handles multi-word parameter names", () => {
		const result = parseLine("Cholestérol total 2.10 g/L");
		expect(result).not.toBeNull();
		expect(result?.param.name).toBe("Cholestérol total");
		expect(result?.value).toBeCloseTo(2.1);
	});

	it("handles alias lookup", () => {
		const result = parseLine("Glucose 0.95 g/L");
		expect(result).not.toBeNull();
		expect(result?.param.name).toBe("Glycémie");
	});

	it("handles abbreviation PNN", () => {
		const result = parseLine("PNN 4.50 G/L");
		expect(result).not.toBeNull();
		expect(result?.param.name).toBe("Polynucléaires neutrophiles");
	});
});
