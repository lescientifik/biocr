import type { LayoutRegion } from "@/types/layout.ts";
import { classifyRegion, filterSmallRegions } from "./classify.ts";
import {
	H_LINE_KERNEL_WIDTH,
	TEXT_DILATE_KERNEL_HEIGHT,
	TEXT_DILATE_KERNEL_WIDTH,
	V_LINE_KERNEL_HEIGHT,
} from "./constants.ts";

/**
 * Runs the heuristic layout detection pipeline using OpenCV.js.
 *
 * Steps: grayscale -> Otsu binarization -> H/V line detection (morphological
 * opening) -> grid mask (bitwise AND of H and V lines) -> dilation (merge
 * nearby characters into text blocks) -> contour extraction on dilated image
 * -> small-region filtering -> classification (density computed on original
 * binary).
 *
 * Must be called inside a Web Worker where `globalThis.cv` is the loaded
 * OpenCV.js module.
 */
export function detectRegions(
	imageData: { data: Uint8ClampedArray; width: number; height: number },
	_pageIndex: number,
): LayoutRegion[] {
	// biome-ignore lint/suspicious/noExplicitAny: OpenCV.js is untyped
	const cv = (globalThis as any).cv;
	if (!cv) return [];

	const pageArea = imageData.width * imageData.height;

	// Use the data directly — no copy needed since we own it (transferred from main thread)
	const src = cv.matFromImageData(
		new ImageData(
			imageData.data as Uint8ClampedArray<ArrayBuffer>,
			imageData.width,
			imageData.height,
		),
	);
	const gray = new cv.Mat();
	const binary = new cv.Mat();
	const hKernel = cv.Mat.ones(1, H_LINE_KERNEL_WIDTH, cv.CV_8UC1);
	const vKernel = cv.Mat.ones(V_LINE_KERNEL_HEIGHT, 1, cv.CV_8UC1);
	const dilateKernel = cv.Mat.ones(
		TEXT_DILATE_KERNEL_HEIGHT,
		TEXT_DILATE_KERNEL_WIDTH,
		cv.CV_8UC1,
	);
	const hLines = new cv.Mat();
	const vLines = new cv.Mat();
	const grid = new cv.Mat();
	const dilated = new cv.Mat();
	const contours = new cv.MatVector();
	const hierarchy = new cv.Mat();

	try {
		// Grayscale
		cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
		console.log("[pipeline] grayscale done");

		// Otsu binarization (inverted so foreground is white)
		cv.threshold(gray, binary, 0, 255, cv.THRESH_BINARY_INV | cv.THRESH_OTSU);
		console.log("[pipeline] binarization done");

		// Horizontal lines detection via morphological opening
		cv.morphologyEx(binary, hLines, cv.MORPH_OPEN, hKernel);

		// Vertical lines detection via morphological opening
		cv.morphologyEx(binary, vLines, cv.MORPH_OPEN, vKernel);

		// Grid = intersection of H and V lines
		cv.bitwise_and(hLines, vLines, grid);
		console.log("[pipeline] grid detection done");

		// Dilate the binary image to merge nearby characters into text blocks.
		// Without this step, each letter is an isolated contour that gets
		// filtered out by the minimum-area check.
		cv.dilate(binary, dilated, dilateKernel);
		console.log(
			`[pipeline] dilation done (kernel ${TEXT_DILATE_KERNEL_WIDTH}x${TEXT_DILATE_KERNEL_HEIGHT})`,
		);

		// Find external contours on the dilated image
		cv.findContours(
			dilated,
			contours,
			hierarchy,
			cv.RETR_EXTERNAL,
			cv.CHAIN_APPROX_SIMPLE,
		);
		console.log(`[pipeline] found ${contours.size()} raw contours`);

		// Collect bounding boxes (each contour Mat must be freed)
		const bboxes: { x: number; y: number; width: number; height: number }[] =
			[];
		for (let i = 0; i < contours.size(); i++) {
			const contour = contours.get(i);
			try {
				const rect = cv.boundingRect(contour);
				bboxes.push({
					x: rect.x,
					y: rect.y,
					width: rect.width,
					height: rect.height,
				});
			} finally {
				contour.delete();
			}
		}

		// Filter small regions
		const filtered = filterSmallRegions(bboxes, pageArea);
		console.log(
			`[pipeline] ${bboxes.length} bboxes -> ${filtered.length} after size filter (minArea=${(pageArea * 0.02).toFixed(0)}, pageArea=${pageArea})`,
		);

		// Classify each region — ROI operations wrapped individually for leak safety
		const regions: LayoutRegion[] = [];
		for (const bbox of filtered) {
			let roiGrid: ReturnType<typeof grid.roi> | null = null;
			let roiBinary: ReturnType<typeof binary.roi> | null = null;
			try {
				// Check grid intersections in this bbox area
				roiGrid = grid.roi(
					new cv.Rect(bbox.x, bbox.y, bbox.width, bbox.height),
				);
				const hasGrid = cv.countNonZero(roiGrid) > 0;

				// Compute pixel density
				roiBinary = binary.roi(
					new cv.Rect(bbox.x, bbox.y, bbox.width, bbox.height),
				);
				const nonZero = cv.countNonZero(roiBinary);
				const density = nonZero / (bbox.width * bbox.height);

				const type = classifyRegion(
					bbox,
					{ width: imageData.width, height: imageData.height },
					hasGrid,
					density,
				);

				regions.push({ type, bbox, confidence: 1.0 });
			} finally {
				roiGrid?.delete();
				roiBinary?.delete();
			}
		}

		return regions;
	} finally {
		src.delete();
		gray.delete();
		binary.delete();
		hKernel.delete();
		vKernel.delete();
		dilateKernel.delete();
		hLines.delete();
		vLines.delete();
		grid.delete();
		dilated.delete();
		contours.delete();
		hierarchy.delete();
	}
}
