import {
	INPUT_SIZE,
	type LetterboxResult,
	letterbox,
} from "@/lib/layout-detection/yolo-preprocess.ts";
import { describe, expect, it } from "vitest";

function makeImageData(
	width: number,
	height: number,
	r = 255,
	g = 0,
	b = 0,
	a = 255,
): { data: Uint8ClampedArray; width: number; height: number } {
	const data = new Uint8ClampedArray(width * height * 4);
	for (let i = 0; i < width * height; i++) {
		data[i * 4] = r;
		data[i * 4 + 1] = g;
		data[i * 4 + 2] = b;
		data[i * 4 + 3] = a;
	}
	return { data, width, height };
}

describe("letterbox", () => {
	it("returns a Float32Array tensor of correct length (1*3*640*640)", () => {
		const image = makeImageData(100, 100);
		const result = letterbox(image);
		expect(result.tensor).toBeInstanceOf(Float32Array);
		expect(result.tensor.length).toBe(1 * 3 * 640 * 640);
	});

	it("computes correct scale, newWidth, newHeight for portrait image (1240x1754)", () => {
		const image = makeImageData(1240, 1754);
		const result = letterbox(image);

		const expectedScale = Math.min(640 / 1240, 640 / 1754);
		expect(result.scale).toBeCloseTo(expectedScale, 6);
		expect(result.newWidth).toBe(Math.round(1240 * expectedScale));
		expect(result.newHeight).toBe(Math.round(1754 * expectedScale));
		expect(result.origWidth).toBe(1240);
		expect(result.origHeight).toBe(1754);
	});

	it("computes scale=1 and no padding for square 640x640 image", () => {
		const image = makeImageData(640, 640);
		const result = letterbox(image);

		expect(result.scale).toBeCloseTo(1, 6);
		expect(result.newWidth).toBe(640);
		expect(result.newHeight).toBe(640);
		expect(result.origWidth).toBe(640);
		expect(result.origHeight).toBe(640);
	});

	it("computes correct dimensions for landscape image (200x100)", () => {
		const image = makeImageData(200, 100);
		const result = letterbox(image);

		const expectedScale = Math.min(640 / 200, 640 / 100);
		expect(result.scale).toBeCloseTo(expectedScale, 6);
		expect(result.newWidth).toBe(Math.round(200 * expectedScale));
		expect(result.newHeight).toBe(Math.round(100 * expectedScale));
		// newWidth should be 640, newHeight should be 320 → vertical padding at bottom
		expect(result.newWidth).toBe(640);
		expect(result.newHeight).toBe(320);
	});

	it("fills padding pixels with gray (114/255)", () => {
		const image = makeImageData(200, 100);
		const result = letterbox(image);
		const gray = 114 / 255;

		// Padding is bottom-right. For this 200x100 image with scale=3.2,
		// newWidth=640, newHeight=320. Padding starts at y=320.
		// Check a pixel in the padding area (e.g. y=400, x=100)
		const x = 100;
		const y = 400;
		const rVal = result.tensor[0 * 640 * 640 + y * 640 + x];
		const gVal = result.tensor[1 * 640 * 640 + y * 640 + x];
		const bVal = result.tensor[2 * 640 * 640 + y * 640 + x];

		expect(rVal).toBeCloseTo(gray, 4);
		expect(gVal).toBeCloseTo(gray, 4);
		expect(bVal).toBeCloseTo(gray, 4);
	});

	it("writes image pixels in CHW format normalized to [0,1]", () => {
		// Create a 2x2 image with known colors
		const data = new Uint8ClampedArray([
			255,
			0,
			0,
			255, // pixel (0,0): red
			0,
			255,
			0,
			255, // pixel (1,0): green
			0,
			0,
			255,
			255, // pixel (0,1): blue
			128,
			128,
			128,
			255, // pixel (1,1): gray
		]);
		const image = { data, width: 2, height: 2 };
		const result = letterbox(image);

		// Scale = min(640/2, 640/2) = 320
		// newWidth = 640, newHeight = 640
		// Pixel (0,0) in the resized image maps to source (0,0) via nearest neighbor
		const rAt00 = result.tensor[0 * 640 * 640 + 0 * 640 + 0];
		const gAt00 = result.tensor[1 * 640 * 640 + 0 * 640 + 0];
		const bAt00 = result.tensor[2 * 640 * 640 + 0 * 640 + 0];

		expect(rAt00).toBeCloseTo(255 / 255, 4);
		expect(gAt00).toBeCloseTo(0 / 255, 4);
		expect(bAt00).toBeCloseTo(0 / 255, 4);
	});

	it("preserves origWidth and origHeight in the result", () => {
		const image = makeImageData(800, 600);
		const result = letterbox(image);
		expect(result.origWidth).toBe(800);
		expect(result.origHeight).toBe(600);
	});

	it("exports INPUT_SIZE as 640", () => {
		expect(INPUT_SIZE).toBe(640);
	});
});
