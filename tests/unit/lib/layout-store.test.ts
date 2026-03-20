import { useLayoutStore } from "@/store/layout-store.ts";
import { afterEach, describe, expect, it } from "vitest";

describe("Layout store", () => {
	afterEach(() => useLayoutStore.getState().reset());

	it("initial state: detection.status === 'idle', enabledTypes === ['table', 'text']", () => {
		const state = useLayoutStore.getState();
		expect(state.detection).toEqual({ status: "idle" });
		expect(state.enabledTypes).toEqual(["table", "text"]);
	});

	it("setDetectionState updates the status", () => {
		useLayoutStore
			.getState()
			.setDetectionState({ status: "running", currentPage: 1, totalPages: 3 });
		expect(useLayoutStore.getState().detection).toEqual({
			status: "running",
			currentPage: 1,
			totalPages: 3,
		});
	});

	it("toggleType adds a type to enabledTypes", () => {
		useLayoutStore.getState().toggleType("header");
		expect(useLayoutStore.getState().enabledTypes).toContain("header");
	});

	it("toggleType removes a type from enabledTypes", () => {
		useLayoutStore.getState().toggleType("table");
		expect(useLayoutStore.getState().enabledTypes).not.toContain("table");
	});

	it("setEnabledTypes replaces the list", () => {
		useLayoutStore.getState().setEnabledTypes(["header", "footer", "figure"]);
		expect(useLayoutStore.getState().enabledTypes).toEqual([
			"header",
			"footer",
			"figure",
		]);
	});

	it("setDetectionCache stores regions by page", () => {
		const cache = {
			fileId: "test:123:456",
			regionsByPage: [
				[
					{
						type: "table" as const,
						bbox: { x: 0, y: 0, width: 100, height: 100 },
						confidence: 1.0,
					},
				],
			],
			sourceImageSizes: [{ width: 1000, height: 800 }],
			detectedTypes: ["table" as const],
		};
		useLayoutStore.getState().setDetectionCache(cache);
		expect(useLayoutStore.getState().detectionCache).toEqual(cache);
	});

	it("clearDetectionCache resets to null and empties deletedRegionKeys", () => {
		useLayoutStore.getState().setDetectionCache({
			fileId: "test:1:2",
			regionsByPage: [],
			sourceImageSizes: [],
			detectedTypes: [],
		});
		useLayoutStore.getState().addDeletedRegionKey("0:1");
		useLayoutStore.getState().clearDetectionCache();
		expect(useLayoutStore.getState().detectionCache).toBeNull();
		expect(useLayoutStore.getState().deletedRegionKeys).toEqual([]);
	});

	it("addDeletedRegionKey adds a key to the array", () => {
		useLayoutStore.getState().addDeletedRegionKey("0:2");
		useLayoutStore.getState().addDeletedRegionKey("1:0");
		expect(useLayoutStore.getState().deletedRegionKeys).toEqual(["0:2", "1:0"]);
	});

	it("addDeletedRegionKey deduplicates — adding same key twice keeps one entry", () => {
		useLayoutStore.getState().addDeletedRegionKey("0:1");
		useLayoutStore.getState().addDeletedRegionKey("0:1");
		expect(useLayoutStore.getState().deletedRegionKeys).toEqual(["0:1"]);
	});

	it("clearDeletedRegionKeys empties the array", () => {
		useLayoutStore.getState().addDeletedRegionKey("0:1");
		useLayoutStore.getState().clearDeletedRegionKeys();
		expect(useLayoutStore.getState().deletedRegionKeys).toEqual([]);
	});
});
