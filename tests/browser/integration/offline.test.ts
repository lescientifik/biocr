import { recognize, terminate } from "@/lib/ocr-engine.ts";
import { preprocessingPipeline } from "@/lib/preprocessing/pipeline.ts";
import type { ImageBuffer } from "@/types/index.ts";
import { afterEach, describe, expect, it } from "vitest";

/**
 * Creates a test ImageBuffer by rendering text on a real canvas.
 */
function makeTestImageBuffer(text: string): {
	buffer: ImageBuffer;
	canvas: HTMLCanvasElement;
} {
	const canvas = document.createElement("canvas");
	canvas.width = 200;
	canvas.height = 200;
	// biome-ignore lint/style/noNonNullAssertion: 2d context always available
	const ctx = canvas.getContext("2d")!;
	ctx.fillStyle = "white";
	ctx.fillRect(0, 0, 200, 200);
	ctx.fillStyle = "black";
	ctx.font = "bold 40px serif";
	ctx.textBaseline = "middle";
	ctx.fillText(text, 10, 100);

	const imageData = ctx.getImageData(0, 0, 200, 200);
	return {
		buffer: { data: imageData.data, width: 200, height: 200 },
		canvas,
	};
}

/**
 * Converts an ImageBuffer to a canvas for Tesseract.
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

describe("Offline guarantee", () => {
	afterEach(async () => {
		await terminate();
	});

	it("15 — full workflow succeeds with external fetch blocked", async () => {
		const originalFetch = window.fetch;
		const fetchCalls: string[] = [];

		// Mock fetch: allow local requests, reject external ones
		window.fetch = (async (
			input: RequestInfo | URL,
			init?: RequestInit,
		): Promise<Response> => {
			const url =
				typeof input === "string"
					? input
					: input instanceof URL
						? input.toString()
						: input.url;
			fetchCalls.push(url);

			// Allow same-origin / relative requests (local assets)
			if (url.startsWith("/") || url.startsWith(window.location.origin)) {
				return originalFetch(input, init);
			}

			// Block any external request
			throw new TypeError(`Network request blocked (offline test): ${url}`);
		}) as typeof window.fetch;

		try {
			// 1. Create an image
			const { buffer } = makeTestImageBuffer("Offline");

			// 2. Preprocess (pipeline v2 may upscale)
			const { image: preprocessed } = preprocessingPipeline(buffer);
			expect(preprocessed.width).toBeGreaterThanOrEqual(200);
			expect(preprocessed.height).toBeGreaterThanOrEqual(200);

			// 3. OCR (uses local WASM + traineddata from public/)
			const ocrCanvas = imageBufferToCanvas(preprocessed);
			const result = await recognize(ocrCanvas);

			// 4. Verify no crash, result returned
			expect(result.text).toBeDefined();
			expect(result.confidence).toBeGreaterThanOrEqual(0);

			// 5. Verify no external requests were made
			const externalCalls = fetchCalls.filter(
				(url) =>
					!url.startsWith("/") && !url.startsWith(window.location.origin),
			);
			expect(externalCalls).toHaveLength(0);
		} finally {
			window.fetch = originalFetch;
		}
	}, 30_000);
});
