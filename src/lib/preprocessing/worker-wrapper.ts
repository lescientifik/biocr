import type { PipelineResult } from "@/lib/preprocessing/pipeline.ts";
import type { ImageBuffer } from "@/types/index.ts";

const WORKER_TIMEOUT_MS = 30_000;

let workerInstance: Worker | null = null;
let chain: Promise<void> = Promise.resolve();

/**
 * Returns the singleton preprocessing Worker, creating it on first call.
 */
function getWorker(): Worker {
	if (!workerInstance) {
		workerInstance = new Worker(
			new URL("@/workers/preprocessing.worker.ts", import.meta.url),
			{ type: "module" },
		);
	}
	return workerInstance;
}

type WorkerCallResult =
	| { ok: true; image: ImageBuffer }
	| { ok: false; error: Error };

/**
 * Sends a single preprocessing request to the worker.
 *
 * Never rejects — returns a discriminated result to avoid unhandled rejections
 * when used inside serialized promise chains with fake timers.
 */
function callWorker(
	image: ImageBuffer,
	estimatedDPI?: number,
): Promise<WorkerCallResult> {
	const worker = getWorker();

	return new Promise<WorkerCallResult>((resolve) => {
		const cleanup = () => {
			clearTimeout(timeout);
			worker.removeEventListener("message", handler);
			worker.removeEventListener("error", errorHandler);
		};

		const handler = (e: MessageEvent) => {
			cleanup();
			if (e.data.error) {
				resolve({ ok: false, error: new Error(e.data.error) });
			} else {
				resolve({ ok: true, image: (e.data as PipelineResult).image });
			}
		};

		const errorHandler = (e: ErrorEvent) => {
			cleanup();
			resolve({ ok: false, error: new Error(e.message) });
		};

		const timeout = setTimeout(() => {
			cleanup();
			resolve({
				ok: false,
				error: new Error("Worker preprocessing timeout"),
			});
		}, WORKER_TIMEOUT_MS);

		worker.addEventListener("message", handler);
		worker.addEventListener("error", errorHandler);

		// Transfer the ArrayBuffer for zero-copy
		const buffer = image.data.buffer as ArrayBuffer;
		worker.postMessage({ image, options: { estimatedDPI } }, [buffer]);
	});
}

/**
 * Runs the preprocessing pipeline in a Web Worker.
 *
 * Falls back to main-thread execution when the Worker API is unavailable.
 * On worker error or timeout, throws so that processZones' preprocess catch
 * block fires onWarning and uses the raw image.
 *
 * Calls are serialized through a promise chain to prevent race conditions
 * on the singleton worker.
 */
export async function preprocessInWorker(
	image: ImageBuffer,
	options?: { estimatedDPI?: number },
): Promise<ImageBuffer> {
	if (typeof Worker === "undefined") {
		console.warn("Worker API unavailable, falling back to main thread");
		const { preprocessingPipeline } = await import(
			"@/lib/preprocessing/pipeline.ts"
		);
		return preprocessingPipeline(image, {
			estimatedDPI: options?.estimatedDPI,
		}).image;
	}

	// Clone data before transfer so we have a valid fallback if the worker fails.
	// After postMessage with transfer list, image.data.buffer is detached.
	const fallbackData = new Uint8ClampedArray(image.data);
	const fallback: ImageBuffer = {
		data: fallbackData,
		width: image.width,
		height: image.height,
	};

	// Serialize access to the singleton worker via a promise chain.
	// callWorker never rejects (uses result union), avoiding unhandled rejections.
	let callResult: WorkerCallResult | undefined;
	chain = chain.then(
		async () => {
			callResult = await callWorker(image, options?.estimatedDPI);
		},
		() => {}, // ignore errors from previous chain link
	);

	await chain;

	if (callResult?.ok) {
		return callResult.image;
	}
	if (callResult) {
		// Throw so processZones' preprocess catch block fires onWarning
		throw callResult.error;
	}
	return fallback;
}

/**
 * Terminates the singleton preprocessing Worker if active.
 */
export function terminatePreprocessWorker(): void {
	workerInstance?.terminate();
	workerInstance = null;
	chain = Promise.resolve();
}
