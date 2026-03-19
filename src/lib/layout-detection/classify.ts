import type { LayoutRegionType } from "@/types/layout.ts";
import {
	FIGURE_DENSITY_THRESHOLD,
	FOOTER_ZONE_RATIO,
	HEADER_ZONE_RATIO,
	MIN_REGION_AREA_RATIO,
} from "./constants.ts";

type BBox = { x: number; y: number; width: number; height: number };
type PageSize = { width: number; height: number };

/**
 * Classifies a detected region based on its position, grid intersections,
 * and pixel density.
 *
 * Priority: header > footer > table > figure > text.
 */
export function classifyRegion(
	bbox: BBox,
	pageSize: PageSize,
	hasGridIntersections: boolean,
	pixelDensity: number,
): LayoutRegionType {
	const centerY = bbox.y + bbox.height / 2;

	if (centerY < pageSize.height * HEADER_ZONE_RATIO) {
		return "header";
	}

	if (centerY > pageSize.height * (1 - FOOTER_ZONE_RATIO)) {
		return "footer";
	}

	if (hasGridIntersections) {
		return "table";
	}

	if (pixelDensity < FIGURE_DENSITY_THRESHOLD) {
		return "figure";
	}

	return "text";
}

/**
 * Filters out bounding boxes whose area is below `MIN_REGION_AREA_RATIO`
 * of the total page area.
 */
export function filterSmallRegions(bboxes: BBox[], pageArea: number): BBox[] {
	const minArea = pageArea * MIN_REGION_AREA_RATIO;
	return bboxes.filter((b) => b.width * b.height >= minArea);
}
