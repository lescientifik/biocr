import { postProcess } from "@/lib/post-processing.ts";
import { describe, expect, it } from "vitest";

describe("Post-processing — browser integration", () => {
	it("corrects typical OCR errors on medical text", () => {
		const raw = [
			"Glycémle 1O,5 g/l",
			"Cholestérol 2,l g/l",
			"Hémoglobine l4,2 g/dl",
			"CRP 4S mg/dl",
			"Créatlnine 85 µmol/l",
		].join("\n");

		const result = postProcess(raw);

		expect(result).toContain("Glycémie");
		expect(result).toContain("10,5 g/L");
		expect(result).toContain("Cholestérol");
		expect(result).toContain("g/L");
		expect(result).toContain("Hémoglobine");
		expect(result).toContain("g/dL");
		expect(result).toContain("45 mg/dL");
		expect(result).toContain("Créatinine");
		expect(result).toContain("µmol/L");
	});

	it("performance: postProcess on 500 lines < 100ms", () => {
		const lines = Array.from(
			{ length: 500 },
			(_, i) => `Glycémle ${i}O,5 g/l Cholestérol l2,3 mg/dl`,
		);
		const input = lines.join("\n");

		// Warm up cache
		postProcess("Glycémle 1O,5 g/l");

		const start = performance.now();
		const result = postProcess(input);
		const elapsed = performance.now() - start;

		expect(result.split("\n")).toHaveLength(500);
		expect(elapsed).toBeLessThan(100);
	});
});
