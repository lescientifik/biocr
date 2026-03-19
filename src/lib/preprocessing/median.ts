import type { ImageBuffer } from "@/types/index.ts";

/**
 * Applies a 3×3 median filter (grayscale, uses R channel).
 * Border pixels use available neighbors only.
 */
export function medianFilter3x3(img: ImageBuffer): ImageBuffer {
	const { data, width, height } = img;
	const out = new Uint8ClampedArray(data.length);

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const neighbors: number[] = [];

			for (let dy = -1; dy <= 1; dy++) {
				for (let dx = -1; dx <= 1; dx++) {
					const ny = y + dy;
					const nx = x + dx;
					if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
						neighbors.push(data[(ny * width + nx) * 4]);
					}
				}
			}

			neighbors.sort((a, b) => a - b);
			const median = neighbors[Math.floor(neighbors.length / 2)];

			const idx = (y * width + x) * 4;
			out[idx] = median;
			out[idx + 1] = median;
			out[idx + 2] = median;
			out[idx + 3] = data[idx + 3];
		}
	}

	return { data: out, width, height };
}
