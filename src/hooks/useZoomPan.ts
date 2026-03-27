import { useAppStore } from "@/store/app-store.ts";
import { useViewportStore } from "@/store/viewport-store.ts";
import { useZoneStore } from "@/store/zone-store.ts";
import { useCallback, useEffect, useRef } from "react";

/**
 * Hook that handles viewport interactions on a workspace element.
 * - Mouse wheel: vertical scroll (panY)
 * - Middle-click + drag: free pan (X and Y)
 * - Left-click + drag in pan mode: free pan (X and Y)
 * - Right-click + drag: zoom (drag up = zoom in, drag down = zoom out)
 * - Keyboard: Ctrl+/-, Ctrl+0
 */
export function useZoomPan(
	containerRef: React.RefObject<HTMLDivElement | null>,
) {
	const isPanning = useRef(false);
	const isRightClickZooming = useRef(false);
	const lastMouse = useRef({ x: 0, y: 0 });
	const rightClickOrigin = useRef({ x: 0, y: 0 });
	const { zoomAt, panBy, resetToFitWidth } = useViewportStore();

	const handleWheel = useCallback(
		(e: WheelEvent) => {
			e.preventDefault();
			// Wheel scrolls vertically (invert deltaY so scroll-down moves content up)
			panBy(0, -e.deltaY);
		},
		[panBy],
	);

	const handleMouseDown = useCallback((e: MouseEvent) => {
		const currentMode = useZoneStore.getState().mode;

		if (e.button === 2) {
			// Right-click: start zoom drag
			e.preventDefault();
			isRightClickZooming.current = true;
			lastMouse.current = { x: e.clientX, y: e.clientY };
			rightClickOrigin.current = { x: e.clientX, y: e.clientY };
			return;
		}

		// Pan on middle-click always, or left-click when in pan mode
		// but NOT when clicking on a Fabric zone (let Fabric handle resize/drag)
		if (e.button === 1 || (e.button === 0 && currentMode === "pan")) {
			const target = e.target as HTMLElement;
			if (
				e.button === 0 &&
				(target.tagName === "CANVAS" ||
					target.closest("[class*='canvas-container']"))
			) {
				// Left-click on Fabric canvas — let Fabric handle zone interaction
				return;
			}
			e.preventDefault();
			isPanning.current = true;
			lastMouse.current = { x: e.clientX, y: e.clientY };
		}
	}, []);

	const handleMouseMove = useCallback(
		(e: MouseEvent) => {
			if (isRightClickZooming.current) {
				const dy = lastMouse.current.y - e.clientY; // drag up = positive = zoom in
				lastMouse.current = { x: e.clientX, y: e.clientY };

				// Zoom centered on where right-click started, relative to container
				const el = containerRef.current;
				if (el) {
					const rect = el.getBoundingClientRect();
					const cx = rightClickOrigin.current.x - rect.left;
					const cy = rightClickOrigin.current.y - rect.top;
					zoomAt(cx, cy, dy * 3);
				}
				return;
			}

			if (!isPanning.current) return;
			const dx = e.clientX - lastMouse.current.x;
			const dy = e.clientY - lastMouse.current.y;
			lastMouse.current = { x: e.clientX, y: e.clientY };
			panBy(dx, dy);
		},
		[panBy, zoomAt, containerRef],
	);

	const handleMouseUp = useCallback((e: MouseEvent) => {
		if (e.button === 2) {
			isRightClickZooming.current = false;
		}
		isPanning.current = false;
	}, []);

	const handleContextMenu = useCallback((e: MouseEvent) => {
		e.preventDefault();
	}, []);

	const handleKeyDown = useCallback(
		(e: KeyboardEvent) => {
			// Skip shortcuts if a form element is focused
			const target = e.target as HTMLElement;
			if (
				target.tagName === "INPUT" ||
				target.tagName === "SELECT" ||
				target.tagName === "TEXTAREA" ||
				target.isContentEditable
			) {
				return;
			}

			if (e.ctrlKey || e.metaKey) {
				const el = containerRef.current;
				if (e.key === "=" || e.key === "+") {
					e.preventDefault();
					// Zoom centered on viewport center
					const cx = el ? el.clientWidth / 2 : 0;
					const cy = el ? el.clientHeight / 2 : 0;
					zoomAt(cx, cy, 200);
				} else if (e.key === "-") {
					e.preventDefault();
					const cx = el ? el.clientWidth / 2 : 0;
					const cy = el ? el.clientHeight / 2 : 0;
					zoomAt(cx, cy, -200);
				} else if (e.key === "0") {
					e.preventDefault();
					if (el) {
						const docWidth =
							useAppStore.getState().pages[0]?.width ?? el.clientWidth;
						resetToFitWidth(el.clientWidth, docWidth);
					}
				}
			}
		},
		[zoomAt, resetToFitWidth, containerRef],
	);

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;

		el.addEventListener("wheel", handleWheel, { passive: false });
		el.addEventListener("mousedown", handleMouseDown);
		el.addEventListener("contextmenu", handleContextMenu);
		window.addEventListener("mousemove", handleMouseMove);
		window.addEventListener("mouseup", handleMouseUp);
		window.addEventListener("keydown", handleKeyDown);

		return () => {
			el.removeEventListener("wheel", handleWheel);
			el.removeEventListener("mousedown", handleMouseDown);
			el.removeEventListener("contextmenu", handleContextMenu);
			window.removeEventListener("mousemove", handleMouseMove);
			window.removeEventListener("mouseup", handleMouseUp);
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [
		containerRef,
		handleWheel,
		handleMouseDown,
		handleContextMenu,
		handleMouseMove,
		handleMouseUp,
		handleKeyDown,
	]);

	return {
		startPan: (x: number, y: number) => {
			isPanning.current = true;
			lastMouse.current = { x, y };
		},
	};
}
