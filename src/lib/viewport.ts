import type { PageLayout, ViewportState } from "@/types/index.ts";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 5.0;

function clampZoom(z: number): number {
	if (!Number.isFinite(z) || z <= 0) return MIN_ZOOM;
	return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
}

/** Computes the initial zoom to fit document width into container width. */
export function fitToWidth(containerW: number, docW: number): number {
	if (docW <= 0 || containerW <= 0) return 1;
	return clampZoom(containerW / docW);
}

/**
 * Zoom centered on cursor (Figma-style).
 * delta > 0 = zoom in, delta < 0 = zoom out.
 */
export function zoomAtPoint(
	state: ViewportState,
	cursorX: number,
	cursorY: number,
	delta: number,
): ViewportState {
	const safeZoom = Math.max(MIN_ZOOM, state.zoom);
	const newZoom = clampZoom(safeZoom * (1 + delta * 0.001));
	return {
		zoom: newZoom,
		panX: cursorX / newZoom - (cursorX / safeZoom - state.panX),
		panY: cursorY / newZoom - (cursorY / safeZoom - state.panY),
	};
}

/** Pan the viewport by a screen-space delta. */
export function pan(
	state: ViewportState,
	deltaX: number,
	deltaY: number,
): ViewportState {
	const safeZoom = Math.max(MIN_ZOOM, state.zoom);
	return {
		zoom: state.zoom,
		panX: state.panX + deltaX / safeZoom,
		panY: state.panY + deltaY / safeZoom,
	};
}

/**
 * Returns the index of the most visible page (whose center is closest
 * to the viewport center).
 */
export function getVisiblePage(
	state: ViewportState,
	viewportHeight: number,
	pageLayouts: PageLayout[],
): number {
	if (pageLayouts.length === 0) return 0;

	const safeZoom = Math.max(MIN_ZOOM, state.zoom);
	const viewportCenterY = -state.panY + viewportHeight / safeZoom / 2;

	let bestIdx = 0;
	let bestDist = Number.POSITIVE_INFINITY;

	for (const page of pageLayouts) {
		const pageCenter = page.top + page.height / 2;
		const dist = Math.abs(pageCenter - viewportCenterY);
		if (dist < bestDist) {
			bestDist = dist;
			bestIdx = page.pageIndex;
		}
	}

	return bestIdx;
}
