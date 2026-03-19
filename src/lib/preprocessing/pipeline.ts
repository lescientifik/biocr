import type { ImageBuffer } from "@/types/index.ts";
import { clahe } from "./clahe.ts";
import { deskew } from "./deskew.ts";
import { grayscale, isGrayscale } from "./grayscale.ts";
import { medianFilter3x3 } from "./median.ts";
import { computeUpscaleFactor, upscale } from "./upscale.ts";

export type PipelineResult = {
	image: ImageBuffer;
	warnings: string[];
};

/**
 * Runs the full preprocessing pipeline:
 * grayscale → deskew → upscale → CLAHE(clipLimit=3.0) → median filter.
 *
 * Each step can fail independently — it is skipped with a warning.
 * Returns the raw image with a warning if the pipeline times out or is cancelled.
 */
export function preprocessingPipeline(
	input: ImageBuffer,
	options?: {
		timeoutMs?: number;
		signal?: AbortSignal;
		estimatedDPI?: number;
	},
): PipelineResult {
	const timeoutMs = options?.timeoutMs ?? 10000;
	const signal = options?.signal;
	const estimatedDPI = options?.estimatedDPI ?? 150;
	const start = performance.now();
	const warnings: string[] = [];

	let img = input;

	const STEPS: { name: string; fn: (img: ImageBuffer) => ImageBuffer }[] = [
		{
			name: "grayscale",
			fn: (img) => (isGrayscale(img) ? img : grayscale(img)),
		},
		{ name: "deskew", fn: deskew },
		{
			name: "upscale",
			fn: (img) => upscale(img, computeUpscaleFactor(estimatedDPI)),
		},
		{ name: "clahe", fn: (img) => clahe(img, 8, 8, 3.0) },
		{ name: "denoise", fn: medianFilter3x3 },
	];

	for (const step of STEPS) {
		if (signal?.aborted) {
			warnings.push("Pipeline annulé");
			return { image: img, warnings };
		}
		if (performance.now() - start > timeoutMs) {
			warnings.push(
				"Le prétraitement a pris trop de temps. Image brute utilisée.",
			);
			return { image: input, warnings };
		}
		try {
			img = step.fn(img);
		} catch {
			warnings.push(`${step.name} failed`);
		}
	}

	return { image: img, warnings };
}
