import { fitToWidth, pan, zoomAtPoint } from "@/lib/viewport.ts";
import type { ViewportState } from "@/types/index.ts";
import { create } from "zustand";

type ViewportStore = ViewportState & {
	setZoom: (zoom: number) => void;
	zoomAt: (cursorX: number, cursorY: number, delta: number) => void;
	panBy: (deltaX: number, deltaY: number) => void;
	resetToFitWidth: (containerW: number, docW: number) => void;
	reset: () => void;
};

const initialState: ViewportState = { zoom: 1, panX: 0, panY: 0 };

export const useViewportStore = create<ViewportStore>((set) => ({
	...initialState,

	setZoom: (zoom) => set({ zoom }),

	zoomAt: (cursorX, cursorY, delta) =>
		set((state) => zoomAtPoint(state, cursorX, cursorY, delta)),

	panBy: (deltaX, deltaY) => set((state) => pan(state, deltaX, deltaY)),

	resetToFitWidth: (containerW, docW) =>
		set({ zoom: fitToWidth(containerW, docW), panX: 0, panY: 0 }),

	reset: () => set(initialState),
}));
