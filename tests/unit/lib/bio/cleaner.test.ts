import { cleanOcrText } from "@/lib/bio/cleaner";
import { describe, expect, it } from "vitest";

describe("OCR text cleaner", () => {
	it("strips leading and trailing whitespace from each line", () => {
		const input = "  Glycémie   0.95 g/L  \n  Créatinine  78 µmol/L  ";
		const result = cleanOcrText(input);
		const lines = result.split("\n");
		for (const line of lines) {
			expect(line).toBe(line.trim());
		}
	});

	it("removes empty lines", () => {
		const input = "Glycémie 0.95 g/L\n\n\n\nCréatinine 78 µmol/L";
		const result = cleanOcrText(input);
		const lines = result.split("\n");
		expect(lines).toHaveLength(2);
	});

	it("removes pipe characters (table borders)", () => {
		const input = "| Glycémie | 0.95 | g/L |";
		const result = cleanOcrText(input);
		expect(result).not.toContain("|");
		expect(result).toContain("Glycémie");
		expect(result).toContain("0.95");
	});

	it("removes tilde characters", () => {
		const input = "Glycémie ~ 0.95 g/L";
		const result = cleanOcrText(input);
		expect(result).not.toContain("~");
	});

	it("removes separator lines (dashes, underscores)", () => {
		const input = "Glycémie 0.95 g/L\n-----------\nCréatinine 78 µmol/L";
		const result = cleanOcrText(input);
		expect(result.split("\n")).toHaveLength(2);
	});

	it("collapses multiple spaces into one", () => {
		const input = "Glycémie     0.95     g/L";
		const result = cleanOcrText(input);
		expect(result).toBe("Glycémie 0.95 g/L");
	});

	it("preserves meaningful content", () => {
		const input = "Glycémie 0.95 g/L [0.70 - 1.10]";
		const result = cleanOcrText(input);
		expect(result).toContain("Glycémie");
		expect(result).toContain("0.95");
		expect(result).toContain("g/L");
	});

	it("returns empty string for empty input", () => {
		expect(cleanOcrText("")).toBe("");
		expect(cleanOcrText("   \n  \n  ")).toBe("");
	});
});
