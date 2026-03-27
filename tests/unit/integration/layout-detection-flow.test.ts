import { regionToZoneRect } from "@/lib/coordinate-mapping.ts";
import {
	buildFileId,
	getFilteredRegions,
	isCacheValid,
	regionsToAutoZones,
} from "@/lib/layout-detection/cache.ts";
import { _resetIdCounter } from "@/lib/zone-manager.ts";
import { useLayoutStore } from "@/store/layout-store.ts";
import { useZoneStore } from "@/store/zone-store.ts";
import type { PageLayout } from "@/types/index.ts";
import type {
	DetectionCacheData,
	LayoutRegion,
	LayoutRegionType,
} from "@/types/layout.ts";
import { afterEach, describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRegion(
	type: LayoutRegionType,
	bbox: { x: number; y: number; width: number; height: number },
	confidence = 1.0,
): LayoutRegion {
	return { type, bbox, confidence };
}

function makePageLayout(
	pageIndex: number,
	top: number,
	width: number,
	height: number,
): PageLayout {
	return { pageIndex, top, width, height };
}

const FILE_ID = "report.pdf:10240:1700000000000";

function resetStores(): void {
	useLayoutStore.getState().reset();
	useZoneStore.getState().reset();
	_resetIdCounter();
}

// ---------------------------------------------------------------------------
// Integration tests
// ---------------------------------------------------------------------------

describe("Layout detection integration flow", () => {
	afterEach(resetStores);

	// -----------------------------------------------------------------------
	// Full flow: cache → filter → auto zones → toggle → clear
	// -----------------------------------------------------------------------

	describe("complete flow: cache → filtered regions → auto zones → toggle → clear", () => {
		const regionsByPage: LayoutRegion[][] = [
			[
				makeRegion("table", { x: 10, y: 200, width: 400, height: 300 }),
				makeRegion("text", { x: 10, y: 550, width: 400, height: 100 }),
				makeRegion("header", { x: 10, y: 10, width: 400, height: 50 }),
			],
			[
				makeRegion("table", { x: 20, y: 100, width: 380, height: 250 }),
				makeRegion("footer", { x: 20, y: 900, width: 380, height: 60 }),
			],
		];

		const sourceImageSizes = [
			{ width: 500, height: 700 },
			{ width: 500, height: 1000 },
		];

		const pageLayouts: PageLayout[] = [
			makePageLayout(0, 0, 250, 350),
			makePageLayout(1, 360, 250, 500),
		];

		const cache: DetectionCacheData = {
			fileId: FILE_ID,
			regionsByPage,
			sourceImageSizes,
		};

		it("stores cache, filters by enabled types, creates auto zones, then clears them", () => {
			// 1. Store detection cache
			useLayoutStore.getState().setDetectionCache(cache);
			expect(
				isCacheValid(useLayoutStore.getState().detectionCache, FILE_ID),
			).toBe(true);

			// 2. Filter: only table enabled (default)
			const enabledTypes = useLayoutStore.getState().enabledTypes;
			expect(enabledTypes).toEqual(["table"]);
			const filtered = getFilteredRegions(regionsByPage, enabledTypes, []);
			// page0: table(0:0) — text, header excluded
			// page1: table(1:0) — footer excluded
			expect(filtered).toHaveLength(2);
			expect(filtered.map((f) => f.regionKey)).toEqual(["0:0", "1:0"]);

			// 3. Convert to auto zone defs and add to zone store
			const zoneDefs = regionsToAutoZones(
				filtered,
				pageLayouts,
				sourceImageSizes,
			);
			expect(zoneDefs).toHaveLength(2);
			expect(zoneDefs.every((z) => z.source === "auto")).toBe(true);

			useZoneStore.getState().addAutoZones(zoneDefs);
			const zones = useZoneStore.getState().zones;
			expect(zones).toHaveLength(2);
			expect(zones[0].source).toBe("auto");
			expect(zones[0].regionKey).toBe("0:0");
			expect(zones[0].label).toBe("table");

			// 4. Clear auto zones — manual zones should survive
			useZoneStore
				.getState()
				.addZone({ left: 0, top: 0, width: 50, height: 50 });
			expect(useZoneStore.getState().zones).toHaveLength(3);

			useZoneStore.getState().clearAutoZones();
			const remaining = useZoneStore.getState().zones;
			expect(remaining).toHaveLength(1);
			expect(remaining[0].source).toBeUndefined(); // manual zone
		});

		it("toggle type OFF removes auto zones of that type, toggle ON re-adds from cache", () => {
			// Setup: cache + auto zones with table+text enabled
			useLayoutStore.getState().setDetectionCache(cache);
			// Enable "text" in addition to default "table"
			useLayoutStore.getState().toggleType("text");
			const filtered = getFilteredRegions(
				regionsByPage,
				useLayoutStore.getState().enabledTypes,
				[],
			);
			useZoneStore
				.getState()
				.addAutoZones(
					regionsToAutoZones(filtered, pageLayouts, sourceImageSizes),
				);
			expect(useZoneStore.getState().zones).toHaveLength(3);

			// Toggle OFF "table" → remove table auto zones
			useLayoutStore.getState().toggleType("table");
			useZoneStore.getState().clearAutoZonesByType("table");

			const afterOff = useZoneStore.getState().zones;
			expect(afterOff).toHaveLength(1);
			expect(afterOff[0].label).toBe("text");

			// Toggle ON "table" with cache → re-add table zones
			useLayoutStore.getState().toggleType("table");
			const tableFiltered = getFilteredRegions(
				cache.regionsByPage,
				["table"],
				useLayoutStore.getState().deletedRegionKeys,
			);
			useZoneStore
				.getState()
				.addAutoZones(
					regionsToAutoZones(tableFiltered, pageLayouts, sourceImageSizes),
				);
			expect(useZoneStore.getState().zones).toHaveLength(3);
			expect(
				useZoneStore.getState().zones.filter((z) => z.label === "table"),
			).toHaveLength(2);
		});

		it("toggle ON without cache does not create any zones", () => {
			// No cache stored — toggle header ON
			useLayoutStore.getState().toggleType("header");
			const detectionCache = useLayoutStore.getState().detectionCache;
			expect(detectionCache).toBeNull();
			// Without cache there's nothing to filter/add
			expect(useZoneStore.getState().zones).toHaveLength(0);
		});
	});

	// -----------------------------------------------------------------------
	// Cache invalidation flows
	// -----------------------------------------------------------------------

	describe("cache invalidation flows", () => {
		it("cache is invalidated when file identity changes", () => {
			const cache: DetectionCacheData = {
				fileId: "old.pdf:100:999",
				regionsByPage: [
					[makeRegion("text", { x: 0, y: 0, width: 100, height: 100 })],
				],
				sourceImageSizes: [{ width: 500, height: 700 }],
			};
			useLayoutStore.getState().setDetectionCache(cache);

			expect(
				isCacheValid(
					useLayoutStore.getState().detectionCache,
					"old.pdf:100:999",
				),
			).toBe(true);
			expect(
				isCacheValid(
					useLayoutStore.getState().detectionCache,
					"new.pdf:200:1000",
				),
			).toBe(false);
		});

		it("clearDetectionCache nullifies cache and clears deleted keys", () => {
			useLayoutStore.getState().setDetectionCache({
				fileId: FILE_ID,
				regionsByPage: [],
				sourceImageSizes: [],
			});
			useLayoutStore.getState().addDeletedRegionKey("0:0");
			useLayoutStore.getState().addDeletedRegionKey("1:2");

			useLayoutStore.getState().clearDetectionCache();

			expect(useLayoutStore.getState().detectionCache).toBeNull();
			expect(useLayoutStore.getState().deletedRegionKeys).toEqual([]);
		});

		it("buildFileId produces a stable identity from File properties", () => {
			const file = new File(["content"], "test.pdf", {
				lastModified: 1700000000000,
			});
			const id = buildFileId(file);
			expect(id).toBe(`test.pdf:${file.size}:1700000000000`);

			// Same file again → same ID
			const file2 = new File(["content"], "test.pdf", {
				lastModified: 1700000000000,
			});
			expect(buildFileId(file2)).toBe(id);
		});

		it("force re-detect clears deleted keys so previously deleted zones reappear", () => {
			const regions: LayoutRegion[][] = [
				[
					makeRegion("table", { x: 0, y: 200, width: 100, height: 100 }),
					makeRegion("text", { x: 0, y: 400, width: 100, height: 100 }),
				],
			];
			const cache: DetectionCacheData = {
				fileId: FILE_ID,
				regionsByPage: regions,
				sourceImageSizes: [{ width: 500, height: 700 }],
			};

			useLayoutStore.getState().setDetectionCache(cache);
			// Simulate user deleting region 0:0
			useLayoutStore.getState().addDeletedRegionKey("0:0");

			// Before force re-detect: filtered excludes 0:0
			const before = getFilteredRegions(
				regions,
				["table", "text"],
				useLayoutStore.getState().deletedRegionKeys,
			);
			expect(before).toHaveLength(1);
			expect(before[0].regionKey).toBe("0:1");

			// Force re-detect: clear deleted keys
			useLayoutStore.getState().clearDeletedRegionKeys();

			// After: 0:0 reappears
			const after = getFilteredRegions(
				regions,
				["table", "text"],
				useLayoutStore.getState().deletedRegionKeys,
			);
			expect(after).toHaveLength(2);
			expect(after[0].regionKey).toBe("0:0");
		});
	});

	// -----------------------------------------------------------------------
	// Detection state machine
	// -----------------------------------------------------------------------

	describe("detection state machine: idle → running → done → idle", () => {
		it("follows the expected state transitions", () => {
			const store = useLayoutStore.getState;

			// Initial: idle
			expect(store().detection.status).toBe("idle");

			// Start detection
			store().setDetectionState({
				status: "running",
				currentPage: 1,
				totalPages: 5,
			});
			expect(store().detection.status).toBe("running");
			if (store().detection.status === "running") {
				expect(store().detection.currentPage).toBe(1);
				expect(store().detection.totalPages).toBe(5);
			}

			// Progress
			store().setDetectionState({
				status: "running",
				currentPage: 3,
				totalPages: 5,
			});
			if (store().detection.status === "running") {
				expect(store().detection.currentPage).toBe(3);
			}

			// Done
			store().setDetectionState({ status: "done" });
			expect(store().detection.status).toBe("done");

			// Back to idle (user closes or starts new operation)
			store().setDetectionState({ status: "idle" });
			expect(store().detection.status).toBe("idle");
		});
	});

	// -----------------------------------------------------------------------
	// Edge cases
	// -----------------------------------------------------------------------

	describe("edge cases", () => {
		it("empty regions: getFilteredRegions returns empty array", () => {
			const result = getFilteredRegions([], ["table", "text"], []);
			expect(result).toEqual([]);
		});

		it("empty regions: regionsToAutoZones returns empty array", () => {
			const result = regionsToAutoZones([], [], []);
			expect(result).toEqual([]);
		});

		it("all pages with empty region arrays", () => {
			const regionsByPage: LayoutRegion[][] = [[], [], []];
			const result = getFilteredRegions(regionsByPage, ["table", "text"], []);
			expect(result).toEqual([]);
		});

		it("single image (1 page): full flow works", () => {
			const regions: LayoutRegion[][] = [
				[makeRegion("text", { x: 10, y: 100, width: 480, height: 600 })],
			];
			const pageLayouts = [makePageLayout(0, 0, 250, 350)];
			const sourceImageSizes = [{ width: 500, height: 700 }];
			const cache: DetectionCacheData = {
				fileId: "image.png:5000:1700000000000",
				regionsByPage: regions,
				sourceImageSizes,
			};

			useLayoutStore.getState().setDetectionCache(cache);
			const filtered = getFilteredRegions(regions, ["text"], []);
			expect(filtered).toHaveLength(1);

			const zoneDefs = regionsToAutoZones(
				filtered,
				pageLayouts,
				sourceImageSizes,
			);
			expect(zoneDefs).toHaveLength(1);
			expect(zoneDefs[0].source).toBe("auto");
			expect(zoneDefs[0].label).toBe("text");
			expect(zoneDefs[0].regionKey).toBe("0:0");

			// Verify coordinate conversion
			const rect = regionToZoneRect(
				regions[0][0],
				pageLayouts[0],
				sourceImageSizes[0],
			);
			expect(rect.left).toBeCloseTo(10 * (250 / 500));
			expect(rect.top).toBeCloseTo(0 + 100 * (350 / 700));
			expect(rect.width).toBeCloseTo(480 * (250 / 500));
			expect(rect.height).toBeCloseTo(600 * (350 / 700));
		});

		it("PDF with multiple pages: regions are keyed by page index", () => {
			const regionsByPage: LayoutRegion[][] = [
				[makeRegion("table", { x: 0, y: 200, width: 100, height: 100 })],
				[], // empty page
				[
					makeRegion("text", { x: 0, y: 300, width: 100, height: 100 }),
					makeRegion("header", { x: 0, y: 10, width: 100, height: 50 }),
				],
			];

			const filtered = getFilteredRegions(regionsByPage, ["table", "text"], []);
			expect(filtered).toHaveLength(2);
			expect(filtered[0].regionKey).toBe("0:0"); // table from page 0
			expect(filtered[1].regionKey).toBe("2:0"); // text from page 2 (header filtered)
		});

		it("deleted region keys use non-filtered indices", () => {
			// Page 0 has: [header(0:0), table(0:1), text(0:2)]
			const regionsByPage: LayoutRegion[][] = [
				[
					makeRegion("header", { x: 0, y: 10, width: 100, height: 50 }),
					makeRegion("table", { x: 0, y: 200, width: 100, height: 100 }),
					makeRegion("text", { x: 0, y: 400, width: 100, height: 100 }),
				],
			];

			// Delete the table at non-filtered index 0:1
			const filtered = getFilteredRegions(
				regionsByPage,
				["table", "text"],
				["0:1"],
			);

			// table(0:1) deleted, header(0:0) not in enabled types → only text(0:2) remains
			expect(filtered).toHaveLength(1);
			expect(filtered[0].regionKey).toBe("0:2");
			expect(filtered[0].region.type).toBe("text");
		});

		it("regionsToAutoZones skips page indices out of bounds", () => {
			const filteredRegions = [
				{
					region: makeRegion("text", {
						x: 10,
						y: 100,
						width: 100,
						height: 100,
					}),
					regionKey: "5:0", // page 5 doesn't exist in layouts
				},
			];
			const pageLayouts = [makePageLayout(0, 0, 250, 350)];
			const sourceImageSizes = [{ width: 500, height: 700 }];

			const result = regionsToAutoZones(
				filteredRegions,
				pageLayouts,
				sourceImageSizes,
			);
			expect(result).toEqual([]);
		});

		it("regionsToAutoZones skips regions when source image has zero dimensions", () => {
			const filteredRegions = [
				{
					region: makeRegion("text", {
						x: 10,
						y: 100,
						width: 100,
						height: 100,
					}),
					regionKey: "0:0",
				},
			];
			const pageLayouts = [makePageLayout(0, 0, 250, 350)];
			const sourceImageSizes = [{ width: 0, height: 0 }];

			const result = regionsToAutoZones(
				filteredRegions,
				pageLayouts,
				sourceImageSizes,
			);
			expect(result).toEqual([]);
		});

		it("all enabled types toggled OFF results in empty filter", () => {
			const regionsByPage: LayoutRegion[][] = [
				[
					makeRegion("table", { x: 0, y: 200, width: 100, height: 100 }),
					makeRegion("text", { x: 0, y: 400, width: 100, height: 100 }),
				],
			];

			const result = getFilteredRegions(regionsByPage, [], []);
			expect(result).toEqual([]);
		});

		it("clearAutoZones preserves selection on manual zone", () => {
			const manualZone = useZoneStore.getState().addZone({
				left: 0,
				top: 0,
				width: 50,
				height: 50,
			});
			useZoneStore.getState().selectZone(manualZone.id);
			useZoneStore.getState().addAutoZones([
				{
					left: 100,
					top: 100,
					width: 200,
					height: 200,
					source: "auto",
					label: "table",
					regionKey: "0:0",
				},
			]);

			useZoneStore.getState().clearAutoZones();
			expect(useZoneStore.getState().selectedZoneId).toBe(manualZone.id);
			expect(useZoneStore.getState().zones).toHaveLength(1);
		});

		it("clearAutoZones clears selection if selected zone was auto", () => {
			useZoneStore.getState().addAutoZones([
				{
					left: 100,
					top: 100,
					width: 200,
					height: 200,
					source: "auto",
					label: "table",
					regionKey: "0:0",
				},
			]);
			const autoZone = useZoneStore.getState().zones[0];
			useZoneStore.getState().selectZone(autoZone.id);

			useZoneStore.getState().clearAutoZones();
			expect(useZoneStore.getState().selectedZoneId).toBeNull();
			expect(useZoneStore.getState().zones).toHaveLength(0);
		});

		it("clearAutoZonesByType only removes auto zones matching the label", () => {
			useZoneStore.getState().addAutoZones([
				{
					left: 0,
					top: 0,
					width: 100,
					height: 100,
					source: "auto",
					label: "table",
					regionKey: "0:0",
				},
				{
					left: 0,
					top: 200,
					width: 100,
					height: 100,
					source: "auto",
					label: "text",
					regionKey: "0:1",
				},
				{
					left: 0,
					top: 400,
					width: 100,
					height: 100,
					source: "auto",
					label: "table",
					regionKey: "0:2",
				},
			]);
			// Add a manual zone too
			useZoneStore
				.getState()
				.addZone({ left: 500, top: 0, width: 50, height: 50 });
			expect(useZoneStore.getState().zones).toHaveLength(4);

			useZoneStore.getState().clearAutoZonesByType("table");

			const remaining = useZoneStore.getState().zones;
			expect(remaining).toHaveLength(2);
			expect(remaining.find((z) => z.label === "table")).toBeUndefined();
			expect(remaining.find((z) => z.label === "text")).toBeDefined();
			expect(remaining.find((z) => z.source === undefined)).toBeDefined(); // manual
		});
	});

	// -----------------------------------------------------------------------
	// Store reset / cleanup flow
	// -----------------------------------------------------------------------

	describe("store cleanup simulating doClose / new file load", () => {
		it("reset on both stores clears all detection and zone state", () => {
			// Populate both stores
			useLayoutStore.getState().setDetectionCache({
				fileId: FILE_ID,
				regionsByPage: [
					[makeRegion("table", { x: 0, y: 0, width: 100, height: 100 })],
				],
				sourceImageSizes: [{ width: 500, height: 700 }],
			});
			useLayoutStore.getState().setDetectionState({
				status: "running",
				currentPage: 2,
				totalPages: 5,
			});
			useLayoutStore.getState().addDeletedRegionKey("0:0");
			useZoneStore.getState().addAutoZones([
				{
					left: 0,
					top: 0,
					width: 100,
					height: 100,
					source: "auto",
					label: "table",
					regionKey: "0:0",
				},
			]);
			useZoneStore
				.getState()
				.addZone({ left: 200, top: 200, width: 50, height: 50 });

			// Simulate doClose
			useLayoutStore.getState().clearDetectionCache();
			useLayoutStore.getState().setDetectionState({ status: "idle" });
			useZoneStore.getState().clearZones();

			expect(useLayoutStore.getState().detectionCache).toBeNull();
			expect(useLayoutStore.getState().detection.status).toBe("idle");
			expect(useLayoutStore.getState().deletedRegionKeys).toEqual([]);
			expect(useZoneStore.getState().zones).toEqual([]);
		});

		it("loading a new file invalidates cache even if fileId would differ", () => {
			useLayoutStore.getState().setDetectionCache({
				fileId: "old.pdf:100:999",
				regionsByPage: [],
				sourceImageSizes: [],
			});

			// Simulate new file load: explicit cleanup
			useLayoutStore.getState().clearDetectionCache();
			useZoneStore.getState().clearAutoZones();

			expect(useLayoutStore.getState().detectionCache).toBeNull();
			expect(
				isCacheValid(
					useLayoutStore.getState().detectionCache,
					"new.pdf:200:1000",
				),
			).toBe(false);
		});
	});

	// -----------------------------------------------------------------------
	// Coordinate conversion integration
	// -----------------------------------------------------------------------

	describe("regionToZoneRect integration with real page layouts", () => {
		it("correctly maps detection-space region to document-space zone rect", () => {
			// Detection ran at 500x700 resolution, page displays at 250x350 starting at top=100
			const region = makeRegion("table", {
				x: 100,
				y: 200,
				width: 300,
				height: 400,
			});
			const page = makePageLayout(0, 100, 250, 350);
			const sourceSize = { width: 500, height: 700 };

			const rect = regionToZoneRect(region, page, sourceSize);

			expect(rect.left).toBeCloseTo(50); // 100 * (250/500)
			expect(rect.top).toBeCloseTo(200); // 100 + 200 * (350/700)
			expect(rect.width).toBeCloseTo(150); // 300 * (250/500)
			expect(rect.height).toBeCloseTo(200); // 400 * (350/700)
		});

		it("maps regions from multi-page PDF with different page tops", () => {
			const pages = [
				makePageLayout(0, 0, 200, 400),
				makePageLayout(1, 410, 200, 400),
			];
			const sourceSize = { width: 400, height: 800 };

			const r0 = makeRegion("text", { x: 40, y: 100, width: 320, height: 200 });
			const r1 = makeRegion("table", {
				x: 40,
				y: 100,
				width: 320,
				height: 200,
			});

			const rect0 = regionToZoneRect(r0, pages[0], sourceSize);
			const rect1 = regionToZoneRect(r1, pages[1], sourceSize);

			// Same source coords but different page tops
			expect(rect0.top).toBeCloseTo(0 + 100 * (400 / 800)); // 50
			expect(rect1.top).toBeCloseTo(410 + 100 * (400 / 800)); // 460
		});
	});
});
