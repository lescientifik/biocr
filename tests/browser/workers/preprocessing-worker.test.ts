import type { PipelineResult } from "@/lib/preprocessing/pipeline.ts";
import type { ImageBuffer } from "@/types/index.ts";
import { describe, expect, it } from "vitest";

/**
 * Helper: creates a small RGBA ImageBuffer filled with a single colour.
 */
function makeImageBuffer(
	width: number,
	height: number,
	r: number,
	g: number,
	b: number,
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

/**
 * Posts an ImageBuffer to the preprocessing worker using the { image, options } format
 * and awaits the result.
 */
function runWorker(
	input: ImageBuffer,
	options?: { estimatedDPI?: number },
): Promise<PipelineResult> {
	return new Promise((resolve, reject) => {
		const worker = new Worker(
			new URL("@/workers/preprocessing.worker.ts", import.meta.url),
			{ type: "module" },
		);

		worker.onmessage = (e: MessageEvent<PipelineResult>) => {
			resolve(e.data);
			worker.terminate();
		};
		worker.onerror = (e) => {
			reject(e);
			worker.terminate();
		};

		const buffer = input.data.buffer as ArrayBuffer;
		worker.postMessage({ image: input, options }, [buffer]);
	});
}

describe("Preprocessing Worker", () => {
	it("receives { image, options } and returns preprocessed ImageBuffer", async () => {
		const input = makeImageBuffer(4, 4, 120, 80, 40);
		const result = await runWorker(input, { estimatedDPI: 150 });

		expect(result.image).toBeDefined();
		// Pipeline v2 may upscale, so dimensions can be >= input
		expect(result.image.width).toBeGreaterThanOrEqual(4);
		expect(result.image.height).toBeGreaterThanOrEqual(4);
		expect(result.image.data).toBeInstanceOf(Uint8ClampedArray);
		expect(result.image.data.length).toBe(
			result.image.width * result.image.height * 4,
		);
		// Result now uses warnings array
		expect(Array.isArray(result.warnings)).toBe(true);
	});

	it("works without options", async () => {
		const input = makeImageBuffer(4, 4, 120, 80, 40);
		const result = await runWorker(input);

		expect(result.image).toBeDefined();
		expect(result.image.width).toBeGreaterThanOrEqual(4);
		expect(result.image.height).toBeGreaterThanOrEqual(4);
		expect(Array.isArray(result.warnings)).toBe(true);
	});

	it("buffer source is neutered after transfer", async () => {
		const input = makeImageBuffer(4, 4, 100, 100, 100);
		const originalBuffer = input.data.buffer as ArrayBuffer;

		// Transfer ownership to the worker
		const worker = new Worker(
			new URL("@/workers/preprocessing.worker.ts", import.meta.url),
			{ type: "module" },
		);

		await new Promise<void>((resolve) => {
			worker.onmessage = () => {
				resolve();
				worker.terminate();
			};
			worker.postMessage({ image: input }, [originalBuffer]);
		});

		// The original buffer should be neutered (byteLength === 0)
		expect(originalBuffer.byteLength).toBe(0);
	});

	it("returns error for invalid (old) format", async () => {
		const input = makeImageBuffer(4, 4, 200, 200, 200);
		const result = await new Promise<{ error: string }>((resolve) => {
			const worker = new Worker(
				new URL("@/workers/preprocessing.worker.ts", import.meta.url),
				{ type: "module" },
			);
			worker.onmessage = (e: MessageEvent) => {
				resolve(e.data);
				worker.terminate();
			};
			// Send raw ImageBuffer (old format) — should be rejected
			const buffer = input.data.buffer as ArrayBuffer;
			worker.postMessage(input, [buffer]);
		});

		expect(result.error).toBe(
			"Invalid worker input format. Expected { image, options? }.",
		);
	});

	it("returns valid result structure", async () => {
		const input = makeImageBuffer(4, 4, 200, 200, 200);
		const result = await runWorker(input, { estimatedDPI: 300 });

		// Result should always have a valid image and warnings array
		expect(result.image).toBeDefined();
		expect(result.image.width).toBeGreaterThanOrEqual(4);
		expect(result.image.height).toBeGreaterThanOrEqual(4);
		expect(result.image.data.length).toBe(
			result.image.width * result.image.height * 4,
		);
		expect(Array.isArray(result.warnings)).toBe(true);
	});
});
