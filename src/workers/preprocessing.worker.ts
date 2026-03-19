import { preprocessingPipeline } from "@/lib/preprocessing/pipeline.ts";
import type { ImageBuffer } from "@/types/index.ts";

/**
 * Web Worker that runs the preprocessing pipeline on an ImageBuffer.
 *
 * Expects `{ image: ImageBuffer, options?: { estimatedDPI?: number } }` via postMessage.
 * Posts back a PipelineResult, transferring the underlying ArrayBuffer.
 */
const workerSelf = self as unknown as Worker;

type WorkerInput = {
	image: ImageBuffer;
	options?: { estimatedDPI?: number };
};

self.onmessage = (e: MessageEvent<WorkerInput>) => {
	const msg = e.data;

	// Duck-type guard: reject old format (raw ImageBuffer without 'image' key)
	if (!msg || !("image" in msg)) {
		workerSelf.postMessage({
			error: "Invalid worker input format. Expected { image, options? }.",
		});
		return;
	}

	const { image, options } = msg;

	try {
		const result = preprocessingPipeline(image, {
			estimatedDPI: options?.estimatedDPI,
		});
		const buffer = result.image.data.buffer as ArrayBuffer;
		workerSelf.postMessage(result, [buffer]);
	} catch {
		// On internal error, return the raw image unchanged
		const buffer = image.data.buffer as ArrayBuffer;
		workerSelf.postMessage(
			{
				image,
				warnings: ["Erreur interne, image brute utilisée."],
			},
			[buffer],
		);
	}
};
