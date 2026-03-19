import { useAppStore } from "@/store/app-store.ts";
import { useViewportStore } from "@/store/viewport-store.ts";
import { useZoneStore } from "@/store/zone-store.ts";
import { useCallback, useEffect, useRef } from "react";

/**
 * Hook that handles zoom (wheel) and pan (mouse drag) on a workspace element.
 * Also handles keyboard shortcuts: Ctrl+/-, Ctrl+0.
 */
export function useZoomPan(
	containerRef: React.RefObject<HTMLDivElement | null>,
) {
	const isPanning = useRef(false);
	const lastMouse = useRef({ x: 0, y: 0 });
	const { zoomAt, panBy, resetToFitWidth } = useViewportStore();

	const handleWheel = useCallback(
		(e: WheelEvent) => {
			e.preventDefault();
			const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
			const cursorX = e.clientX - rect.left;
			const cursorY = e.clientY - rect.top;
			zoomAt(cursorX, cursorY, -e.deltaY);
		},
		[zoomAt],
	);

	const handleMouseDown = useCallback((e: MouseEvent) => {
		const currentMode = useZoneStore.getState().mode;
		// Pan on middle-click always, or left-click when in pan mode
		if (e.button === 1 || (e.button === 0 && currentMode === "pan")) {
			e.preventDefault();
			isPanning.current = true;
			lastMouse.current = { x: e.clientX, y: e.clientY };
		}
	}, []);

	const handleMouseMove = useCallback(
		(e: MouseEvent) => {
			if (!isPanning.current) return;
			const dx = e.clientX - lastMouse.current.x;
			const dy = e.clientY - lastMouse.current.y;
			lastMouse.current = { x: e.clientX, y: e.clientY };
			panBy(dx, dy);
		},
		[panBy],
	);

	const handleMouseUp = useCallback(() => {
		isPanning.current = false;
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
		window.addEventListener("mousemove", handleMouseMove);
		window.addEventListener("mouseup", handleMouseUp);
		window.addEventListener("keydown", handleKeyDown);

		return () => {
			el.removeEventListener("wheel", handleWheel);
			el.removeEventListener("mousedown", handleMouseDown);
			window.removeEventListener("mousemove", handleMouseMove);
			window.removeEventListener("mouseup", handleMouseUp);
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [
		containerRef,
		handleWheel,
		handleMouseDown,
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
