import { ProxyDestroyedError } from "@/lib/errors.ts";
import {
	type CoordinatorOptions,
	type OcrEngine,
	type ZoneProvider,
	processZones,
} from "@/lib/ocr-coordinator.ts";
import {
	preprocessInWorker,
	terminatePreprocessWorker,
} from "@/lib/preprocessing/worker-wrapper.ts";
import type { ImageBuffer } from "@/types/index.ts";
import type { OcrZoneResult } from "@/types/ocr.ts";
import { afterEach, describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a small RGBA ImageBuffer filled with a solid colour. */
function makeImageBuffer(
	width: number,
	height: number,
	r = 120,
	g = 80,
	b = 40,
): ImageBuffer {
	const data = new Uint8ClampedArray(width * height * 4);
	for (let i = 0; i < data.length; i += 4) {
		data[i] = r;
		data[i + 1] = g;
		data[i + 2] = b;
		data[i + 3] = 255;
	}
	return { data, width, height };
}

/** Creates a test ImageBuffer by rendering text on a real canvas. */
function makeTestImageBuffer(
	text: string,
	size = 200,
): { buffer: ImageBuffer; canvas: HTMLCanvasElement } {
	const canvas = document.createElement("canvas");
	canvas.width = size;
	canvas.height = size;
	// biome-ignore lint/style/noNonNullAssertion: 2d context always available
	const ctx = canvas.getContext("2d")!;
	ctx.fillStyle = "white";
	ctx.fillRect(0, 0, size, size);
	ctx.fillStyle = "black";
	ctx.font = "bold 40px serif";
	ctx.textBaseline = "middle";
	ctx.fillText(text, 10, size / 2);

	const imageData = ctx.getImageData(0, 0, size, size);
	return {
		buffer: { data: imageData.data, width: size, height: size },
		canvas,
	};
}

/** Mock OCR engine that returns deterministic text based on image dimensions. */
function createMockEngine(): OcrEngine {
	return {
		async recognize(
			image: ImageBuffer,
			onProgress?: (p: number) => void,
		): Promise<{ text: string; confidence: number }> {
			onProgress?.(0.5);
			onProgress?.(1.0);
			return { text: `text-${image.width}`, confidence: 90 };
		},
	};
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("OCR UX Responsiveness", () => {
	afterEach(() => {
		terminatePreprocessWorker();
	});

	// 1. Worker preprocessing
	it("worker preprocessing: image preprocessed via worker, result non-empty", async () => {
		const input = makeImageBuffer(100, 100);
		const result = await preprocessInWorker(input);

		expect(result.width).toBeGreaterThanOrEqual(1);
		expect(result.height).toBeGreaterThanOrEqual(1);
		expect(result.data.length).toBe(result.width * result.height * 4);
		// The result should have actual pixel data (not all zeros)
		const hasNonZero = result.data.some((v) => v > 0);
		expect(hasNonZero).toBe(true);
	});

	// 2. Page-par-page simulation via ZoneProvider
	it("ZoneProvider with 2 items returns both results in order", async () => {
		const { buffer: buf1 } = makeTestImageBuffer("A");
		const { buffer: buf2 } = makeTestImageBuffer("B");

		const provider: ZoneProvider = {
			count: 2,
			getZone: async (index: number) => {
				if (index === 0) return { id: 1, image: buf1 };
				return { id: 2, image: buf2 };
			},
		};

		const engine = createMockEngine();
		const results = await processZones(provider, { engine });

		expect(results).toHaveLength(2);
		expect(results[0].zoneId).toBe(1);
		expect(results[1].zoneId).toBe(2);
		expect(results[0].text).toContain("text-");
		expect(results[1].text).toContain("text-");
	});

	// 3. Partial results: onItemComplete fires for each completed item
	it("onItemComplete fires sequentially with correct zoneIds", async () => {
		const { buffer: buf1 } = makeTestImageBuffer("X");
		const { buffer: buf2 } = makeTestImageBuffer("Y");
		const { buffer: buf3 } = makeTestImageBuffer("Z");

		const provider: ZoneProvider = {
			count: 3,
			getZone: async (index: number) => {
				const buffers = [buf1, buf2, buf3];
				return { id: index + 10, image: buffers[index] };
			},
		};

		const completed: OcrZoneResult[] = [];
		const engine = createMockEngine();

		await processZones(provider, {
			engine,
			onItemComplete: (result) => completed.push(result),
		});

		expect(completed).toHaveLength(3);
		expect(completed[0].zoneId).toBe(10);
		expect(completed[1].zoneId).toBe(11);
		expect(completed[2].zoneId).toBe(12);
	});

	// 4. ProgressBar step: onStepChange alternates between preprocessing and recognizing
	it("onStepChange alternates between preprocessing and recognizing", async () => {
		const { buffer: buf1 } = makeTestImageBuffer("S1");
		const { buffer: buf2 } = makeTestImageBuffer("S2");

		const provider: ZoneProvider = {
			count: 2,
			getZone: async (index: number) => {
				const buffers = [buf1, buf2];
				return { id: index + 1, image: buffers[index] };
			},
		};

		const steps: string[] = [];
		const engine = createMockEngine();
		const preprocess = async (image: ImageBuffer) => image;

		await processZones(provider, {
			engine,
			preprocess,
			onStepChange: (step) => steps.push(step),
		});

		expect(steps).toEqual([
			"preprocessing",
			"recognizing",
			"preprocessing",
			"recognizing",
		]);
	});

	// 5. Cancel partial: abort after 1 item returns partial results
	it("abort after 1 item returns partial results", async () => {
		const { buffer: buf1 } = makeTestImageBuffer("P1");
		const { buffer: buf2 } = makeTestImageBuffer("P2");
		const { buffer: buf3 } = makeTestImageBuffer("P3");

		const provider: ZoneProvider = {
			count: 3,
			getZone: async (index: number) => {
				const buffers = [buf1, buf2, buf3];
				return { id: index + 1, image: buffers[index] };
			},
		};

		const controller = new AbortController();
		const engine = createMockEngine();

		const results = await processZones(provider, {
			engine,
			signal: controller.signal,
			onItemComplete: (result) => {
				// Abort after the first item completes
				if (result.zoneId === 1) {
					controller.abort();
				}
			},
		});

		// Only the first item should be in results (abort checked before item 2)
		expect(results).toHaveLength(1);
		expect(results[0].zoneId).toBe(1);
	});

	// 6. Worker survives cancel: after cancellation, preprocessInWorker still works
	it("worker survives cancel and subsequent calls succeed", async () => {
		const input1 = makeImageBuffer(50, 50);
		const result1 = await preprocessInWorker(input1);
		expect(result1.width).toBeGreaterThanOrEqual(1);

		// Terminate (simulates cancel cleanup)
		terminatePreprocessWorker();

		// A new call should still succeed (worker gets recreated)
		const input2 = makeImageBuffer(60, 60);
		const result2 = await preprocessInWorker(input2);
		expect(result2.width).toBeGreaterThanOrEqual(1);
		expect(result2.data.length).toBe(result2.width * result2.height * 4);
	});

	// 7. ProxyDestroyedError path: getZone throws → loop stops, partial results preserved
	it("ProxyDestroyedError stops loop and preserves partial results", async () => {
		const { buffer: buf1 } = makeTestImageBuffer("OK");

		const provider: ZoneProvider = {
			count: 3,
			getZone: async (index: number) => {
				if (index === 0) return { id: 1, image: buf1 };
				// Second call throws ProxyDestroyedError
				throw new ProxyDestroyedError();
			},
		};

		const engine = createMockEngine();
		const results = await processZones(provider, { engine });

		// Only the first zone result should be present
		expect(results).toHaveLength(1);
		expect(results[0].zoneId).toBe(1);
		expect(results[0].text).toContain("text-");
	});
});
