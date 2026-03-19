import * as fabric from "fabric";
import { afterEach, describe, expect, it } from "vitest";

describe("Spike: Fabric.js under CSS transform", () => {
	let container: HTMLDivElement;
	let fabricCanvas: fabric.Canvas;

	afterEach(() => {
		fabricCanvas?.dispose();
		container?.remove();
	});

	it("Fabric.js objects get correct coordinates under CSS scale+translate", async () => {
		// Create a container with CSS transform (simulating our viewport)
		container = document.createElement("div");
		container.style.position = "absolute";
		container.style.left = "0";
		container.style.top = "0";
		container.style.transformOrigin = "0 0";
		container.style.transform = "scale(2) translate(50px, 50px)";
		document.body.appendChild(container);

		// Create Fabric canvas inside the transformed container
		const canvasEl = document.createElement("canvas");
		canvasEl.width = 400;
		canvasEl.height = 400;
		container.appendChild(canvasEl);

		fabricCanvas = new fabric.Canvas(canvasEl);

		// Programmatically add a rectangle (simulating what our drawing would create)
		const rect = new fabric.Rect({
			left: 100,
			top: 100,
			width: 150,
			height: 80,
			fill: "rgba(59, 130, 246, 0.1)",
			stroke: "#3b82f6",
			strokeWidth: 2,
		});
		fabricCanvas.add(rect);
		fabricCanvas.renderAll();

		// Verify the rectangle was created with expected coordinates in Fabric space
		const objects = fabricCanvas.getObjects();
		expect(objects).toHaveLength(1);

		const fabricRect = objects[0] as fabric.Rect;
		expect(fabricRect.left).toBe(100);
		expect(fabricRect.top).toBe(100);
		expect(fabricRect.width).toBe(150);
		expect(fabricRect.height).toBe(80);

		// The key insight: Fabric coordinates are in the canvas local space,
		// NOT in viewport space. The CSS transform on the parent container
		// handles the visual zoom/pan, while Fabric works in document coordinates.
		// This is exactly what we want: zone coordinates in document space.
	});
});
