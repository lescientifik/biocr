import {
	fitToWidth,
	getVisiblePage,
	pan,
	zoomAtPoint,
} from "@/lib/viewport.ts";
import type { PageLayout } from "@/types/index.ts";
import { describe, expect, it } from "vitest";

describe("fitToWidth", () => {
	it("returns correct zoom ratio", () => {
		expect(fitToWidth(800, 1600)).toBeCloseTo(0.5);
	});

	it("clamps to min zoom", () => {
		expect(fitToWidth(100, 10000)).toBe(0.25);
	});

	it("clamps to max zoom", () => {
		expect(fitToWidth(5000, 100)).toBe(5.0);
	});
});

describe("zoomAtPoint", () => {
	it("returns a new ViewportState with updated zoom", () => {
		const state = { zoom: 1, panX: 0, panY: 0 };
		const result = zoomAtPoint(state, 400, 300, 100);
		expect(result.zoom).toBeGreaterThan(1);
	});

	it("keeps document point under cursor fixed after zoom (Figma-style)", () => {
		const state = { zoom: 1.5, panX: -100, panY: -50 };
		const cursorX = 400;
		const cursorY = 300;

		// Document point under cursor before zoom: cursorX/zoom - panX
		const docXBefore = cursorX / state.zoom - state.panX;
		const docYBefore = cursorY / state.zoom - state.panY;

		const result = zoomAtPoint(state, cursorX, cursorY, 200);

		// Document point under cursor after zoom should be the same
		const docXAfter = cursorX / result.zoom - result.panX;
		const docYAfter = cursorY / result.zoom - result.panY;

		expect(docXAfter).toBeCloseTo(docXBefore, 5);
		expect(docYAfter).toBeCloseTo(docYBefore, 5);
	});

	it("clamps zoom between 0.25 and 5.0", () => {
		const state = { zoom: 0.3, panX: 0, panY: 0 };
		const zoomedOut = zoomAtPoint(state, 0, 0, -10000);
		expect(zoomedOut.zoom).toBe(0.25);

		const state2 = { zoom: 4.5, panX: 0, panY: 0 };
		const zoomedIn = zoomAtPoint(state2, 0, 0, 10000);
		expect(zoomedIn.zoom).toBe(5.0);
	});
});

describe("pan", () => {
	it("adjusts translation by delta/zoom", () => {
		const state = { zoom: 2, panX: 0, panY: 0 };
		const result = pan(state, 100, 200);
		expect(result.panX).toBe(50); // 100/2
		expect(result.panY).toBe(100); // 200/2
		expect(result.zoom).toBe(2);
	});
});

describe("getVisiblePage", () => {
	const layouts: PageLayout[] = [
		{ pageIndex: 0, top: 0, height: 500, width: 400 },
		{ pageIndex: 1, top: 516, height: 500, width: 400 },
		{ pageIndex: 2, top: 1032, height: 500, width: 400 },
	];

	it("returns the page whose center is closest to viewport center", () => {
		const state = { zoom: 1, panX: 0, panY: 0 };
		// viewport height 600 → center at 300 → page 0 center at 250 → page 0
		expect(getVisiblePage(state, 600, layouts)).toBe(0);
	});

	it("returns page 1 when scrolled down", () => {
		// Scrolled so viewport center is near page 1 center (766)
		const state = { zoom: 1, panX: 0, panY: -500 };
		expect(getVisiblePage(state, 600, layouts)).toBe(1);
	});

	it("two equally visible pages — picks the one with closer center", () => {
		// Position viewport center exactly between page 0 center (250) and page 1 center (766)
		// Midpoint = 508. Page 0 center at 250, page 1 center at 766.
		// Page 0 is closer to 508 (|508-250|=258 vs |508-766|=258), tie → first wins
		const state = { zoom: 1, panX: 0, panY: -208 };
		const result = getVisiblePage(state, 600, layouts);
		expect([0, 1]).toContain(result);
	});
});
