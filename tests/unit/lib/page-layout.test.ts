import { computePageLayouts, findPageAtY } from "@/lib/page-layout.ts";
import { describe, expect, it } from "vitest";

describe("computePageLayouts", () => {
	it("computes correct Y positions with 16px gaps", () => {
		const pages = [
			{ width: 400, height: 500 },
			{ width: 400, height: 600 },
			{ width: 400, height: 500 },
		];
		const layouts = computePageLayouts(pages);

		expect(layouts).toEqual([
			{ pageIndex: 0, top: 0, width: 400, height: 500 },
			{ pageIndex: 1, top: 516, width: 400, height: 600 },
			{ pageIndex: 2, top: 1132, width: 400, height: 500 },
		]);
	});

	it("returns empty array for no pages", () => {
		expect(computePageLayouts([])).toEqual([]);
	});
});

describe("findPageAtY", () => {
	const layouts = computePageLayouts([
		{ width: 400, height: 500 },
		{ width: 400, height: 600 },
		{ width: 400, height: 500 },
	]);

	it("finds the correct page for a Y inside it", () => {
		expect(findPageAtY(layouts, 250)).toBe(0);
		expect(findPageAtY(layouts, 700)).toBe(1);
		expect(findPageAtY(layouts, 1300)).toBe(2);
	});

	it("returns nearest page for Y in a gap", () => {
		// Gap between page 0 (ends at 500) and page 1 (starts at 516)
		// Y=508 is in the gap, equidistant: 8 from page 0 end, 8 from page 1 start
		const result = findPageAtY(layouts, 508);
		expect([0, 1]).toContain(result);
	});

	it("returns first page for Y before first page", () => {
		expect(findPageAtY(layouts, -100)).toBe(0);
	});

	it("returns last page for Y after last page", () => {
		expect(findPageAtY(layouts, 9999)).toBe(2);
	});
});
