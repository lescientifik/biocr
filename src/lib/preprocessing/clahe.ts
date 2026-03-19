import type { ImageBuffer } from "@/types/index.ts";

/**
 * Contrast Limited Adaptive Histogram Equalization (CLAHE).
 * Grid: 8×8 tiles. Clip limit: 2.0.
 * Requires image dimensions ≥ 64×64.
 * Operates on grayscale (R channel).
 */
export function clahe(
	img: ImageBuffer,
	gridX = 8,
	gridY = 8,
	clipLimit = 2.0,
): ImageBuffer {
	const { data, width, height } = img;

	// Guard: if the image is smaller than the grid, return unchanged
	if (width < gridX || height < gridY) {
		return img;
	}

	const out = new Uint8ClampedArray(data.length);

	const tileW = Math.floor(width / gridX);
	const tileH = Math.floor(height / gridY);

	// Compute clipped & equalized LUT for each tile
	const tileLuts: Uint8Array[][] = [];

	for (let ty = 0; ty < gridY; ty++) {
		tileLuts[ty] = [];
		for (let tx = 0; tx < gridX; tx++) {
			const startX = tx * tileW;
			const startY = ty * tileH;
			const endX = tx === gridX - 1 ? width : startX + tileW;
			const endY = ty === gridY - 1 ? height : startY + tileH;
			const tilePixels = (endX - startX) * (endY - startY);

			// Build histogram for this tile
			const hist = new Uint32Array(256);
			for (let y = startY; y < endY; y++) {
				for (let x = startX; x < endX; x++) {
					hist[data[(y * width + x) * 4]]++;
				}
			}

			// Clip histogram
			const limit = Math.max(1, Math.floor(clipLimit * (tilePixels / 256)));
			let excess = 0;
			for (let i = 0; i < 256; i++) {
				if (hist[i] > limit) {
					excess += hist[i] - limit;
					hist[i] = limit;
				}
			}
			// Redistribute excess
			const avgInc = Math.floor(excess / 256);
			const remainder = excess - avgInc * 256;
			for (let i = 0; i < 256; i++) {
				hist[i] += avgInc;
				if (i < remainder) hist[i]++;
			}

			// Build CDF → LUT
			const lut = new Uint8Array(256);
			let cdf = 0;
			for (let i = 0; i < 256; i++) {
				cdf += hist[i];
				lut[i] = Math.round((cdf / tilePixels) * 255);
			}
			tileLuts[ty][tx] = lut;
		}
	}

	// Bilinear interpolation between tile LUTs
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const idx = (y * width + x) * 4;
			const val = data[idx];

			// Which tile center is closest?
			const fx = x / tileW - 0.5;
			const fy = y / tileH - 0.5;

			const tx0 = Math.max(0, Math.min(gridX - 1, Math.floor(fx)));
			const ty0 = Math.max(0, Math.min(gridY - 1, Math.floor(fy)));
			const tx1 = Math.min(gridX - 1, tx0 + 1);
			const ty1 = Math.min(gridY - 1, ty0 + 1);

			const ax = Math.max(0, Math.min(1, fx - tx0));
			const ay = Math.max(0, Math.min(1, fy - ty0));

			const v00 = tileLuts[ty0][tx0][val];
			const v10 = tileLuts[ty0][tx1][val];
			const v01 = tileLuts[ty1][tx0][val];
			const v11 = tileLuts[ty1][tx1][val];

			const result = Math.round(
				v00 * (1 - ax) * (1 - ay) +
					v10 * ax * (1 - ay) +
					v01 * (1 - ax) * ay +
					v11 * ax * ay,
			);

			out[idx] = result;
			out[idx + 1] = result;
			out[idx + 2] = result;
			out[idx + 3] = data[idx + 3];
		}
	}

	return { data: out, width, height };
}
