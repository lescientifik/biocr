import type { ImageBuffer } from "@/types/index.ts";

/**
 * Computes Otsu's optimal binarization threshold.
 * Assumes grayscale input (uses R channel).
 * Returns 0 if the image is uniform.
 */
export function computeOtsuThreshold(img: ImageBuffer): number {
	const { data } = img;
	const histogram = new Uint32Array(256);
	const pixelCount = data.length / 4;

	for (let i = 0; i < data.length; i += 4) {
		histogram[data[i]]++;
	}

	let sum = 0;
	for (let i = 0; i < 256; i++) {
		sum += i * histogram[i];
	}

	let sumB = 0;
	let wB = 0;
	let maxVariance = 0;
	let threshold = 0;

	for (let t = 0; t < 256; t++) {
		wB += histogram[t];
		if (wB === 0) continue;

		const wF = pixelCount - wB;
		if (wF === 0) break;

		sumB += t * histogram[t];
		const meanB = sumB / wB;
		const meanF = (sum - sumB) / wF;
		const variance = wB * wF * (meanB - meanF) * (meanB - meanF);

		if (variance > maxVariance) {
			maxVariance = variance;
			threshold = t;
		}
	}

	return threshold;
}

/** Binarizes a grayscale image using Otsu's method. All output pixels are 0 or 255. */
export function otsuBinarize(img: ImageBuffer): ImageBuffer {
	const threshold = computeOtsuThreshold(img);
	const { data, width, height } = img;
	const out = new Uint8ClampedArray(data.length);

	for (let i = 0; i < data.length; i += 4) {
		const val = data[i] >= threshold ? 255 : 0;
		out[i] = val;
		out[i + 1] = val;
		out[i + 2] = val;
		out[i + 3] = data[i + 3];
	}

	return { data: out, width, height };
}
