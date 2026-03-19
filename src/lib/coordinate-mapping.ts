import type { Zone } from "@/lib/zone-manager.ts";
import type { PageLayout } from "@/types/index.ts";
import type { LayoutRegion } from "@/types/layout.ts";

export type OcrCrop = {
	x: number;
	y: number;
	width: number;
	height: number;
};

/**
 * Assigns a zone to the page whose vertical range contains the zone's center Y.
 * Falls back to the nearest page if center is in a gap.
 */
export function assignZoneToPage(
	zone: Zone,
	pageLayouts: PageLayout[],
): number {
	if (pageLayouts.length === 0) return 0;

	const centerY = zone.top + zone.height / 2;

	// Check if center is inside a page
	for (const page of pageLayouts) {
		if (centerY >= page.top && centerY < page.top + page.height) {
			return page.pageIndex;
		}
	}

	// Center in a gap or outside pages — find nearest
	let bestIdx = 0;
	let bestDist = Number.POSITIVE_INFINITY;

	for (const page of pageLayouts) {
		const distToTop = Math.abs(centerY - page.top);
		const distToBottom = Math.abs(centerY - (page.top + page.height));
		const dist = Math.min(distToTop, distToBottom);
		if (dist < bestDist) {
			bestDist = dist;
			bestIdx = page.pageIndex;
		}
	}

	return bestIdx;
}

/**
 * Converts a zone's document-space coordinates to 300 DPI crop coordinates.
 *
 * For images: scaleFactor = naturalWidth / pageDisplayWidth
 * For PDFs: scaleFactor = (300/72) * (pdfPageWidth / pageDisplayWidth)
 */
export function zoneToOcrCrop(
	zone: Zone,
	page: PageLayout,
	scaleFactor: number,
): OcrCrop {
	const localX = zone.left;
	const localY = zone.top - page.top;

	return {
		x: localX * scaleFactor,
		y: localY * scaleFactor,
		width: zone.width * scaleFactor,
		height: zone.height * scaleFactor,
	};
}

/**
 * Converts a layout detection region (in detection-image coordinates) to
 * document-space coordinates suitable for creating a Zone.
 */
export function regionToZoneRect(
	region: LayoutRegion,
	page: PageLayout,
	sourceSize: { width: number; height: number },
): { left: number; top: number; width: number; height: number } {
	const scaleX = page.width / sourceSize.width;
	const scaleY = page.height / sourceSize.height;
	return {
		left: region.bbox.x * scaleX,
		top: page.top + region.bbox.y * scaleY,
		width: region.bbox.width * scaleX,
		height: region.bbox.height * scaleY,
	};
}
