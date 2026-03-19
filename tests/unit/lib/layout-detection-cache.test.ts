import {
	buildFileId,
	getFilteredRegions,
	isCacheValid,
	regionsToAutoZones,
} from "@/lib/layout-detection/cache.ts";
import type { PageLayout } from "@/types/index.ts";
import type { DetectionCacheData, LayoutRegion } from "@/types/layout.ts";
import { describe, expect, it } from "vitest";

describe("buildFileId", () => {
	it('generates "${name}:${size}:${lastModified}"', () => {
		const file = { name: "scan.pdf", size: 12345, lastModified: 99999 } as File;
		expect(buildFileId(file)).toBe("scan.pdf:12345:99999");
	});
});

describe("isCacheValid", () => {
	it("returns true if fileId matches", () => {
		const cache: DetectionCacheData = {
			fileId: "a.pdf:100:200",
			regionsByPage: [],
			sourceImageSizes: [],
		};
		expect(isCacheValid(cache, "a.pdf:100:200")).toBe(true);
	});

	it("returns false if fileId differs", () => {
		const cache: DetectionCacheData = {
			fileId: "a.pdf:100:200",
			regionsByPage: [],
			sourceImageSizes: [],
		};
		expect(isCacheValid(cache, "b.pdf:100:200")).toBe(false);
	});

	it("returns false if cache is null", () => {
		expect(isCacheValid(null, "a.pdf:100:200")).toBe(false);
	});
});

describe("getFilteredRegions", () => {
	const regionsByPage: LayoutRegion[][] = [
		[
			{
				type: "text",
				bbox: { x: 0, y: 0, width: 100, height: 50 },
				confidence: 0.9,
			},
			{
				type: "table",
				bbox: { x: 0, y: 60, width: 100, height: 50 },
				confidence: 0.8,
			},
		],
		[
			{
				type: "header",
				bbox: { x: 0, y: 0, width: 100, height: 30 },
				confidence: 0.7,
			},
			{
				type: "table",
				bbox: { x: 0, y: 40, width: 100, height: 50 },
				confidence: 0.85,
			},
			{
				type: "figure",
				bbox: { x: 0, y: 100, width: 100, height: 80 },
				confidence: 0.6,
			},
		],
	];

	it('with enabledTypes=["table"] returns only table regions', () => {
		const result = getFilteredRegions(regionsByPage, ["table"], []);
		expect(result).toHaveLength(2);
		expect(result.every(({ region }) => region.type === "table")).toBe(true);
	});

	it("excludes regions whose regionKey is in deletedRegionKeys", () => {
		const result = getFilteredRegions(regionsByPage, ["table"], ["0:1"]);
		expect(result).toHaveLength(1);
		expect(result[0].regionKey).toBe("1:1");
	});

	it("regionKey uses the index in the NON-filtered array (regionsByPage)", () => {
		const result = getFilteredRegions(
			regionsByPage,
			["table", "text", "header", "figure"],
			[],
		);
		// Page 0: text→0:0, table→0:1; Page 1: header→1:0, table→1:1, figure→1:2
		expect(result.map(({ regionKey }) => regionKey)).toEqual([
			"0:0",
			"0:1",
			"1:0",
			"1:1",
			"1:2",
		]);
	});
});

describe("regionsToAutoZones", () => {
	it('produces Zone[] with source="auto", label, and correct regionKey', () => {
		const filteredRegions = [
			{
				region: {
					type: "table" as const,
					bbox: { x: 100, y: 200, width: 300, height: 400 },
					confidence: 0.9,
				},
				regionKey: "0:1",
			},
			{
				region: {
					type: "text" as const,
					bbox: { x: 50, y: 50, width: 200, height: 100 },
					confidence: 0.8,
				},
				regionKey: "1:0",
			},
		];

		const pageLayouts: PageLayout[] = [
			{ pageIndex: 0, top: 0, width: 500, height: 700 },
			{ pageIndex: 1, top: 716, width: 500, height: 700 },
		];

		const sourceImageSizes = [
			{ width: 1000, height: 1400 },
			{ width: 1000, height: 1400 },
		];

		const zones = regionsToAutoZones(
			filteredRegions,
			pageLayouts,
			sourceImageSizes,
		);

		expect(zones).toHaveLength(2);

		// First zone: scaleX=0.5, scaleY=0.5
		expect(zones[0].source).toBe("auto");
		expect(zones[0].label).toBe("table");
		expect(zones[0].regionKey).toBe("0:1");
		expect(zones[0].left).toBe(50); // 100 * 0.5
		expect(zones[0].top).toBe(100); // 0 + 200 * 0.5
		expect(zones[0].width).toBe(150); // 300 * 0.5
		expect(zones[0].height).toBe(200); // 400 * 0.5

		// Second zone: page 1, scaleX=0.5, scaleY=0.5
		expect(zones[1].source).toBe("auto");
		expect(zones[1].label).toBe("text");
		expect(zones[1].regionKey).toBe("1:0");
		expect(zones[1].left).toBe(25); // 50 * 0.5
		expect(zones[1].top).toBe(741); // 716 + 50 * 0.5
	});

	it("skips regions with out-of-bounds pageIndex", () => {
		const filteredRegions = [
			{
				region: {
					type: "table" as const,
					bbox: { x: 0, y: 0, width: 100, height: 50 },
					confidence: 1.0,
				},
				regionKey: "5:0", // pageIndex 5 doesn't exist
			},
		];
		const pageLayouts: PageLayout[] = [
			{ pageIndex: 0, top: 0, width: 500, height: 700 },
		];
		const sourceImageSizes = [{ width: 1000, height: 1400 }];

		const zones = regionsToAutoZones(
			filteredRegions,
			pageLayouts,
			sourceImageSizes,
		);
		expect(zones).toHaveLength(0);
	});

	it("skips regions with zero-dimension source image", () => {
		const filteredRegions = [
			{
				region: {
					type: "text" as const,
					bbox: { x: 0, y: 0, width: 100, height: 50 },
					confidence: 1.0,
				},
				regionKey: "0:0",
			},
		];
		const pageLayouts: PageLayout[] = [
			{ pageIndex: 0, top: 0, width: 500, height: 700 },
		];
		const sourceImageSizes = [{ width: 0, height: 0 }];

		const zones = regionsToAutoZones(
			filteredRegions,
			pageLayouts,
			sourceImageSizes,
		);
		expect(zones).toHaveLength(0);
	});
});
