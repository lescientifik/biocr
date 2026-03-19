import { DOCLAYNET_CLASS_MAP } from "@/lib/layout-detection/doclaynet.ts";
import type { LetterboxResult } from "@/lib/layout-detection/yolo-preprocess.ts";
import type { LayoutRegion } from "@/types/layout.ts";

export const CONF_THRESHOLD = 0.3;
export const IOU_THRESHOLD = 0.5;

const NUM_CLASSES = DOCLAYNET_CLASS_MAP.length;
const NUM_DETECTIONS = 8400;

type Detection = {
	type: LayoutRegion["type"];
	bbox: { x: number; y: number; width: number; height: number };
	confidence: number;
	classIndex: number;
};

/** Computes Intersection over Union for two axis-aligned bounding boxes. */
function computeIoU(a: Detection["bbox"], b: Detection["bbox"]): number {
	const x1 = Math.max(a.x, b.x);
	const y1 = Math.max(a.y, b.y);
	const x2 = Math.min(a.x + a.width, b.x + b.width);
	const y2 = Math.min(a.y + a.height, b.y + b.height);

	const interW = Math.max(0, x2 - x1);
	const interH = Math.max(0, y2 - y1);
	const inter = interW * interH;

	const areaA = a.width * a.height;
	const areaB = b.width * b.height;
	const union = areaA + areaB - inter;

	return union > 0 ? inter / union : 0;
}

/**
 * Decodes raw YOLO output tensor [1, 15, 8400] into LayoutRegion[].
 *
 * Steps:
 * 1. Extract detections above confidence threshold
 * 2. Remap coordinates from letterbox space to original image space
 * 3. Apply per-class greedy NMS
 */
export function decodeYoloOutput(
	output: Float32Array,
	letterboxInfo: LetterboxResult,
	confidenceThreshold = CONF_THRESHOLD,
	iouThreshold = IOU_THRESHOLD,
): LayoutRegion[] {
	const { newWidth, newHeight, origWidth, origHeight } = letterboxInfo;
	const xRatio = origWidth / newWidth;
	const yRatio = origHeight / newHeight;

	const detections: Detection[] = [];

	for (let j = 0; j < NUM_DETECTIONS; j++) {
		const cx = output[0 * NUM_DETECTIONS + j];
		const cy = output[1 * NUM_DETECTIONS + j];
		const w = output[2 * NUM_DETECTIONS + j];
		const h = output[3 * NUM_DETECTIONS + j];

		// Find best class
		let maxScore = -1;
		let maxClassIdx = -1;
		for (let c = 0; c < NUM_CLASSES; c++) {
			const score = output[(4 + c) * NUM_DETECTIONS + j];
			if (score > maxScore) {
				maxScore = score;
				maxClassIdx = c;
			}
		}

		if (maxScore < confidenceThreshold) continue;

		const regionType = DOCLAYNET_CLASS_MAP[maxClassIdx];
		if (regionType === undefined) continue;

		// Convert cx,cy,w,h to x,y,width,height in original image coords
		let x = (cx - w / 2) * xRatio;
		let y = (cy - h / 2) * yRatio;
		let bw = w * xRatio;
		let bh = h * yRatio;

		// Clamp to image bounds
		if (x < 0) {
			bw += x;
			x = 0;
		}
		if (y < 0) {
			bh += y;
			y = 0;
		}
		if (x + bw > origWidth) {
			bw = origWidth - x;
		}
		if (y + bh > origHeight) {
			bh = origHeight - y;
		}

		// Skip degenerate boxes
		if (bw <= 0 || bh <= 0) continue;

		detections.push({
			type: regionType,
			bbox: { x, y, width: bw, height: bh },
			confidence: maxScore,
			classIndex: maxClassIdx,
		});
	}

	// Sort by confidence descending
	detections.sort((a, b) => b.confidence - a.confidence);

	// Per-class greedy NMS
	const kept: Detection[] = [];
	for (const det of detections) {
		let dominated = false;
		for (const k of kept) {
			if (k.classIndex !== det.classIndex) continue;
			if (computeIoU(k.bbox, det.bbox) >= iouThreshold) {
				dominated = true;
				break;
			}
		}
		if (!dominated) {
			kept.push(det);
		}
	}

	return kept.map(({ type, bbox, confidence }) => ({
		type,
		bbox,
		confidence,
	}));
}
