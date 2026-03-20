import { clampZoneToCanvas } from "@/lib/clamp-zone.ts";
import { useZoneStore } from "@/store/zone-store.ts";
import * as fabric from "fabric";
import { useCallback, useEffect, useRef } from "react";

// Manual zone styles (blue, solid)
const MANUAL_STROKE = "#3b82f6";
const MANUAL_FILL = "rgba(59, 130, 246, 0.1)";

// Auto zone styles (green, dashed)
const AUTO_STROKE = "#22c55e";
const AUTO_FILL = "rgba(34, 197, 94, 0.1)";
const AUTO_DASH = [6, 4];

const ZONE_STROKE_WIDTH = 2;

/** Interactive properties applied to all zone rects (not labels). */
const ZONE_INTERACTIVE_PROPS = {
	lockRotation: true,
	hoverCursor: "move",
} as const;

/** Label translations for auto-detected region types. */
const LABEL_MAP: Record<string, string> = {
	table: "Tableau",
	text: "Texte",
	header: "En-tête",
	footer: "Pied de page",
	figure: "Figure",
};

type FabricZoneRect = fabric.Rect & {
	zoneId?: number;
	zoneSource?: "manual" | "auto";
	zoneRegionKey?: string;
};

type FabricZoneLabel = fabric.FabricText & {
	labelForZoneId?: number;
};

/** Finds the companion label for a given zone on the canvas. */
function findCompanionLabel(
	canvas: fabric.Canvas,
	zoneId: number,
): FabricZoneLabel | undefined {
	return canvas
		.getObjects()
		.find((o) => (o as FabricZoneLabel).labelForZoneId === zoneId) as
		| FabricZoneLabel
		| undefined;
}

/** Repositions a companion label to the top-left corner of its zone + offset. */
function repositionLabel(
	canvas: fabric.Canvas,
	zoneId: number,
	left: number,
	top: number,
): void {
	const label = findCompanionLabel(canvas, zoneId);
	if (label) {
		label.set({ left: left + 2, top: top + 2 });
	}
}

/**
 * Hook that manages a Fabric.js canvas for zone drawing/selection.
 * The canvas is an overlay on top of the document viewer.
 * Differentiates auto zones (green, dashed, labeled) from manual zones (blue, solid).
 */
export function useFabricCanvas(
	canvasRef: React.RefObject<HTMLCanvasElement | null>,
) {
	const fabricRef = useRef<fabric.Canvas | null>(null);
	const isDrawing = useRef(false);
	const drawStart = useRef({ x: 0, y: 0 });
	const activeRect = useRef<fabric.Rect | null>(null);

	const { mode, addZone, selectZone, zones, updateZone, selectedZoneId } =
		useZoneStore();

	// Initialize Fabric canvas
	useEffect(() => {
		const el = canvasRef.current;
		if (!el || fabricRef.current) return;

		const canvas = new fabric.Canvas(el, {
			selection: false,
			renderOnAddRemove: true,
		});

		// Set Fabric viewportTransform to identity (no internal zoom)
		canvas.viewportTransform = [1, 0, 0, 1, 0, 0];

		// Fabric wraps the canvas in a container div — position it absolutely
		// so it overlays the pages-container
		const wrapperEl = canvas.getElement().parentElement;
		if (wrapperEl) {
			wrapperEl.style.position = "absolute";
			wrapperEl.style.left = "0";
			wrapperEl.style.top = "0";
			wrapperEl.style.pointerEvents = "none"; // default to pan mode
		}

		fabricRef.current = canvas;

		return () => {
			canvas.dispose();
			fabricRef.current = null;
		};
	}, [canvasRef]);

	// Sync zones from store to Fabric objects
	useEffect(() => {
		const canvas = fabricRef.current;
		if (!canvas) return;

		const currentMode = useZoneStore.getState().mode;

		const existingIds = new Set(
			canvas
				.getObjects()
				.map((o) => (o as FabricZoneRect).zoneId)
				.filter((id) => id !== undefined),
		);
		const storeIds = new Set(zones.map((z) => z.id));

		// Snapshot objects before mutating (avoid skipping during for..of on live array)
		const allObjects = [...canvas.getObjects()];

		// Remove rect objects not in store
		for (const obj of allObjects) {
			const rect = obj as FabricZoneRect;
			if (rect.zoneId !== undefined && !storeIds.has(rect.zoneId)) {
				canvas.remove(obj);
			}
		}

		// Remove orphaned labels (labels whose zone no longer exists)
		// Re-snapshot since we just mutated
		const remainingObjects = [...canvas.getObjects()];
		for (const obj of remainingObjects) {
			const label = obj as FabricZoneLabel;
			if (
				label.labelForZoneId !== undefined &&
				!storeIds.has(label.labelForZoneId)
			) {
				canvas.remove(obj);
			}
		}

		// Add objects from store that aren't on canvas
		for (const zone of zones) {
			if (!existingIds.has(zone.id)) {
				const isAuto = zone.source === "auto";
				const isDrawMode = currentMode === "draw";
				const rect = new fabric.Rect({
					left: zone.left,
					top: zone.top,
					width: zone.width,
					height: zone.height,
					fill: isAuto ? AUTO_FILL : MANUAL_FILL,
					stroke: isAuto ? AUTO_STROKE : MANUAL_STROKE,
					strokeWidth: ZONE_STROKE_WIDTH,
					strokeUniform: true,
					strokeDashArray: isAuto ? AUTO_DASH : undefined,
					selectable: isDrawMode,
					evented: isDrawMode,
					...ZONE_INTERACTIVE_PROPS,
				}) as FabricZoneRect;
				rect.zoneId = zone.id;
				rect.zoneSource = zone.source ?? "manual";
				rect.zoneRegionKey = zone.regionKey;
				// Hide the rotation control (Fabric v6 API)
				rect.setControlVisible("mtr", false);
				canvas.add(rect);

				// Create companion label for auto zones
				if (isAuto && zone.label) {
					const labelText = LABEL_MAP[zone.label] ?? zone.label;
					const label = new fabric.FabricText(labelText, {
						left: zone.left + 2,
						top: zone.top + 2,
						fontSize: 11,
						fill: "#ffffff",
						backgroundColor: "rgba(34, 197, 94, 0.7)",
						selectable: false,
						evented: false,
					}) as FabricZoneLabel;
					label.labelForZoneId = zone.id;
					canvas.add(label);
				}
			}
		}

		canvas.renderAll();
	}, [zones]);

	// Sync selectedZoneId changes to Fabric active object
	// When selectedZoneId goes to null (Escape, mode switch), discard active object
	useEffect(() => {
		const canvas = fabricRef.current;
		if (!canvas) return;

		if (selectedZoneId === null) {
			canvas.discardActiveObject();
			canvas.requestRenderAll();
		}
	}, [selectedZoneId]);

	// Handle mode changes — also toggle pointer-events on the Fabric wrapper
	useEffect(() => {
		const canvas = fabricRef.current;
		if (!canvas) return;

		// Fabric wraps the original canvas in a container div with upper/lower canvas.
		// We need to toggle pointer-events on the wrapper, not just the original element.
		const wrapperEl = canvas.getElement().parentElement;
		if (wrapperEl) {
			wrapperEl.style.pointerEvents = mode === "draw" ? "auto" : "none";
		}

		if (mode === "draw") {
			canvas.defaultCursor = "crosshair";
			for (const obj of canvas.getObjects()) {
				// Labels should never be selectable
				if ((obj as FabricZoneLabel).labelForZoneId !== undefined) continue;
				obj.selectable = true;
				obj.evented = true;
			}
		} else {
			canvas.defaultCursor = "grab";
			canvas.hoverCursor = "grab";
			canvas.discardActiveObject();
			// Clear selectedZoneId when leaving draw mode
			useZoneStore.getState().selectZone(null);
			for (const obj of canvas.getObjects()) {
				obj.selectable = false;
				obj.evented = false;
			}
		}
		canvas.renderAll();
	}, [mode]);

	// Drawing handlers + object modification handlers
	useEffect(() => {
		const canvas = fabricRef.current;
		if (!canvas) return;

		const onMouseDown = (opt: fabric.TPointerEventInfo) => {
			if (mode !== "draw") return;

			// If clicking on an existing object, select it instead of drawing
			if (opt.target) {
				const zoneId = (opt.target as FabricZoneRect).zoneId;
				if (zoneId !== undefined) {
					selectZone(zoneId);
					canvas.setActiveObject(opt.target);
					canvas.requestRenderAll();
				}
				return;
			}

			// Clicking on empty canvas — deselect current zone
			selectZone(null);

			isDrawing.current = true;
			const pointer = canvas.getScenePoint(opt.e);
			drawStart.current = { x: pointer.x, y: pointer.y };

			const rect = new fabric.Rect({
				left: pointer.x,
				top: pointer.y,
				width: 0,
				height: 0,
				fill: MANUAL_FILL,
				stroke: MANUAL_STROKE,
				strokeWidth: ZONE_STROKE_WIDTH,
				strokeUniform: true,
				selectable: true,
				evented: true,
				...ZONE_INTERACTIVE_PROPS,
			});
			// Hide rotation control on newly drawn rects too
			rect.setControlVisible("mtr", false);
			activeRect.current = rect;
			canvas.add(rect);
		};

		const onMouseMove = (opt: fabric.TPointerEventInfo) => {
			if (!isDrawing.current || !activeRect.current) return;
			const pointer = canvas.getScenePoint(opt.e);
			const x = Math.min(pointer.x, drawStart.current.x);
			const y = Math.min(pointer.y, drawStart.current.y);
			const w = Math.abs(pointer.x - drawStart.current.x);
			const h = Math.abs(pointer.y - drawStart.current.y);

			activeRect.current.set({ left: x, top: y, width: w, height: h });
			canvas.renderAll();
		};

		const onMouseUp = () => {
			if (!isDrawing.current || !activeRect.current) return;
			isDrawing.current = false;

			const rect = activeRect.current;
			const w = rect.width ?? 0;
			const h = rect.height ?? 0;

			// Remove if too small (accidental click)
			if (w < 5 || h < 5) {
				canvas.remove(rect);
				activeRect.current = null;
				return;
			}

			// Add to store
			const zone = addZone({
				left: rect.left ?? 0,
				top: rect.top ?? 0,
				width: w,
				height: h,
			});

			// Tag the Fabric object with the zone ID
			(rect as FabricZoneRect).zoneId = zone.id;
			(rect as FabricZoneRect).zoneSource = "manual";
			activeRect.current = null;
		};

		const onObjectModified = (opt: { target: fabric.FabricObject }) => {
			const obj = opt.target as FabricZoneRect;
			if (obj.zoneId !== undefined) {
				const rawLeft = obj.left ?? 0;
				const rawTop = obj.top ?? 0;
				const rawWidth = (obj.width ?? 0) * (obj.scaleX ?? 1);
				const rawHeight = (obj.height ?? 0) * (obj.scaleY ?? 1);

				// Clamp to canvas bounds and minimum size
				const clamped = clampZoneToCanvas(
					{ left: rawLeft, top: rawTop, width: rawWidth, height: rawHeight },
					{ width: canvas.width, height: canvas.height },
				);

				updateZone(obj.zoneId, clamped);

				// Reset scale and apply clamped position/size to the Fabric object
				obj.set({
					scaleX: 1,
					scaleY: 1,
					left: clamped.left,
					top: clamped.top,
					width: clamped.width,
					height: clamped.height,
				});

				// Reposition companion label with clamped coordinates
				repositionLabel(canvas, obj.zoneId, clamped.left, clamped.top);
				canvas.requestRenderAll();
			}
		};

		// Real-time label tracking during move
		const onObjectMoving = (opt: { target: fabric.FabricObject }) => {
			const obj = opt.target as FabricZoneRect;
			if (obj.zoneId !== undefined) {
				repositionLabel(canvas, obj.zoneId, obj.left ?? 0, obj.top ?? 0);
				canvas.requestRenderAll();
			}
		};

		// Real-time label tracking during resize/scale
		const onObjectScaling = (opt: { target: fabric.FabricObject }) => {
			const obj = opt.target as FabricZoneRect;
			if (obj.zoneId !== undefined) {
				repositionLabel(canvas, obj.zoneId, obj.left ?? 0, obj.top ?? 0);
				canvas.requestRenderAll();
			}
		};

		canvas.on("mouse:down", onMouseDown);
		canvas.on("mouse:move", onMouseMove);
		canvas.on("mouse:up", onMouseUp);
		canvas.on("object:modified", onObjectModified);
		canvas.on("object:moving", onObjectMoving);
		canvas.on("object:scaling", onObjectScaling);

		return () => {
			canvas.off("mouse:down", onMouseDown);
			canvas.off("mouse:move", onMouseMove);
			canvas.off("mouse:up", onMouseUp);
			canvas.off("object:modified", onObjectModified);
			canvas.off("object:moving", onObjectMoving);
			canvas.off("object:scaling", onObjectScaling);
		};
	}, [mode, addZone, selectZone, updateZone]);

	const resize = useCallback((width: number, height: number) => {
		const canvas = fabricRef.current;
		if (!canvas) return;
		canvas.setDimensions({ width, height });
	}, []);

	const getCanvas = useCallback(() => fabricRef.current, []);

	return { resize, getCanvas };
}
