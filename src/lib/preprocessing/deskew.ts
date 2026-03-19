import type { ImageBuffer } from "@/types/index.ts";

const MIN_ANGLE = -15;
const MAX_ANGLE = 15;
const SKIP_THRESHOLD = 0.5;

/**
 * Detects the skew angle of an image using horizontal projection variance.
 * Searches [-15°, +15°] in 0.1° steps (coarse-then-fine for performance).
 * Returns the angle in degrees that maximizes horizontal projection variance.
 * Returns 0 for uniform images.
 */
export function detectSkewAngle(img: ImageBuffer): number {
	const { data, width, height } = img;

	// Downsample for performance: max 200px on longest side
	const maxDim = Math.max(width, height);
	const scale = maxDim > 200 ? 200 / maxDim : 1;
	const sw = Math.round(width * scale);
	const sh = Math.round(height * scale);

	// Extract grayscale luminance into a flat array (downsampled)
	const gray = new Uint8Array(sw * sh);
	for (let dy = 0; dy < sh; dy++) {
		const srcY = Math.min(Math.round(dy / scale), height - 1);
		for (let dx = 0; dx < sw; dx++) {
			const srcX = Math.min(Math.round(dx / scale), width - 1);
			const idx = (srcY * width + srcX) * 4;
			gray[dy * sw + dx] = data[idx];
		}
	}

	// Pre-compute the max possible range for rotated y' values
	// At worst, y' spans from -diagonal/2 to +diagonal/2
	const diagonal = Math.ceil(Math.sqrt(sw * sw + sh * sh));
	const binOffset = Math.ceil(diagonal / 2) + 1;
	const numBins = binOffset * 2 + 1;

	// Reusable typed arrays for projection
	const projSum = new Float64Array(numBins);
	const projCount = new Uint32Array(numBins);

	const cx = sw / 2;
	const cy = sh / 2;

	/**
	 * Computes projection variance for a given angle.
	 */
	function computeVariance(angleDeg: number): number {
		const rad = (angleDeg * Math.PI) / 180;
		const sinA = Math.sin(rad);
		const cosA = Math.cos(rad);

		projSum.fill(0);
		projCount.fill(0);

		for (let y = 0; y < sh; y++) {
			const rowOffset = y * sw;
			const yCentered = y - cy;
			for (let x = 0; x < sw; x++) {
				const yp = Math.round(-(x - cx) * sinA + yCentered * cosA) + binOffset;
				projSum[yp] += gray[rowOffset + x];
				projCount[yp]++;
			}
		}

		// Compute variance of normalized projection
		let sum = 0;
		let sumSq = 0;
		let count = 0;
		for (let i = 0; i < numBins; i++) {
			if (projCount[i] > 0) {
				const avg = projSum[i] / projCount[i];
				sum += avg;
				sumSq += avg * avg;
				count++;
			}
		}

		if (count === 0) return 0;
		const mean = sum / count;
		return sumSq / count - mean * mean;
	}

	// Coarse search: 1° steps
	let bestAngle = 0;
	let bestVariance = -1;

	for (let angleDeg = MIN_ANGLE; angleDeg <= MAX_ANGLE; angleDeg += 1) {
		const v = computeVariance(angleDeg);
		if (v > bestVariance) {
			bestVariance = v;
			bestAngle = angleDeg;
		}
	}

	// If variance is negligible (uniform image), return 0
	if (bestVariance < 1) return 0;

	// Fine search: 0.1° steps around the coarse best
	const fineStart = Math.max(MIN_ANGLE, bestAngle - 1);
	const fineEnd = Math.min(MAX_ANGLE, bestAngle + 1);
	for (let angleDeg = fineStart; angleDeg <= fineEnd; angleDeg += 0.1) {
		const v = computeVariance(angleDeg);
		if (v > bestVariance) {
			bestVariance = v;
			bestAngle = angleDeg;
		}
	}

	// Round to 1 decimal place (matching our step size)
	return Math.round(bestAngle * 10) / 10;
}

/**
 * Corrects image skew by rotation.
 * Returns same reference if |angle| < 0.5° or |angle| >= 15°.
 * Uses affine transformation with bilinear interpolation.
 * Out-of-bounds pixels are white (255, 255, 255, 255).
 */
export function deskew(img: ImageBuffer): ImageBuffer {
	const angle = detectSkewAngle(img);
	if (Math.abs(angle) < SKIP_THRESHOLD || Math.abs(angle) >= MAX_ANGLE) {
		return img;
	}
	return rotateImage(img, -angle);
}

/**
 * Rotates an image by the given angle (in degrees) using bilinear interpolation.
 * The output image is sized to contain the full rotated image.
 * Out-of-bounds source pixels are filled with white.
 */
function rotateImage(img: ImageBuffer, angleDeg: number): ImageBuffer {
	const { data, width, height } = img;
	const rad = (angleDeg * Math.PI) / 180;
	const cosA = Math.cos(rad);
	const sinA = Math.sin(rad);

	// Compute new bounding box
	const absCos = Math.abs(cosA);
	const absSin = Math.abs(sinA);
	const newW = Math.ceil(width * absCos + height * absSin);
	const newH = Math.ceil(width * absSin + height * absCos);

	const out = new Uint8ClampedArray(newW * newH * 4);
	out.fill(255);

	const srcCx = width / 2;
	const srcCy = height / 2;
	const dstCx = newW / 2;
	const dstCy = newH / 2;

	for (let dy = 0; dy < newH; dy++) {
		for (let dx = 0; dx < newW; dx++) {
			const rx = dx - dstCx;
			const ry = dy - dstCy;
			const sx = rx * cosA + ry * sinA + srcCx;
			const sy = -rx * sinA + ry * cosA + srcCy;

			const x0 = Math.floor(sx);
			const y0 = Math.floor(sy);
			const x1 = x0 + 1;
			const y1 = y0 + 1;

			if (x0 < 0 || y0 < 0 || x1 >= width || y1 >= height) {
				continue;
			}

			const fx = sx - x0;
			const fy = sy - y0;
			const w00 = (1 - fx) * (1 - fy);
			const w10 = fx * (1 - fy);
			const w01 = (1 - fx) * fy;
			const w11 = fx * fy;

			const i00 = (y0 * width + x0) * 4;
			const i10 = (y0 * width + x1) * 4;
			const i01 = (y1 * width + x0) * 4;
			const i11 = (y1 * width + x1) * 4;

			const dstIdx = (dy * newW + dx) * 4;
			for (let c = 0; c < 4; c++) {
				out[dstIdx + c] = Math.round(
					data[i00 + c] * w00 +
						data[i10 + c] * w10 +
						data[i01 + c] * w01 +
						data[i11 + c] * w11,
				);
			}
		}
	}

	return { data: out, width: newW, height: newH };
}
