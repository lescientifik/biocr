import type { DetectionResponse } from "@/types/layout.ts";

export type { DetectionResponse };

const WORKER_TIMEOUT_MS = 60_000;

let workerInstance: Worker | null = null;
let chain: Promise<void> = Promise.resolve();
let nonceCounter = 0;
let pendingResolve: ((value: DetectionResponse) => void) | null = null;

/**
 * Returns the singleton layout-detection Worker, creating it on first call.
 */
function getWorker(): Worker {
	if (!workerInstance) {
		workerInstance = new Worker(
			new URL("@/workers/layout-detection.worker.ts", import.meta.url),
			{ type: "module" },
		);
	}
	return workerInstance;
}

/**
 * Sends a single detection request to the worker.
 *
 * Uses a nonce to correlate requests with responses, preventing
 * stale responses from a timed-out request being consumed by a later call.
 *
 * Never rejects — returns a result with an optional error field to avoid
 * unhandled rejections when used inside serialized promise chains.
 */
function callWorker(
	image: { data: Uint8ClampedArray; width: number; height: number },
	pageIndex: number,
): Promise<DetectionResponse> {
	const worker = getWorker();
	const nonce = ++nonceCounter;

	return new Promise<DetectionResponse>((resolve) => {
		pendingResolve = resolve;

		const cleanup = () => {
			clearTimeout(timeout);
			worker.removeEventListener("message", handler);
			worker.removeEventListener("error", errorHandler);
			if (pendingResolve === resolve) pendingResolve = null;
		};

		const handler = (e: MessageEvent<DetectionResponse>) => {
			// Only accept responses matching our nonce
			if (e.data.nonce !== nonce) return;
			cleanup();
			resolve(e.data);
		};

		const errorHandler = (e: ErrorEvent) => {
			cleanup();
			resolve({ regions: [], pageIndex, nonce, error: e.message });
		};

		const timeout = setTimeout(() => {
			cleanup();
			resolve({
				regions: [],
				pageIndex,
				nonce,
				error: "Detection worker timeout",
			});
		}, WORKER_TIMEOUT_MS);

		worker.addEventListener("message", handler);
		worker.addEventListener("error", errorHandler);

		// Transfer the ArrayBuffer for zero-copy.
		// After transfer, image.data is detached — caller must not reuse it.
		const buffer = image.data.buffer as ArrayBuffer;
		worker.postMessage({ image, pageIndex, nonce }, [buffer]);
	});
}

/**
 * Runs layout detection in a Web Worker.
 *
 * Calls are serialized through a promise chain to prevent race conditions
 * on the singleton worker. The image data is transferred (zero-copy) and
 * becomes unusable after this call.
 */
export async function detectInWorker(
	image: { data: Uint8ClampedArray; width: number; height: number },
	pageIndex: number,
): Promise<DetectionResponse> {
	let result: DetectionResponse | undefined;
	chain = chain.then(
		async () => {
			result = await callWorker(image, pageIndex);
		},
		() => {}, // ignore errors from previous chain link
	);
	await chain;
	return result ?? { regions: [], pageIndex, nonce: 0 };
}

/**
 * Terminates the singleton layout-detection Worker if active.
 * Resolves any pending callWorker promise immediately to prevent hangs.
 */
export function terminateDetectionWorker(): void {
	if (pendingResolve) {
		pendingResolve({
			regions: [],
			pageIndex: 0,
			nonce: 0,
			error: "Worker terminated",
		});
		pendingResolve = null;
	}
	workerInstance?.terminate();
	workerInstance = null;
	chain = Promise.resolve();
}
