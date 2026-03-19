import {
	classifyRegion,
	filterSmallRegions,
} from "@/lib/layout-detection/classify.ts";
import { describe, expect, it } from "vitest";

describe("classifyRegion", () => {
	const page = { width: 1000, height: 1000 };

	describe("header detection (top 15%)", () => {
		it("classifies a region at y=50 on a 1000px page as header", () => {
			const bbox = { x: 100, y: 50, width: 200, height: 30 };
			expect(classifyRegion(bbox, page, false, 0.5)).toBe("header");
		});

		it("classifies a region whose center is at y=149 as header (just under 15%)", () => {
			// center = y + height/2 = 149, which is < 150 (15% of 1000)
			const bbox = { x: 100, y: 139, width: 200, height: 20 };
			expect(classifyRegion(bbox, page, false, 0.5)).toBe("header");
		});

		it("classifies a region whose center is at y=151 as text (just above 15%)", () => {
			// center = y + height/2 = 151, which is > 150 (15% of 1000)
			const bbox = { x: 100, y: 141, width: 200, height: 20 };
			expect(classifyRegion(bbox, page, false, 0.5)).toBe("text");
		});
	});

	describe("footer detection (bottom 8%)", () => {
		it("classifies a region at y=921 on a 1000px page as footer", () => {
			// center = 921 + 30/2 = 936, which is > 920 (1000 * 0.92)
			const bbox = { x: 100, y: 921, width: 200, height: 30 };
			expect(classifyRegion(bbox, page, false, 0.5)).toBe("footer");
		});

		it("classifies a region whose center is at y=919 as text (just above footer limit)", () => {
			// center = y + height/2 = 919, which is < 920 (1000 * 0.92)
			const bbox = { x: 100, y: 909, width: 200, height: 20 };
			expect(classifyRegion(bbox, page, false, 0.5)).toBe("text");
		});
	});

	describe("table detection (grid intersections)", () => {
		it("classifies a region with grid intersections as table", () => {
			const bbox = { x: 100, y: 300, width: 400, height: 200 };
			expect(classifyRegion(bbox, page, true, 0.5)).toBe("table");
		});
	});

	describe("figure detection (low density)", () => {
		it("classifies a region with density 4.9% as figure", () => {
			const bbox = { x: 100, y: 300, width: 400, height: 200 };
			expect(classifyRegion(bbox, page, false, 0.049)).toBe("figure");
		});

		it("classifies a region with density 5.1% as text", () => {
			const bbox = { x: 100, y: 300, width: 400, height: 200 };
			expect(classifyRegion(bbox, page, false, 0.051)).toBe("text");
		});
	});

	describe("text fallback", () => {
		it("classifies a dense region outside header/footer as text", () => {
			const bbox = { x: 100, y: 300, width: 400, height: 200 };
			expect(classifyRegion(bbox, page, false, 0.5)).toBe("text");
		});
	});
});

describe("filterSmallRegions", () => {
	const pageArea = 100_000;

	it("filters out a region of 10px² (0.01% of page area)", () => {
		const bboxes = [{ x: 0, y: 0, width: 2, height: 5 }];
		expect(filterSmallRegions(bboxes, pageArea)).toEqual([]);
	});

	it("filters out a region of 499px² (0.499% — below 0.5% threshold)", () => {
		// 499 / 100000 = 0.00499 < 0.005
		const bboxes = [{ x: 0, y: 0, width: 499, height: 1 }];
		expect(filterSmallRegions(bboxes, pageArea)).toEqual([]);
	});

	it("keeps a region of 501px² (0.501% — above 0.5% threshold)", () => {
		// 501 / 100000 = 0.00501 >= 0.005
		const bboxes = [{ x: 0, y: 0, width: 501, height: 1 }];
		expect(filterSmallRegions(bboxes, pageArea)).toEqual(bboxes);
	});

	it("keeps regions at exactly the threshold (500px² = 0.5%)", () => {
		const bboxes = [{ x: 0, y: 0, width: 500, height: 1 }];
		expect(filterSmallRegions(bboxes, pageArea)).toEqual(bboxes);
	});
});
