import { decodeYoloOutput } from "@/lib/layout-detection/yolo-postprocess.ts";
import {
	INPUT_SIZE,
	letterbox,
} from "@/lib/layout-detection/yolo-preprocess.ts";
import type { DetectionRequest, DetectionResponse } from "@/types/layout.ts";
import * as ort from "onnxruntime-web";

const MODEL_PATH = "/models/yolo11n-doclaynet.onnx";
const ORT_WASM_CDN =
	"https://cdn.jsdelivr.net/npm/onnxruntime-web@1.24.3/dist/";

let sessionPromise: Promise<ort.InferenceSession> | null = null;

/**
 * Lazily creates and caches the ONNX InferenceSession (singleton).
 * WASM files are loaded from CDN; numThreads=1 to avoid SharedArrayBuffer.
 */
function initOnnx(): Promise<ort.InferenceSession> {
	if (!sessionPromise) {
		sessionPromise = (async () => {
			ort.env.wasm.wasmPaths = ORT_WASM_CDN;
			ort.env.wasm.numThreads = 1;

			const session = await ort.InferenceSession.create(MODEL_PATH, {
				executionProviders: ["wasm"],
			});
			console.log(
				"[yolo-worker] ONNX session created, inputs:",
				session.inputNames,
				"outputs:",
				session.outputNames,
			);
			return session;
		})();
	}
	return sessionPromise;
}

self.onmessage = async (e: MessageEvent<DetectionRequest>) => {
	const { image, pageIndex, nonce } = e.data;
	try {
		const session = await initOnnx();

		const lbResult = letterbox(image);

		const inputName = session.inputNames[0];
		const inputTensor = new ort.Tensor("float32", lbResult.tensor, [
			1,
			3,
			INPUT_SIZE,
			INPUT_SIZE,
		]);

		const results = await session.run({ [inputName]: inputTensor });
		const outputName = session.outputNames[0];
		const rawOutput = results[outputName].data as Float32Array;

		const regions = decodeYoloOutput(rawOutput, lbResult);

		self.postMessage({
			regions,
			pageIndex,
			nonce,
		} satisfies DetectionResponse);
	} catch (err) {
		console.error(`[yolo-worker] page=${pageIndex} ERROR:`, err);
		// Reset session on failure so next attempt retries initialization
		if (sessionPromise) {
			try {
				await sessionPromise;
			} catch {
				// session creation failed — clear for retry
				sessionPromise = null;
			}
		}
		self.postMessage({
			regions: [],
			pageIndex,
			nonce,
			error: String(err),
		} satisfies DetectionResponse);
	}
};
