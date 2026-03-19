import { ProxyDestroyedError } from "@/lib/errors.ts";
import {
	type OcrEngine,
	type ZoneInput,
	type ZoneProvider,
	processZones,
} from "@/lib/ocr-coordinator.ts";
import type { ImageBuffer } from "@/types/index.ts";
import type { OcrProgress, OcrZoneResult } from "@/types/ocr.ts";
import { describe, expect, it, vi } from "vitest";

const dummyImage: ImageBuffer = {
	data: new Uint8ClampedArray(4),
	width: 1,
	height: 1,
};

function mockEngine(
	results: Array<{ text: string; confidence: number }>,
): OcrEngine {
	let callIdx = 0;
	return {
		recognize: vi.fn(async (_img, onProgress) => {
			onProgress?.(0.5);
			onProgress?.(1.0);
			return results[callIdx++] ?? { text: "", confidence: 0 };
		}),
	};
}

function makeZones(count: number): ZoneInput[] {
	return Array.from({ length: count }, (_, i) => ({
		id: i + 1,
		image: dummyImage,
	}));
}

describe("OCR Coordinator", () => {
	it("processes N zones sequentially", async () => {
		const engine = mockEngine([
			{ text: "Zone 1 text", confidence: 90 },
			{ text: "Zone 2 text", confidence: 85 },
			{ text: "Zone 3 text", confidence: 92 },
		]);

		const results = await processZones(makeZones(3), { engine });

		expect(results).toHaveLength(3);
		expect(engine.recognize).toHaveBeenCalledTimes(3);
	});

	it("returns results with stable zone IDs", async () => {
		const engine = mockEngine([
			{ text: "A", confidence: 90 },
			{ text: "B", confidence: 85 },
		]);

		const results = await processZones(makeZones(2), { engine });

		expect(results[0].zoneId).toBe(1);
		expect(results[0].text).toBe("A");
		expect(results[1].zoneId).toBe(2);
		expect(results[1].text).toBe("B");
	});

	it("reports progress with current zone info", async () => {
		const engine = mockEngine([
			{ text: "A", confidence: 90 },
			{ text: "B", confidence: 85 },
		]);
		const progressUpdates: OcrProgress[] = [];

		await processZones(makeZones(2), {
			engine,
			onProgress: (p) => progressUpdates.push({ ...p }),
		});

		// Should have progress callbacks
		expect(progressUpdates.length).toBeGreaterThan(0);
		// First zone progress should report "Zone 1/2"
		const zone1Progress = progressUpdates.find((p) => p.currentItem === 1);
		expect(zone1Progress).toBeDefined();
		expect(zone1Progress?.totalItems).toBe(2);
	});

	it("stops on abort signal", async () => {
		const controller = new AbortController();
		const engine: OcrEngine = {
			recognize: vi.fn(async () => {
				controller.abort(); // abort after first zone
				return { text: "A", confidence: 90 };
			}),
		};

		const results = await processZones(makeZones(3), {
			engine,
			signal: controller.signal,
		});

		// Only first zone should complete
		expect(results).toHaveLength(1);
	});

	it("skips recognition when abort happens during preprocessing", async () => {
		const controller = new AbortController();
		const engine: OcrEngine = {
			recognize: vi.fn(async () => {
				return { text: "A", confidence: 90 };
			}),
		};

		const results = await processZones(makeZones(3), {
			engine,
			preprocess: async (img) => {
				// Abort during preprocessing of zone 1
				controller.abort();
				return img;
			},
			signal: controller.signal,
		});

		// Preprocessing ran for zone 1 but abort check after preprocess
		// should prevent recognition from running on that zone
		expect(engine.recognize).not.toHaveBeenCalled();
		expect(results).toHaveLength(0);
	});

	it("new call replaces previous results (returns new array)", async () => {
		const engine = mockEngine([{ text: "First", confidence: 90 }]);
		const results1 = await processZones(makeZones(1), { engine });

		const engine2 = mockEngine([{ text: "Second", confidence: 85 }]);
		const results2 = await processZones(makeZones(1), { engine: engine2 });

		expect(results1[0].text).toBe("First");
		expect(results2[0].text).toBe("Second");
		expect(results1).not.toBe(results2);
	});

	it("results are in ascending zone ID order", async () => {
		const engine = mockEngine([
			{ text: "C", confidence: 90 },
			{ text: "A", confidence: 85 },
			{ text: "B", confidence: 92 },
		]);

		// Zones provided in non-sorted order
		const zones: ZoneInput[] = [
			{ id: 3, image: dummyImage },
			{ id: 1, image: dummyImage },
			{ id: 2, image: dummyImage },
		];

		const results = await processZones(zones, { engine });
		expect(results.map((r) => r.zoneId)).toEqual([1, 2, 3]);
	});

	it("uses raw image if preprocessing crashes and warns about the zone", async () => {
		const engine = mockEngine([{ text: "OK", confidence: 90 }]);
		const crashingPreprocess = vi.fn(async () => {
			throw new Error("preprocessing crash");
		});
		const onWarning = vi.fn();

		const results = await processZones(makeZones(1), {
			engine,
			preprocess: crashingPreprocess,
			onWarning,
		});

		expect(results).toHaveLength(1);
		expect(results[0].text).toBe("OK");
		// Engine was called with original image (not preprocessed)
		expect(engine.recognize).toHaveBeenCalledWith(
			dummyImage,
			expect.any(Function),
		);
		// onWarning was called with a message mentioning the zone
		expect(onWarning).toHaveBeenCalledWith(expect.stringContaining("zone"));
	});

	it("continues to next zone when OCR fails on one zone", async () => {
		let callIdx = 0;
		const engine: OcrEngine = {
			recognize: vi.fn(async () => {
				callIdx++;
				if (callIdx === 1) {
					throw new Error("OCR engine failure");
				}
				return { text: "Zone 2 OK", confidence: 88 };
			}),
		};
		const onWarning = vi.fn();

		const results = await processZones(makeZones(2), {
			engine,
			onWarning,
		});

		expect(results).toHaveLength(2);
		// Zone 1 failed: empty text
		expect(results[0].zoneId).toBe(1);
		expect(results[0].text).toBe("");
		expect(results[0].confidence).toBe(0);
		// Zone 2 succeeded
		expect(results[1].zoneId).toBe(2);
		expect(results[1].text).toBe("Zone 2 OK");
		// onWarning was called for the failed zone
		expect(onWarning).toHaveBeenCalledWith(expect.stringContaining("zone 1"));
	});

	describe("onItemComplete callback", () => {
		it("is called after each zone is recognized", async () => {
			const engine = mockEngine([
				{ text: "A", confidence: 90 },
				{ text: "B", confidence: 85 },
			]);
			const onItemComplete = vi.fn();

			await processZones(makeZones(2), { engine, onItemComplete });

			expect(onItemComplete).toHaveBeenCalledTimes(2);
			expect(onItemComplete).toHaveBeenNthCalledWith(1, {
				zoneId: 1,
				text: "A",
				confidence: 90,
			});
			expect(onItemComplete).toHaveBeenNthCalledWith(2, {
				zoneId: 2,
				text: "B",
				confidence: 85,
			});
		});

		it("is called for items accumulated before a ProxyDestroyedError", async () => {
			const engine = mockEngine([{ text: "A", confidence: 90 }]);
			const onItemComplete = vi.fn();
			const provider: ZoneProvider = {
				count: 3,
				getZone: vi.fn(async (index: number) => {
					if (index === 1) throw new ProxyDestroyedError();
					return { id: index + 1, image: dummyImage };
				}),
			};

			const results = await processZones(provider, {
				engine,
				onItemComplete,
			});

			expect(onItemComplete).toHaveBeenCalledTimes(1);
			expect(onItemComplete).toHaveBeenCalledWith({
				zoneId: 1,
				text: "A",
				confidence: 90,
			});
			expect(results).toHaveLength(1);
		});

		it("is not called for items where getZone throws a regular Error", async () => {
			const engine = mockEngine([
				{ text: "A", confidence: 90 },
				{ text: "C", confidence: 92 },
			]);
			const onItemComplete = vi.fn();
			const provider: ZoneProvider = {
				count: 3,
				getZone: vi.fn(async (index: number) => {
					if (index === 1) throw new Error("network error");
					return { id: index + 1, image: dummyImage };
				}),
			};

			const results = await processZones(provider, {
				engine,
				onItemComplete,
				onWarning: vi.fn(),
			});

			// 3 results: success, empty (skipped), success
			expect(results).toHaveLength(3);
			expect(results[0]).toEqual({ zoneId: 1, text: "A", confidence: 90 });
			expect(results[1]).toEqual({ zoneId: 2, text: "", confidence: 0 });
			expect(results[2]).toEqual({ zoneId: 3, text: "C", confidence: 92 });

			// onItemComplete called for item 0 and item 2, but NOT for item 1
			expect(onItemComplete).toHaveBeenCalledTimes(2);
			expect(onItemComplete).toHaveBeenNthCalledWith(1, {
				zoneId: 1,
				text: "A",
				confidence: 90,
			});
			expect(onItemComplete).toHaveBeenNthCalledWith(2, {
				zoneId: 3,
				text: "C",
				confidence: 92,
			});
		});

		it("is not called if recognition fails", async () => {
			const engine: OcrEngine = {
				recognize: vi.fn(async () => {
					throw new Error("OCR failure");
				}),
			};
			const onItemComplete = vi.fn();

			await processZones(makeZones(1), {
				engine,
				onItemComplete,
				onWarning: vi.fn(),
			});

			expect(onItemComplete).not.toHaveBeenCalled();
		});
	});

	describe("onStepChange callback", () => {
		it("emits 'preprocessing' before preprocess and 'recognizing' before recognize", async () => {
			const engine = mockEngine([{ text: "A", confidence: 90 }]);
			const onStepChange = vi.fn();

			await processZones(makeZones(1), {
				engine,
				preprocess: async (img) => img,
				onStepChange,
			});

			expect(onStepChange).toHaveBeenCalledWith("preprocessing");
			expect(onStepChange).toHaveBeenCalledWith("recognizing");
			// preprocessing comes before recognizing
			const calls = onStepChange.mock.calls.map((c: [string]) => c[0]);
			expect(calls).toEqual(["preprocessing", "recognizing"]);
		});

		it("emits only 'recognizing' if preprocess is undefined", async () => {
			const engine = mockEngine([{ text: "A", confidence: 90 }]);
			const onStepChange = vi.fn();

			await processZones(makeZones(1), { engine, onStepChange });

			expect(onStepChange).toHaveBeenCalledTimes(1);
			expect(onStepChange).toHaveBeenCalledWith("recognizing");
		});

		it("emits correct sequence for 2 zones with preprocess", async () => {
			const engine = mockEngine([
				{ text: "A", confidence: 90 },
				{ text: "B", confidence: 85 },
			]);
			const onStepChange = vi.fn();

			await processZones(makeZones(2), {
				engine,
				preprocess: async (img) => img,
				onStepChange,
			});

			const calls = onStepChange.mock.calls.map((c: [string]) => c[0]);
			expect(calls).toEqual([
				"preprocessing",
				"recognizing",
				"preprocessing",
				"recognizing",
			]);
		});
	});

	describe("ZoneProvider", () => {
		it("accepts a ZoneProvider with count and getZone", async () => {
			const engine = mockEngine([
				{ text: "A", confidence: 90 },
				{ text: "B", confidence: 85 },
			]);
			const provider: ZoneProvider = {
				count: 2,
				getZone: vi.fn(async (index: number) => ({
					id: index + 1,
					image: dummyImage,
				})),
			};

			const results = await processZones(provider, { engine });

			expect(results).toHaveLength(2);
			expect(results[0]).toEqual({
				zoneId: 1,
				text: "A",
				confidence: 90,
			});
			expect(results[1]).toEqual({
				zoneId: 2,
				text: "B",
				confidence: 85,
			});
		});

		it("calls getZone lazily in order 0..count-1", async () => {
			const getZoneCalls: number[] = [];
			const engine: OcrEngine = {
				recognize: vi.fn(async (_img, onProgress) => {
					onProgress?.(1.0);
					return { text: "OK", confidence: 90 };
				}),
			};
			const provider: ZoneProvider = {
				count: 3,
				getZone: vi.fn(async (index: number) => {
					getZoneCalls.push(index);
					return { id: index + 1, image: dummyImage };
				}),
			};

			await processZones(provider, { engine });

			expect(getZoneCalls).toEqual([0, 1, 2]);
		});

		it("does not sort (unlike ZoneInput[])", async () => {
			const engine = mockEngine([
				{ text: "Third", confidence: 90 },
				{ text: "First", confidence: 85 },
			]);
			// Provider returns zones in a specific order (id=3 first, id=1 second)
			const provider: ZoneProvider = {
				count: 2,
				getZone: vi.fn(async (index: number) => {
					const zones = [
						{ id: 3, image: dummyImage },
						{ id: 1, image: dummyImage },
					];
					return zones[index];
				}),
			};

			const results = await processZones(provider, { engine });

			// Results should be in provider order, not sorted
			expect(results[0].zoneId).toBe(3);
			expect(results[0].text).toBe("Third");
			expect(results[1].zoneId).toBe(1);
			expect(results[1].text).toBe("First");
		});
	});

	describe("ProxyDestroyedError", () => {
		it("stops the loop immediately when getZone throws it", async () => {
			const engine = mockEngine([{ text: "A", confidence: 90 }]);
			const provider: ZoneProvider = {
				count: 3,
				getZone: vi.fn(async (index: number) => {
					if (index === 1) throw new ProxyDestroyedError();
					return { id: index + 1, image: dummyImage };
				}),
			};

			const results = await processZones(provider, { engine });

			// Only zone 0 processed, then loop stopped
			expect(results).toHaveLength(1);
			expect(results[0].zoneId).toBe(1);
			expect(engine.recognize).toHaveBeenCalledTimes(1);
		});

		it("returns accumulated results before the error", async () => {
			const engine = mockEngine([
				{ text: "A", confidence: 90 },
				{ text: "B", confidence: 85 },
			]);
			const provider: ZoneProvider = {
				count: 4,
				getZone: vi.fn(async (index: number) => {
					if (index === 2) throw new ProxyDestroyedError();
					return { id: index + 1, image: dummyImage };
				}),
			};

			const results = await processZones(provider, { engine });

			expect(results).toHaveLength(2);
			expect(results[0]).toEqual({
				zoneId: 1,
				text: "A",
				confidence: 90,
			});
			expect(results[1]).toEqual({
				zoneId: 2,
				text: "B",
				confidence: 85,
			});
		});

		it("other getZone errors skip the item with a warning and continue", async () => {
			const engine = mockEngine([
				{ text: "A", confidence: 90 },
				{ text: "C", confidence: 92 },
			]);
			const onWarning = vi.fn();
			const provider: ZoneProvider = {
				count: 3,
				getZone: vi.fn(async (index: number) => {
					if (index === 1) throw new Error("network error");
					return { id: index + 1, image: dummyImage };
				}),
			};

			const results = await processZones(provider, {
				engine,
				onWarning,
			});

			expect(results).toHaveLength(3);
			// Index 0 → success
			expect(results[0]).toEqual({
				zoneId: 1,
				text: "A",
				confidence: 90,
			});
			// Index 1 → skipped with empty result
			expect(results[1]).toEqual({
				zoneId: 2,
				text: "",
				confidence: 0,
			});
			// Index 2 → success
			expect(results[2]).toEqual({
				zoneId: 3,
				text: "C",
				confidence: 92,
			});
			expect(onWarning).toHaveBeenCalledWith(expect.stringContaining("item 2"));
		});
	});

	describe("backward compatibility", () => {
		it("ZoneInput[] still works with sorting and all existing behavior", async () => {
			const engine = mockEngine([
				{ text: "B", confidence: 85 },
				{ text: "A", confidence: 90 },
			]);

			const zones: ZoneInput[] = [
				{ id: 2, image: dummyImage },
				{ id: 1, image: dummyImage },
			];

			const results = await processZones(zones, { engine });

			// Sorted by ID
			expect(results[0].zoneId).toBe(1);
			expect(results[1].zoneId).toBe(2);
		});

		it("new callbacks are optional", async () => {
			const engine = mockEngine([{ text: "A", confidence: 90 }]);

			// No onItemComplete or onStepChange — should not throw
			const results = await processZones(makeZones(1), { engine });

			expect(results).toHaveLength(1);
		});
	});
});
