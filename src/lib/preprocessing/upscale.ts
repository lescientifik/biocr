import type { ImageBuffer } from "@/types/index.ts";

/**
 * Estimates the DPI of an image based on natural vs CSS dimensions.
 * PDF: (naturalWidth / cssWidth) * 72
 * Image: (naturalWidth / cssWidth) * 96
 */
export function estimateDPI(
	naturalWidth: number,
	cssWidth: number,
	isPdf: boolean,
): number {
	const ratio = naturalWidth / cssWidth;
	return ratio * (isPdf ? 72 : 96);
}

/**
 * Computes the upscale factor to reach 300 DPI.
 * Clamped to [1.0, 4.0].
 */
export function computeUpscaleFactor(estimatedDPI: number): number {
	return Math.min(4.0, Math.max(1.0, 300 / estimatedDPI));
}

/**
 * Upscales an image using bilinear interpolation.
 * Returns same reference if factor <= 1.
 */
export function upscale(img: ImageBuffer, factor: number): ImageBuffer {
	if (factor <= 1) return img;

	const newW = Math.round(img.width * factor);
	const newH = Math.round(img.height * factor);
	const out = new Uint8ClampedArray(newW * newH * 4);

	for (let dy = 0; dy < newH; dy++) {
		for (let dx = 0; dx < newW; dx++) {
			// Map destination pixel center back to source coordinates
			const sx = (dx + 0.5) / factor - 0.5;
			const sy = (dy + 0.5) / factor - 0.5;

			const x0 = Math.floor(sx);
			const y0 = Math.floor(sy);
			const x1 = Math.min(x0 + 1, img.width - 1);
			const y1 = Math.min(y0 + 1, img.height - 1);

			const fx = sx - x0;
			const fy = sy - y0;

			const sx0 = Math.max(0, x0);
			const sy0 = Math.max(0, y0);

			const i00 = (sy0 * img.width + sx0) * 4;
			const i10 = (sy0 * img.width + x1) * 4;
			const i01 = (y1 * img.width + sx0) * 4;
			const i11 = (y1 * img.width + x1) * 4;

			const outIdx = (dy * newW + dx) * 4;
			for (let c = 0; c < 4; c++) {
				const v00 = img.data[i00 + c];
				const v10 = img.data[i10 + c];
				const v01 = img.data[i01 + c];
				const v11 = img.data[i11 + c];

				out[outIdx + c] = Math.round(
					v00 * (1 - fx) * (1 - fy) +
						v10 * fx * (1 - fy) +
						v01 * (1 - fx) * fy +
						v11 * fx * fy,
				);
			}
		}
	}

	return { data: out, width: newW, height: newH };
}
