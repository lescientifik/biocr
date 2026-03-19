import {
	computeUpscaleFactor,
	estimateDPI,
	upscale,
} from "@/lib/preprocessing/upscale.ts";
import type { ImageBuffer } from "@/types/index.ts";
import { describe, expect, it } from "vitest";

describe("estimateDPI", () => {
	it("PDF naturalWidth=918, cssWidth=612 → DPI ≈ 108", () => {
		expect(estimateDPI(918, 612, true)).toBeCloseTo(108, 0);
	});

	it("image naturalWidth=800, cssWidth=800 → DPI = 96", () => {
		expect(estimateDPI(800, 800, false)).toBe(96);
	});
});

describe("computeUpscaleFactor", () => {
	it("estimatedDPI=150 → factor=2.0", () => {
		expect(computeUpscaleFactor(150)).toBe(2.0);
	});

	it("estimatedDPI=300 → factor=1.0 (no upscale)", () => {
		expect(computeUpscaleFactor(300)).toBe(1.0);
	});

	it("estimatedDPI=72 → factor=4.0 (clamped to max)", () => {
		// 300/72 ≈ 4.17, clamped to 4.0
		expect(computeUpscaleFactor(72)).toBe(4.0);
	});

	it("estimatedDPI=600 → factor=1.0 (clamped to min)", () => {
		// 300/600 = 0.5, clamped to 1.0
		expect(computeUpscaleFactor(600)).toBe(1.0);
	});
});

describe("upscale", () => {
	// Helper to create a simple test image
	function createImage(w: number, h: number): ImageBuffer {
		const data = new Uint8ClampedArray(w * h * 4);
		for (let y = 0; y < h; y++) {
			for (let x = 0; x < w; x++) {
				const i = (y * w + x) * 4;
				// Gradient pattern for interpolation testing
				data[i] = Math.round((x / w) * 255); // R: horizontal gradient
				data[i + 1] = Math.round((y / h) * 255); // G: vertical gradient
				data[i + 2] = 128; // B: constant
				data[i + 3] = 255; // A: opaque
			}
		}
		return { data, width: w, height: h };
	}

	it("factor > 1 → enlarged image (width*factor × height*factor)", () => {
		const img = createImage(10, 10);
		const result = upscale(img, 2.0);
		expect(result.width).toBe(20);
		expect(result.height).toBe(20);
		expect(result.data.length).toBe(20 * 20 * 4);
	});

	it("factor = 1 → same reference returned", () => {
		const img = createImage(10, 10);
		const result = upscale(img, 1.0);
		expect(result).toBe(img);
	});

	it("verifies pixels are interpolated (not nearest-neighbor)", () => {
		// Create a 2x2 image: black top-left, white bottom-right
		const img: ImageBuffer = {
			data: new Uint8ClampedArray([
				0,
				0,
				0,
				255, // (0,0) black
				255,
				255,
				255,
				255, // (1,0) white
				255,
				255,
				255,
				255, // (0,1) white
				0,
				0,
				0,
				255, // (1,1) black
			]),
			width: 2,
			height: 2,
		};
		const result = upscale(img, 4.0);
		// Center pixel should be interpolated (not exactly 0 or 255)
		const cx = Math.floor(result.width / 2);
		const cy = Math.floor(result.height / 2);
		const idx = (cy * result.width + cx) * 4;
		const centerValue = result.data[idx];
		expect(centerValue).toBeGreaterThan(10);
		expect(centerValue).toBeLessThan(245);
	});
});
