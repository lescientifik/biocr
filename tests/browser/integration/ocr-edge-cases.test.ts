import { type OcrEngine, processZones } from "@/lib/ocr-coordinator.ts";
import { getEngine, recognize, terminate } from "@/lib/ocr-engine.ts";
import { preprocessingPipeline } from "@/lib/preprocessing/pipeline.ts";
import { useZoneStore } from "@/store/zone-store.ts";
import type { ImageBuffer } from "@/types/index.ts";
import { afterEach, describe, expect, it } from "vitest";

/**
 * Creates a test ImageBuffer by rendering text on a real canvas.
 */
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

/**
 * Converts an ImageBuffer into a canvas element suitable for Tesseract.js.
 */
function imageBufferToCanvas(img: ImageBuffer): HTMLCanvasElement {
	const canvas = document.createElement("canvas");
	canvas.width = img.width;
	canvas.height = img.height;
	// biome-ignore lint/style/noNonNullAssertion: 2d context always available
	const ctx = canvas.getContext("2d")!;
	const imageData = new ImageData(
		new Uint8ClampedArray(img.data),
		img.width,
		img.height,
	);
	ctx.putImageData(imageData, 0, 0);
	return canvas;
}

/**
 * Builds a simple OCR engine adapter that uses real Tesseract via the canvas path.
 */
function makeRealEngine(): OcrEngine {
	return {
		async recognize(
			image: ImageBuffer,
			onProgress?: (p: number) => void,
		): Promise<{ text: string; confidence: number }> {
			const canvas = imageBufferToCanvas(image);
			const result = await recognize(canvas);
			onProgress?.(1);
			return result;
		},
	};
}

describe("OCR edge cases", () => {
	afterEach(async () => {
		await terminate();
		useZoneStore.getState().reset();
	});

	it("10 — OCR replaces previous results on re-run", async () => {
		const engine = makeRealEngine();

		const { buffer: buf1 } = makeTestImageBuffer("AB");
		const { buffer: buf2 } = makeTestImageBuffer("CD");
		const { buffer: buf3 } = makeTestImageBuffer("EF");

		// First run: 2 zones
		const firstResults = await processZones(
			[
				{ id: 1, image: buf1 },
				{ id: 2, image: buf2 },
			],
			{ engine },
		);

		expect(firstResults).toHaveLength(2);
		expect(firstResults[0].zoneId).toBe(1);
		expect(firstResults[1].zoneId).toBe(2);

		// Second run: 3 zones (simulates adding a zone and re-running)
		const secondResults = await processZones(
			[
				{ id: 1, image: buf1 },
				{ id: 2, image: buf2 },
				{ id: 3, image: buf3 },
			],
			{ engine },
		);

		expect(secondResults).toHaveLength(3);
		expect(secondResults[0].zoneId).toBe(1);
		expect(secondResults[1].zoneId).toBe(2);
		expect(secondResults[2].zoneId).toBe(3);
		// Second results are independent — not appended to firstResults
		expect(secondResults).not.toBe(firstResults);
	}, 30_000);

	it("11 — delete all zones then OCR global (full document)", async () => {
		const store = useZoneStore.getState();

		// Create zones then clear them
		store.addZone({ left: 0, top: 0, width: 50, height: 50 });
		store.addZone({ left: 60, top: 0, width: 50, height: 50 });
		expect(useZoneStore.getState().zones).toHaveLength(2);

		store.clearZones();
		expect(useZoneStore.getState().zones).toHaveLength(0);

		// Run OCR without zones (global/full document) — single zone covering entire image
		const engine = makeRealEngine();
		const { buffer } = makeTestImageBuffer("Hello");
		const results = await processZones([{ id: 0, image: buffer }], {
			engine,
		});

		expect(results).toHaveLength(1);
		expect(results[0].zoneId).toBe(0);
		expect(results[0].confidence).toBeGreaterThanOrEqual(0);
	}, 30_000);

	it("12 — zone store operations work while processZones is running concurrently", async () => {
		const engine = makeRealEngine();
		const { buffer } = makeTestImageBuffer("Test");

		// Start OCR (will take time due to real Tesseract)
		const ocrPromise = processZones([{ id: 1, image: buffer }], { engine });

		// While OCR is running, manipulate the zone store
		const store = useZoneStore.getState();
		const zone = store.addZone({ left: 0, top: 0, width: 100, height: 100 });
		expect(useZoneStore.getState().zones).toHaveLength(1);

		store.selectZone(zone.id);
		expect(useZoneStore.getState().selectedZoneId).toBe(zone.id);

		store.addZone({ left: 110, top: 0, width: 50, height: 50 });
		expect(useZoneStore.getState().zones).toHaveLength(2);

		// OCR should still complete normally
		const results = await ocrPromise;
		expect(results).toHaveLength(1);
		expect(results[0].text).toBeDefined();
	}, 30_000);

	it("13 — OCR worker crash then recovery via getEngine", async () => {
		// Create a worker and verify it works
		const worker1 = await getEngine();
		expect(worker1).toBeDefined();

		// Terminate the worker (simulating crash)
		await terminate();

		// Get a new engine — should create a fresh worker
		const worker2 = await getEngine();
		expect(worker2).toBeDefined();

		// Verify the new worker functions correctly
		const { canvas } = makeTestImageBuffer("OK");
		const result = await recognize(canvas);
		expect(result.text).toBeDefined();
		expect(result.confidence).toBeGreaterThanOrEqual(0);
	}, 30_000);

	it("14 — preprocessing crash during multi-zones calls onWarning", async () => {
		const engine = makeRealEngine();
		const { buffer: buf1 } = makeTestImageBuffer("Zone1");
		const { buffer: buf2 } = makeTestImageBuffer("Zone2");
		const warnings: string[] = [];

		let preprocessCallCount = 0;
		const flakyPreprocess = async (
			image: ImageBuffer,
		): Promise<ImageBuffer> => {
			preprocessCallCount++;
			if (preprocessCallCount === 1) {
				throw new Error("Preprocessing crash on zone 1");
			}
			// Succeeds on second call
			const { image: processed } = preprocessingPipeline(image);
			return processed;
		};

		const results = await processZones(
			[
				{ id: 1, image: buf1 },
				{ id: 2, image: buf2 },
			],
			{
				engine,
				preprocess: flakyPreprocess,
				onWarning: (msg) => warnings.push(msg),
			},
		);

		// Both zones should produce results
		expect(results).toHaveLength(2);
		expect(results[0].zoneId).toBe(1);
		expect(results[1].zoneId).toBe(2);

		// Zone 1 used raw image (preprocessing crashed) — onWarning was called
		expect(warnings.length).toBeGreaterThanOrEqual(1);
		expect(warnings.some((w) => w.includes("zone 1"))).toBe(true);

		// Zone 2 should have completed normally
		expect(results[1].confidence).toBeGreaterThanOrEqual(0);
	}, 30_000);
});
