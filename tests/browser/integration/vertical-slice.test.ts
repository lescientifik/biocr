import { recognize, terminate } from "@/lib/ocr-engine.ts";
import { preprocessingPipeline } from "@/lib/preprocessing/pipeline.ts";
import type { ImageBuffer } from "@/types/index.ts";
import { afterEach, describe, expect, it } from "vitest";

/**
 * Creates a 200x200 canvas with black text on a white background,
 * then extracts pixel data as an ImageBuffer.
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
	const buffer: ImageBuffer = {
		data: imageData.data,
		width: 200,
		height: 200,
	};
	return { buffer, canvas };
}

/**
 * Paints an ImageBuffer back onto a canvas suitable for Tesseract.js.
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

describe("Vertical slice — full pipeline without UI", () => {
	afterEach(async () => {
		await terminate();
	});

	it("preprocessing + OCR produces non-empty text without crashing", async () => {
		// 1. Create a 200x200 ImageBuffer with black text on white
		const { buffer } = makeTestImageBuffer("Test");

		// 2. Define a zone covering the entire image (the full buffer is the zone)
		// 3. Run preprocessing pipeline (upscale may change dimensions)
		const { image: preprocessed } = preprocessingPipeline(buffer);
		expect(preprocessed.width).toBeGreaterThanOrEqual(200);
		expect(preprocessed.height).toBeGreaterThanOrEqual(200);

		// 4. Convert preprocessed buffer to canvas for Tesseract
		const ocrCanvas = imageBufferToCanvas(preprocessed);

		// 5. Run real Tesseract OCR
		const result = await recognize(ocrCanvas);

		// 6. Assert non-empty result, no crash
		expect(result.text.trim().length).toBeGreaterThan(0);
		expect(result.confidence).toBeGreaterThanOrEqual(0);
		expect(result.confidence).toBeLessThanOrEqual(100);
	}, 30_000);
});
