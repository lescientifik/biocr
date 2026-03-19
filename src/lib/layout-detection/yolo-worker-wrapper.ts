import type { DetectionResponse } from "@/types/layout.ts";

const WORKER_TIMEOUT_MS = 60_000;

let workerInstance: Worker | null = null;
let chain: Promise<void> = Promise.resolve();
let nonceCounter = 0;
let pendingResolve: ((value: DetectionResponse) => void) | null = null;

/**
 * Returns the singleton YOLO detection Worker, creating it on first call.
 */
function getWorker(): Worker {
	if (!workerInstance) {
		workerInstance = new Worker(
			new URL("@/workers/yolo-detection.worker.ts", import.meta.url),
			{ type: "module" },
		);
	}
	return workerInstance;
}

/**
 * Sends a single detection request to the YOLO worker.
 * Uses nonce correlation, timeout, and never rejects.
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
				error: "YOLO detection worker timeout",
			});
		}, WORKER_TIMEOUT_MS);

		worker.addEventListener("message", handler);
		worker.addEventListener("error", errorHandler);

		const buffer = image.data.buffer as ArrayBuffer;
		worker.postMessage({ image, pageIndex, nonce }, [buffer]);
	});
}

/**
 * Runs YOLO layout detection in a Web Worker.
 * Calls are serialized through a promise chain. Image data is transferred.
 */
export async function detectInYoloWorker(
	image: { data: Uint8ClampedArray; width: number; height: number },
	pageIndex: number,
): Promise<DetectionResponse> {
	let result: DetectionResponse | undefined;
	chain = chain.then(
		async () => {
			result = await callWorker(image, pageIndex);
		},
		() => {},
	);
	await chain;
	return result ?? { regions: [], pageIndex, nonce: 0 };
}

/**
 * Terminates the singleton YOLO detection Worker if active.
 */
export function terminateYoloWorker(): void {
	if (pendingResolve) {
		pendingResolve({
			regions: [],
			pageIndex: 0,
			nonce: 0,
			error: "YOLO worker terminated",
		});
		pendingResolve = null;
	}
	workerInstance?.terminate();
	workerInstance = null;
	chain = Promise.resolve();
}
