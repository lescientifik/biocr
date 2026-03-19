import { deskew, detectSkewAngle } from "@/lib/preprocessing/deskew.ts";
import type { ImageBuffer } from "@/types/index.ts";
import { describe, expect, it } from "vitest";

/** Creates a white RGBA ImageBuffer of given dimensions. */
function whiteImage(w: number, h: number): ImageBuffer {
	const data = new Uint8ClampedArray(w * h * 4);
	data.fill(255);
	return { data, width: w, height: h };
}

/**
 * Creates a white image with black horizontal lines tilted at `angleDeg` degrees.
 * Lines are spaced every `spacing` pixels vertically.
 * Uses y = y0 + x * tan(angle) to draw tilted lines with 2px thickness.
 */
function tiltedLinesImage(
	w: number,
	h: number,
	angleDeg: number,
	spacing = 20,
): ImageBuffer {
	const img = whiteImage(w, h);
	const { data } = img;
	const tanA = Math.tan((angleDeg * Math.PI) / 180);

	for (let lineY = spacing; lineY < h - spacing; lineY += spacing) {
		for (let x = 0; x < w; x++) {
			const y = Math.round(lineY + x * tanA);
			// Draw 2px thick line
			for (let dy = -1; dy <= 1; dy++) {
				const py = y + dy;
				if (py >= 0 && py < h) {
					const idx = (py * w + x) * 4;
					data[idx] = 0;
					data[idx + 1] = 0;
					data[idx + 2] = 0;
					// alpha stays 255
				}
			}
		}
	}

	return img;
}

describe("detectSkewAngle", () => {
	it("detects ~3° skew on tilted horizontal lines", () => {
		const img = tiltedLinesImage(300, 300, 3);
		const angle = detectSkewAngle(img);
		expect(angle).toBeGreaterThanOrEqual(2.5);
		expect(angle).toBeLessThanOrEqual(3.5);
	});

	it("detects ~0° on straight horizontal lines", () => {
		const img = tiltedLinesImage(300, 300, 0);
		const angle = detectSkewAngle(img);
		expect(Math.abs(angle)).toBeLessThanOrEqual(0.5);
	});

	it("returns 0° on uniform white image", () => {
		const img = whiteImage(200, 200);
		const angle = detectSkewAngle(img);
		expect(angle).toBe(0);
	});

	it("searches range [-15°, +15°] in 0.1° steps", () => {
		// A 5° tilt should be detected accurately within the range
		const img = tiltedLinesImage(300, 300, 5);
		const angle = detectSkewAngle(img);
		expect(angle).toBeGreaterThanOrEqual(4.5);
		expect(angle).toBeLessThanOrEqual(5.5);

		// Negative angle too
		const imgNeg = tiltedLinesImage(300, 300, -5);
		const angleNeg = detectSkewAngle(imgNeg);
		expect(angleNeg).toBeGreaterThanOrEqual(-5.5);
		expect(angleNeg).toBeLessThanOrEqual(-4.5);
	});
});

describe("deskew", () => {
	it("rotates image when angle > 0.5° and returns new dimensions with white borders", () => {
		const img = tiltedLinesImage(300, 300, 3);
		const result = deskew(img);

		// Should NOT be the same reference (rotation applied)
		expect(result).not.toBe(img);

		// Rotated image should have different or equal dimensions (bounding box grows)
		expect(result.width).toBeGreaterThanOrEqual(img.width);
		expect(result.height).toBeGreaterThanOrEqual(img.height);

		// Corner pixels should be white (border fill)
		const topLeft = 0;
		expect(result.data[topLeft]).toBe(255);
		expect(result.data[topLeft + 1]).toBe(255);
		expect(result.data[topLeft + 2]).toBe(255);
		expect(result.data[topLeft + 3]).toBe(255);
	});

	it("returns same reference when angle < 0.5°", () => {
		const img = tiltedLinesImage(300, 300, 0);
		const result = deskew(img);
		expect(result).toBe(img);
	});

	it("returns same reference when detected angle is at boundary (>= 15°)", () => {
		// Create an image with very heavy skew (20°).
		// The detector searches [-15, +15], so it will find peak near ±15° boundary.
		// Since |angle| >= 15, deskew should return same reference.
		const img = tiltedLinesImage(300, 300, 20);
		const result = deskew(img);
		expect(result).toBe(img);
	});
});
