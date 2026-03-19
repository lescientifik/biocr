import { detectRegions } from "@/lib/layout-detection/pipeline.ts";
import type { DetectionRequest, DetectionResponse } from "@/types/layout.ts";

let initPromise: Promise<void> | null = null;

/**
 * Loads and initialises OpenCV.js into globalThis.cv.
 * The script is fetched from the patched copy in /public/opencv/.
 *
 * Uses a shared promise so concurrent callers all wait for the same
 * initialisation instead of racing each other.
 */
function initOpenCV(): Promise<void> {
	if (!initPromise) {
		initPromise = (async () => {
			const response = await fetch("/opencv/opencv.js");
			if (!response.ok) {
				throw new Error(
					`Failed to load OpenCV.js: ${response.status} ${response.statusText}`,
				);
			}
			const script = await response.text();
			// biome-ignore lint/security/noGlobalEval: required to load OpenCV.js UMD bundle in worker
			// biome-ignore lint/style/noCommaOperator: indirect eval pattern for global scope execution
			(0, eval)(script);
			// biome-ignore lint/suspicious/noExplicitAny: OpenCV.js is untyped
			let cv = (globalThis as any).cv;
			if (typeof cv === "function") {
				cv = await cv();
				// biome-ignore lint/suspicious/noExplicitAny: OpenCV.js is untyped
				(globalThis as any).cv = cv;
			}
			// Poll until cv.Mat is available (WASM compilation may lag behind)
			const deadline = Date.now() + 10_000;
			while (
				// biome-ignore lint/suspicious/noExplicitAny: OpenCV.js is untyped
				typeof (globalThis as any).cv?.Mat !== "function" &&
				Date.now() < deadline
			) {
				await new Promise((r) => setTimeout(r, 50));
				// biome-ignore lint/suspicious/noExplicitAny: OpenCV.js is untyped
				cv = (globalThis as any).cv;
			}
			// biome-ignore lint/suspicious/noExplicitAny: OpenCV.js is untyped
			if (typeof (globalThis as any).cv?.Mat !== "function") {
				throw new Error("OpenCV loaded but cv.Mat is not available after 10s");
			}
			console.log("[layout-worker] OpenCV initialized, cv.Mat available");
		})();
	}
	return initPromise;
}

self.onmessage = async (e: MessageEvent<DetectionRequest>) => {
	const { image, pageIndex, nonce } = e.data;
	console.log(
		`[layout-worker] received page=${pageIndex} nonce=${nonce} image=${image.width}x${image.height} dataLen=${image.data?.length}`,
	);
	try {
		await initOpenCV();
		console.log("[layout-worker] OpenCV ready, running detectRegions...");
		const regions = detectRegions(image, pageIndex);
		console.log(
			`[layout-worker] page=${pageIndex} detected ${regions.length} regions:`,
			regions.map(
				(r) =>
					`${r.type}(${r.bbox.x},${r.bbox.y},${r.bbox.width}x${r.bbox.height})`,
			),
		);
		self.postMessage({
			regions,
			pageIndex,
			nonce,
		} satisfies DetectionResponse);
	} catch (err) {
		console.error(`[layout-worker] page=${pageIndex} ERROR:`, err);
		self.postMessage({
			regions: [],
			pageIndex,
			nonce,
			error: String(err),
		} satisfies DetectionResponse);
	}
};
