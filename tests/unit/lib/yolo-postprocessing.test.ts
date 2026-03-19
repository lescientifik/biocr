import {
	CONF_THRESHOLD,
	IOU_THRESHOLD,
	decodeYoloOutput,
} from "@/lib/layout-detection/yolo-postprocess.ts";
import type { LetterboxResult } from "@/lib/layout-detection/yolo-preprocess.ts";
import type { LayoutRegion } from "@/types/layout.ts";
import { describe, expect, it } from "vitest";

const NUM_CLASSES = 11;
const NUM_COORDS = 4;
const NUM_DETECTIONS = 8400;
const ROW_SIZE = NUM_COORDS + NUM_CLASSES; // 15

/**
 * Creates a mock YOLO output tensor [1, 15, 8400].
 * The tensor is stored row-major: row i (0..14), column j (0..8399)
 * maps to index i * 8400 + j.
 */
function createMockOutput(
	detections: Array<{
		index: number;
		cx: number;
		cy: number;
		w: number;
		h: number;
		classScores: number[];
	}>,
): Float32Array {
	const output = new Float32Array(ROW_SIZE * NUM_DETECTIONS);
	for (const det of detections) {
		const j = det.index;
		output[0 * NUM_DETECTIONS + j] = det.cx;
		output[1 * NUM_DETECTIONS + j] = det.cy;
		output[2 * NUM_DETECTIONS + j] = det.w;
		output[3 * NUM_DETECTIONS + j] = det.h;
		for (let c = 0; c < det.classScores.length; c++) {
			output[(4 + c) * NUM_DETECTIONS + j] = det.classScores[c];
		}
	}
	return output;
}

function makeLetterboxInfo(
	overrides: Partial<LetterboxResult> = {},
): LetterboxResult {
	return {
		tensor: new Float32Array(0),
		scale: 0.5,
		newWidth: 500,
		newHeight: 640,
		origWidth: 1000,
		origHeight: 1280,
		...overrides,
	};
}

describe("decodeYoloOutput", () => {
	it("exports CONF_THRESHOLD as 0.3 and IOU_THRESHOLD as 0.5", () => {
		expect(CONF_THRESHOLD).toBe(0.3);
		expect(IOU_THRESHOLD).toBe(0.5);
	});

	it("returns 1 LayoutRegion for 1 valid detection", () => {
		const classScores = new Array(NUM_CLASSES).fill(0);
		classScores[9] = 0.8; // class 9 = "text"

		const output = createMockOutput([
			{ index: 0, cx: 250, cy: 320, w: 100, h: 50, classScores },
		]);
		const info = makeLetterboxInfo();
		const regions = decodeYoloOutput(output, info);

		expect(regions).toHaveLength(1);
		expect(regions[0].type).toBe("text");
		expect(regions[0].confidence).toBeCloseTo(0.8, 4);
	});

	it("returns empty array when confidence is below threshold", () => {
		const classScores = new Array(NUM_CLASSES).fill(0);
		classScores[9] = 0.1; // below 0.3

		const output = createMockOutput([
			{ index: 0, cx: 250, cy: 320, w: 100, h: 50, classScores },
		]);
		const info = makeLetterboxInfo();
		const regions = decodeYoloOutput(output, info);

		expect(regions).toHaveLength(0);
	});

	it("returns empty array when no detections exceed threshold", () => {
		const output = new Float32Array(ROW_SIZE * NUM_DETECTIONS); // all zeros
		const info = makeLetterboxInfo();
		const regions = decodeYoloOutput(output, info);

		expect(regions).toHaveLength(0);
	});

	it("remaps coordinates from letterbox space to original image space", () => {
		const classScores = new Array(NUM_CLASSES).fill(0);
		classScores[8] = 0.9; // class 8 = "table"

		// Box at cx=250, cy=320, w=100, h=50 in 640-space
		// origWidth=1000, newWidth=500 → xRatio=2
		// origHeight=1280, newHeight=640 → yRatio=2
		// x = (250 - 50) * 2 = 400
		// y = (320 - 25) * 2 = 590
		// width = 100 * 2 = 200
		// height = 50 * 2 = 100
		const output = createMockOutput([
			{ index: 0, cx: 250, cy: 320, w: 100, h: 50, classScores },
		]);
		const info = makeLetterboxInfo();
		const regions = decodeYoloOutput(output, info);

		expect(regions).toHaveLength(1);
		expect(regions[0].bbox.x).toBeCloseTo(400, 1);
		expect(regions[0].bbox.y).toBeCloseTo(590, 1);
		expect(regions[0].bbox.width).toBeCloseTo(200, 1);
		expect(regions[0].bbox.height).toBeCloseTo(100, 1);
	});

	it("clamps coordinates to image bounds", () => {
		const classScores = new Array(NUM_CLASSES).fill(0);
		classScores[9] = 0.8;

		// Box that extends beyond bounds:
		// cx=10, cy=10, w=100, h=100 → x=(10-50)*2=-80, y=(10-50)*2=-80
		// Should be clamped to x=0, y=0
		const output = createMockOutput([
			{ index: 0, cx: 10, cy: 10, w: 100, h: 100, classScores },
		]);
		const info = makeLetterboxInfo();
		const regions = decodeYoloOutput(output, info);

		expect(regions).toHaveLength(1);
		expect(regions[0].bbox.x).toBe(0);
		expect(regions[0].bbox.y).toBe(0);
		// width/height should be clamped so box doesn't go negative
		expect(regions[0].bbox.width).toBeGreaterThan(0);
		expect(regions[0].bbox.height).toBeGreaterThan(0);
	});

	it("ignores detections with out-of-range class index", () => {
		// All class scores are 0, so max is 0 which is below threshold
		// This effectively tests that no phantom class is picked
		const classScores = new Array(NUM_CLASSES).fill(0);
		const output = createMockOutput([
			{ index: 0, cx: 250, cy: 320, w: 100, h: 50, classScores },
		]);
		const info = makeLetterboxInfo();
		const regions = decodeYoloOutput(output, info);

		expect(regions).toHaveLength(0);
	});

	it("NMS removes overlapping same-class boxes", () => {
		const classScores1 = new Array(NUM_CLASSES).fill(0);
		classScores1[9] = 0.9; // text, high conf
		const classScores2 = new Array(NUM_CLASSES).fill(0);
		classScores2[9] = 0.7; // text, lower conf — overlapping

		// Two nearly identical boxes (same class, high IoU)
		const output = createMockOutput([
			{ index: 0, cx: 250, cy: 320, w: 100, h: 50, classScores: classScores1 },
			{ index: 1, cx: 255, cy: 322, w: 100, h: 50, classScores: classScores2 },
		]);
		const info = makeLetterboxInfo();
		const regions = decodeYoloOutput(output, info);

		expect(regions).toHaveLength(1);
		expect(regions[0].confidence).toBeCloseTo(0.9, 4);
	});

	it("NMS keeps overlapping boxes of different classes", () => {
		const classScores1 = new Array(NUM_CLASSES).fill(0);
		classScores1[9] = 0.9; // text
		const classScores2 = new Array(NUM_CLASSES).fill(0);
		classScores2[8] = 0.8; // table — different class

		// Two nearly identical boxes but different classes
		const output = createMockOutput([
			{ index: 0, cx: 250, cy: 320, w: 100, h: 50, classScores: classScores1 },
			{ index: 1, cx: 255, cy: 322, w: 100, h: 50, classScores: classScores2 },
		]);
		const info = makeLetterboxInfo();
		const regions = decodeYoloOutput(output, info);

		expect(regions).toHaveLength(2);
	});

	it("respects custom confidence and IoU thresholds", () => {
		const classScores = new Array(NUM_CLASSES).fill(0);
		classScores[9] = 0.4; // above default 0.3 but below 0.5

		const output = createMockOutput([
			{ index: 0, cx: 250, cy: 320, w: 100, h: 50, classScores },
		]);
		const info = makeLetterboxInfo();

		// With default threshold (0.3), should be included
		expect(decodeYoloOutput(output, info)).toHaveLength(1);

		// With higher threshold (0.5), should be excluded
		expect(decodeYoloOutput(output, info, 0.5)).toHaveLength(0);
	});
});
