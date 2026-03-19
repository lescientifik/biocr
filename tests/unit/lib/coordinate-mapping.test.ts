import {
	assignZoneToPage,
	regionToZoneRect,
	zoneToOcrCrop,
} from "@/lib/coordinate-mapping.ts";
import type { Zone } from "@/lib/zone-manager.ts";
import type { PageLayout } from "@/types/index.ts";
import type { LayoutRegion } from "@/types/layout.ts";
import { describe, expect, it } from "vitest";

const layouts: PageLayout[] = [
	{ pageIndex: 0, top: 0, height: 500, width: 400 },
	{ pageIndex: 1, top: 516, height: 600, width: 400 },
	{ pageIndex: 2, top: 1132, height: 500, width: 400 },
];

describe("assignZoneToPage", () => {
	it("assigns zone to correct page based on center Y", () => {
		const zone: Zone = { id: 1, left: 50, top: 600, width: 100, height: 100 };
		// Center Y = 650, which is in page 1 (516-1116)
		expect(assignZoneToPage(zone, layouts)).toBe(1);
	});

	it("assigns zone in gap to nearest page", () => {
		// Gap between page 0 (ends at 500) and page 1 (starts at 516)
		const zone: Zone = { id: 1, left: 50, top: 500, width: 100, height: 12 };
		// Center Y = 506, closer to page 0 end (500) than page 1 start (516)
		expect(assignZoneToPage(zone, layouts)).toBe(0);
	});

	it("assigns zone entirely outside pages to nearest page", () => {
		const zone: Zone = { id: 1, left: 50, top: -100, width: 100, height: 50 };
		// Center Y = -75, before page 0
		expect(assignZoneToPage(zone, layouts)).toBe(0);
	});
});

describe("zoneToOcrCrop", () => {
	it("computes correct crop for image with known scale", () => {
		// pageW=500, naturalWidth=2500 → scaleFactor=5
		const page: PageLayout = {
			pageIndex: 0,
			top: 0,
			width: 500,
			height: 700,
		};
		const zone: Zone = { id: 1, left: 50, top: 50, width: 100, height: 100 };
		const crop = zoneToOcrCrop(zone, page, 5);

		expect(crop.x).toBe(250);
		expect(crop.y).toBe(250);
		expect(crop.width).toBe(500);
		expect(crop.height).toBe(500);
	});

	it("computes correct crop for PDF page", () => {
		// displayScale = 1.5, ocrScale = 4.17
		// ratio = ocrScale / displayScale ≈ 2.78
		const page: PageLayout = {
			pageIndex: 1,
			top: 516,
			width: 400,
			height: 600,
		};
		const zone: Zone = {
			id: 2,
			left: 100,
			top: 616,
			width: 200,
			height: 150,
		};
		const scaleFactor = 4.17 / 1.5; // ≈ 2.78

		const crop = zoneToOcrCrop(zone, page, scaleFactor);
		expect(crop.x).toBeCloseTo(278, 0);
		expect(crop.y).toBeCloseTo(278, 0); // (616-516) * 2.78
		expect(crop.width).toBeCloseTo(556, 0);
		expect(crop.height).toBeCloseTo(417, 0);
	});
});

describe("regionToZoneRect", () => {
	it("converts a bbox with page 500px wide, source 1000px", () => {
		const region: LayoutRegion = {
			type: "text",
			bbox: { x: 100, y: 200, width: 300, height: 400 },
			confidence: 0.9,
		};
		const page: PageLayout = {
			pageIndex: 0,
			top: 0,
			width: 500,
			height: 1000,
		};
		const sourceSize = { width: 1000, height: 2000 };

		const rect = regionToZoneRect(region, page, sourceSize);
		// scaleX = 500/1000 = 0.5, scaleY = 1000/2000 = 0.5
		expect(rect.left).toBe(50);
		expect(rect.width).toBe(150);
		expect(rect.top).toBe(100);
		expect(rect.height).toBe(200);
	});

	it("adds page.top to the Y of the zone", () => {
		const region: LayoutRegion = {
			type: "table",
			bbox: { x: 0, y: 100, width: 200, height: 50 },
			confidence: 0.8,
		};
		const page: PageLayout = {
			pageIndex: 1,
			top: 516,
			width: 400,
			height: 600,
		};
		const sourceSize = { width: 400, height: 600 };

		const rect = regionToZoneRect(region, page, sourceSize);
		// scaleX=1, scaleY=1 → top = 516 + 100 = 616
		expect(rect.top).toBe(616);
	});

	it("applies scaleX and scaleY independently", () => {
		const region: LayoutRegion = {
			type: "figure",
			bbox: { x: 200, y: 100, width: 400, height: 300 },
			confidence: 0.95,
		};
		const page: PageLayout = {
			pageIndex: 0,
			top: 0,
			width: 600,
			height: 900,
		};
		// Different aspect ratio source
		const sourceSize = { width: 1200, height: 900 };

		const rect = regionToZoneRect(region, page, sourceSize);
		// scaleX = 600/1200 = 0.5, scaleY = 900/900 = 1.0
		expect(rect.left).toBe(100); // 200 * 0.5
		expect(rect.width).toBe(200); // 400 * 0.5
		expect(rect.top).toBe(100); // 0 + 100 * 1.0
		expect(rect.height).toBe(300); // 300 * 1.0
	});
});
