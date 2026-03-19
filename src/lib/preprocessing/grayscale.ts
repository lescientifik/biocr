import type { ImageBuffer } from "@/types/index.ts";

/** Converts an RGBA image to grayscale (R=G=B=luminance, A unchanged). */
export function grayscale(img: ImageBuffer): ImageBuffer {
	const { data, width, height } = img;
	const out = new Uint8ClampedArray(data.length);

	for (let i = 0; i < data.length; i += 4) {
		// ITU-R BT.601 luminance
		const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
		out[i] = lum;
		out[i + 1] = lum;
		out[i + 2] = lum;
		out[i + 3] = data[i + 3]; // preserve alpha
	}

	return { data: out, width, height };
}

/** Returns true if the image is already grayscale (R===G===B for all pixels). */
export function isGrayscale(img: ImageBuffer): boolean {
	const { data } = img;
	for (let i = 0; i < data.length; i += 4) {
		if (data[i] !== data[i + 1] || data[i] !== data[i + 2]) {
			return false;
		}
	}
	return true;
}
