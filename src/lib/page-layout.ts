import type { PageLayout } from "@/types/index.ts";

export const PAGE_GAP = 16;

export type PageSize = { width: number; height: number };

/** Computes vertical layout positions for stacked pages with 16px gaps. */
export function computePageLayouts(pages: PageSize[]): PageLayout[] {
	const layouts: PageLayout[] = [];
	let currentTop = 0;

	for (let i = 0; i < pages.length; i++) {
		layouts.push({
			pageIndex: i,
			top: currentTop,
			width: pages[i].width,
			height: pages[i].height,
		});
		currentTop += pages[i].height + PAGE_GAP;
	}

	return layouts;
}

/** Finds the page at a given Y position in document space. */
export function findPageAtY(layouts: PageLayout[], y: number): number {
	if (layouts.length === 0) return 0;

	// Before first page
	if (y < layouts[0].top) return 0;

	// After last page
	const last = layouts[layouts.length - 1];
	if (y > last.top + last.height) return last.pageIndex;

	// Check each page
	for (const page of layouts) {
		if (y >= page.top && y < page.top + page.height) {
			return page.pageIndex;
		}
	}

	// In a gap — find nearest page
	let bestIdx = 0;
	let bestDist = Number.POSITIVE_INFINITY;

	for (const page of layouts) {
		const distToTop = Math.abs(y - page.top);
		const distToBottom = Math.abs(y - (page.top + page.height));
		const dist = Math.min(distToTop, distToBottom);
		if (dist < bestDist) {
			bestDist = dist;
			bestIdx = page.pageIndex;
		}
	}

	return bestIdx;
}
