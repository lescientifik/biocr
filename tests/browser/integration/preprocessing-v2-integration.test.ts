import { preprocessingPipeline } from "@/lib/preprocessing/pipeline.ts";
import type { ImageBuffer } from "@/types/index.ts";
import { describe, expect, it } from "vitest";

/**
 * Creates a canvas with tilted black lines on a white background,
 * then extracts pixel data as an ImageBuffer.
 */
function makeTiltedTextImage(
	angleDeg: number,
	width = 300,
	height = 300,
): ImageBuffer {
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	// biome-ignore lint/style/noNonNullAssertion: 2d context always available
	const ctx = canvas.getContext("2d")!;
	ctx.fillStyle = "white";
	ctx.fillRect(0, 0, width, height);

	// Draw tilted text lines
	ctx.save();
	ctx.translate(width / 2, height / 2);
	ctx.rotate((angleDeg * Math.PI) / 180);
	ctx.fillStyle = "black";
	ctx.font = "bold 24px serif";
	ctx.textBaseline = "middle";
	ctx.fillText("Glycémie 1.05", -120, -30);
	ctx.fillText("Cholestérol 2.1", -120, 10);
	ctx.fillText("Hémoglobine 14", -120, 50);
	ctx.restore();

	const imageData = ctx.getImageData(0, 0, width, height);
	return { data: imageData.data, width, height };
}

/**
 * Creates a small low-resolution image to test upscaling.
 */
function makeLowResImage(width = 80, height = 80): ImageBuffer {
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	// biome-ignore lint/style/noNonNullAssertion: 2d context always available
	const ctx = canvas.getContext("2d")!;
	ctx.fillStyle = "white";
	ctx.fillRect(0, 0, width, height);
	ctx.fillStyle = "black";
	ctx.font = "bold 14px serif";
	ctx.textBaseline = "middle";
	ctx.fillText("Test", 5, height / 2);

	const imageData = ctx.getImageData(0, 0, width, height);
	return { data: imageData.data, width, height };
}

describe("Preprocessing v2 — browser integration", () => {
	it("tilted image → deskew corrects, pipeline completes", () => {
		const img = makeTiltedTextImage(3);
		const { image, warnings } = preprocessingPipeline(img);

		// Pipeline should complete without critical failures
		expect(image.data.length).toBeGreaterThan(0);
		expect(image.width).toBeGreaterThanOrEqual(img.width);
		expect(image.height).toBeGreaterThanOrEqual(img.height);
		// No critical warnings expected
		expect(warnings.filter((w) => w.includes("failed")).length).toBe(0);
	});

	it("low-resolution image → upscale enlarges", () => {
		const img = makeLowResImage(80, 80);
		// With default estimatedDPI=150, factor=2.0
		const { image } = preprocessingPipeline(img);

		// Upscale should increase dimensions
		expect(image.width).toBeGreaterThan(img.width);
		expect(image.height).toBeGreaterThan(img.height);
	});

	it("pipeline v2 produces grayscale output (not binary)", () => {
		const img = makeTiltedTextImage(0, 200, 200);
		const { image } = preprocessingPipeline(img);

		// Output should be grayscale (R === G === B for all pixels)
		for (let i = 0; i < Math.min(image.data.length, 400); i += 4) {
			expect(image.data[i]).toBe(image.data[i + 1]);
			expect(image.data[i]).toBe(image.data[i + 2]);
		}

		// Should have intermediate values (not just 0 and 255 = binary)
		let hasIntermediate = false;
		for (let i = 0; i < image.data.length; i += 4) {
			if (image.data[i] > 0 && image.data[i] < 255) {
				hasIntermediate = true;
				break;
			}
		}
		expect(hasIntermediate).toBe(true);
	});
});
