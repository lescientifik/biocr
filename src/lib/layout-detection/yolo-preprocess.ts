export const INPUT_SIZE = 640;

const GRAY_FILL = 114 / 255;

export type LetterboxResult = {
	tensor: Float32Array;
	scale: number;
	newWidth: number;
	newHeight: number;
	origWidth: number;
	origHeight: number;
};

/**
 * Resizes an RGBA image into a [1, 3, 640, 640] CHW tensor with
 * bottom-right gray padding (letterbox). Uses nearest-neighbor
 * interpolation — no canvas APIs required.
 */
export function letterbox(imageData: {
	data: Uint8ClampedArray;
	width: number;
	height: number;
}): LetterboxResult {
	const { data, width, height } = imageData;

	const scale = Math.min(INPUT_SIZE / width, INPUT_SIZE / height);
	const newWidth = Math.round(width * scale);
	const newHeight = Math.round(height * scale);

	const tensorSize = 3 * INPUT_SIZE * INPUT_SIZE;
	const tensor = new Float32Array(tensorSize);

	// Fill entire tensor with gray padding
	tensor.fill(GRAY_FILL);

	const planeSize = INPUT_SIZE * INPUT_SIZE;

	// Write resized image pixels into the top-left corner
	for (let y = 0; y < newHeight; y++) {
		// Source row via nearest-neighbor
		const srcY = Math.min(Math.floor(y / scale), height - 1);

		for (let x = 0; x < newWidth; x++) {
			const srcX = Math.min(Math.floor(x / scale), width - 1);
			const srcIdx = (srcY * width + srcX) * 4;

			const dstIdx = y * INPUT_SIZE + x;
			tensor[dstIdx] = data[srcIdx] / 255; // R
			tensor[planeSize + dstIdx] = data[srcIdx + 1] / 255; // G
			tensor[2 * planeSize + dstIdx] = data[srcIdx + 2] / 255; // B
		}
	}

	return {
		tensor,
		scale,
		newWidth,
		newHeight,
		origWidth: width,
		origHeight: height,
	};
}
