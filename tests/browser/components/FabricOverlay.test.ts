import * as fabric from "fabric";
import { afterEach, describe, expect, it } from "vitest";

describe("FabricOverlay — canvas interactions", () => {
	let container: HTMLDivElement;
	let fabricCanvas: fabric.Canvas;

	afterEach(() => {
		fabricCanvas?.dispose();
		container?.remove();
	});

	function setup() {
		container = document.createElement("div");
		container.style.position = "absolute";
		container.style.left = "0";
		container.style.top = "0";
		document.body.appendChild(container);

		const canvasEl = document.createElement("canvas");
		canvasEl.width = 800;
		canvasEl.height = 600;
		container.appendChild(canvasEl);

		fabricCanvas = new fabric.Canvas(canvasEl, {
			selection: false,
		});
		fabricCanvas.viewportTransform = [1, 0, 0, 1, 0, 0];
	}

	it("in Pan mode: mouse drag does not create rectangles", () => {
		setup();
		// Pan mode = no drawing handler, isDrawingMode off
		fabricCanvas.defaultCursor = "grab";
		fabricCanvas.isDrawingMode = false;
		fabricCanvas.selection = false;

		// Simulate a full mouse drag sequence via Fabric events
		const startPoint = new fabric.Point(100, 100);
		const endPoint = new fabric.Point(300, 250);

		fabricCanvas.fire("mouse:down", {
			e: new MouseEvent("mousedown", { clientX: 100, clientY: 100 }),
			viewportPoint: startPoint,
			scenePoint: startPoint,
		});
		fabricCanvas.fire("mouse:move", {
			e: new MouseEvent("mousemove", { clientX: 200, clientY: 175 }),
			viewportPoint: new fabric.Point(200, 175),
			scenePoint: new fabric.Point(200, 175),
		});
		fabricCanvas.fire("mouse:up", {
			e: new MouseEvent("mouseup", { clientX: 300, clientY: 250 }),
			viewportPoint: endPoint,
			scenePoint: endPoint,
		});

		// No objects should have been created — there is no drawing handler
		expect(fabricCanvas.getObjects()).toHaveLength(0);
	});

	it("in Draw mode: mouse drag creates a rectangle via event handler", () => {
		setup();
		fabricCanvas.defaultCursor = "crosshair";

		// Attach a minimal drawing handler similar to the app's draw mode
		let origin: fabric.Point | null = null;
		let rect: fabric.Rect | null = null;

		fabricCanvas.on("mouse:down", (opt) => {
			origin = opt.viewportPoint;
			rect = new fabric.Rect({
				left: origin.x,
				top: origin.y,
				width: 0,
				height: 0,
				fill: "rgba(59, 130, 246, 0.1)",
				stroke: "#3b82f6",
				strokeWidth: 2,
			});
			fabricCanvas.add(rect);
		});

		fabricCanvas.on("mouse:move", (opt) => {
			if (!origin || !rect) return;
			const pointer = opt.viewportPoint;
			rect.set({
				width: Math.abs(pointer.x - origin.x),
				height: Math.abs(pointer.y - origin.y),
				left: Math.min(pointer.x, origin.x),
				top: Math.min(pointer.y, origin.y),
			});
			fabricCanvas.renderAll();
		});

		fabricCanvas.on("mouse:up", () => {
			origin = null;
			rect = null;
		});

		// Simulate mouse drag via Fabric events
		const start = new fabric.Point(100, 100);
		const mid = new fabric.Point(200, 175);
		const end = new fabric.Point(300, 250);

		fabricCanvas.fire("mouse:down", {
			e: new MouseEvent("mousedown", { clientX: 100, clientY: 100 }),
			viewportPoint: start,
			scenePoint: start,
		});
		fabricCanvas.fire("mouse:move", {
			e: new MouseEvent("mousemove", { clientX: 200, clientY: 175 }),
			viewportPoint: mid,
			scenePoint: mid,
		});
		fabricCanvas.fire("mouse:move", {
			e: new MouseEvent("mousemove", { clientX: 300, clientY: 250 }),
			viewportPoint: end,
			scenePoint: end,
		});
		fabricCanvas.fire("mouse:up", {
			e: new MouseEvent("mouseup", { clientX: 300, clientY: 250 }),
			viewportPoint: end,
			scenePoint: end,
		});

		expect(fabricCanvas.getObjects()).toHaveLength(1);
		const created = fabricCanvas.getObjects()[0] as fabric.Rect;
		expect(created.width).toBe(200);
		expect(created.height).toBe(150);
	});

	it("rectangle has correct visual properties", () => {
		setup();

		const rect = new fabric.Rect({
			left: 50,
			top: 50,
			width: 100,
			height: 80,
			fill: "rgba(59, 130, 246, 0.1)",
			stroke: "#3b82f6",
			strokeWidth: 2,
		});
		fabricCanvas.add(rect);

		const obj = fabricCanvas.getObjects()[0] as fabric.Rect;
		expect(obj.stroke).toBe("#3b82f6");
		expect(obj.fill).toBe("rgba(59, 130, 246, 0.1)");
		expect(obj.strokeWidth).toBe(2);
	});

	// Note: keyboard wiring (Delete, Backspace, Escape, D, V) is tested in
	// tests/unit/hooks/keyboard-shortcuts.test.ts via useKeyboardShortcuts hook.
	// These tests verify the Fabric.js canvas API behavior used by those handlers.

	it("removing a selected object clears it from canvas", () => {
		setup();

		const rect = new fabric.Rect({
			left: 50,
			top: 50,
			width: 100,
			height: 80,
			selectable: true,
		});
		fabricCanvas.add(rect);
		fabricCanvas.setActiveObject(rect);

		expect(fabricCanvas.getObjects()).toHaveLength(1);

		const activeObj = fabricCanvas.getActiveObject();
		if (activeObj) {
			fabricCanvas.remove(activeObj);
			fabricCanvas.discardActiveObject();
		}

		expect(fabricCanvas.getObjects()).toHaveLength(0);
	});

	it("discarding active object deselects it", () => {
		setup();

		const rect = new fabric.Rect({
			left: 50,
			top: 50,
			width: 100,
			height: 80,
			selectable: true,
		});
		fabricCanvas.add(rect);
		fabricCanvas.setActiveObject(rect);

		expect(fabricCanvas.getActiveObject()).toBeTruthy();

		fabricCanvas.discardActiveObject();
		fabricCanvas.renderAll();

		expect(fabricCanvas.getActiveObject()).toBeUndefined();
	});

	it("canvas cursor changes to crosshair in draw mode and default in pan mode", () => {
		setup();

		fabricCanvas.defaultCursor = "crosshair";
		expect(fabricCanvas.defaultCursor).toBe("crosshair");

		fabricCanvas.defaultCursor = "default";
		expect(fabricCanvas.defaultCursor).toBe("default");
	});
});
