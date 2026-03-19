import { regionToZoneRect } from "@/lib/coordinate-mapping.ts";
import type { PageLayout } from "@/types/index.ts";
import type {
	DetectionCacheData,
	LayoutRegion,
	LayoutRegionType,
} from "@/types/layout.ts";

/** Builds a stable file identity string for cache invalidation. */
export function buildFileId(file: File): string {
	return `${file.name}:${file.size}:${file.lastModified}`;
}

/** Returns true if the cached data matches the given file identity. */
export function isCacheValid(
	cache: DetectionCacheData | null,
	fileId: string,
): boolean {
	return cache !== null && cache.fileId === fileId;
}

/**
 * Filters regions by enabled types and removes deleted ones.
 * The regionKey is always based on the original (non-filtered) index
 * in regionsByPage: `"pageIndex:regionIndex"`.
 *
 * Uses a Set for O(1) deletion lookups.
 */
export function getFilteredRegions(
	regionsByPage: LayoutRegion[][],
	enabledTypes: LayoutRegionType[],
	deletedRegionKeys: string[],
): { region: LayoutRegion; regionKey: string }[] {
	const deletedSet = new Set(deletedRegionKeys);
	const result: { region: LayoutRegion; regionKey: string }[] = [];
	for (let pageIndex = 0; pageIndex < regionsByPage.length; pageIndex++) {
		const pageRegions = regionsByPage[pageIndex];
		for (let regionIndex = 0; regionIndex < pageRegions.length; regionIndex++) {
			const region = pageRegions[regionIndex];
			const regionKey = `${pageIndex}:${regionIndex}`;
			if (!enabledTypes.includes(region.type)) continue;
			if (deletedSet.has(regionKey)) continue;
			result.push({ region, regionKey });
		}
	}
	return result;
}

/**
 * Converts filtered layout regions into auto-zone descriptors
 * (without IDs — caller uses `createZone` to assign them).
 * Skips regions whose pageIndex is out of bounds.
 */
export function regionsToAutoZones(
	filteredRegions: { region: LayoutRegion; regionKey: string }[],
	pageLayouts: PageLayout[],
	sourceImageSizes: { width: number; height: number }[],
): {
	left: number;
	top: number;
	width: number;
	height: number;
	source: "auto";
	label: string;
	regionKey: string;
}[] {
	const result: {
		left: number;
		top: number;
		width: number;
		height: number;
		source: "auto";
		label: string;
		regionKey: string;
	}[] = [];

	for (const { region, regionKey } of filteredRegions) {
		const pageIndex = Number.parseInt(regionKey.split(":")[0], 10);
		const page = pageLayouts[pageIndex];
		const sourceSize = sourceImageSizes[pageIndex];

		// Guard: skip if pageIndex out of bounds
		if (!page || !sourceSize) continue;
		// Guard: skip if source dimensions are zero (would produce NaN coordinates)
		if (sourceSize.width === 0 || sourceSize.height === 0) continue;

		const rect = regionToZoneRect(region, page, sourceSize);
		result.push({
			...rect,
			source: "auto" as const,
			label: region.type,
			regionKey,
		});
	}

	return result;
}
