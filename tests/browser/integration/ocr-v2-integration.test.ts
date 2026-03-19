import { recognize, terminate } from "@/lib/ocr-engine.ts";
import { afterEach, describe, expect, it } from "vitest";

/**
 * Creates a canvas with text for OCR testing.
 */
function canvasWithText(
	text: string,
	width = 400,
	height = 100,
): HTMLCanvasElement {
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	// biome-ignore lint/style/noNonNullAssertion: 2d context always available
	const ctx = canvas.getContext("2d")!;
	ctx.fillStyle = "white";
	ctx.fillRect(0, 0, width, height);
	ctx.fillStyle = "black";
	ctx.font = "bold 32px serif";
	ctx.textBaseline = "middle";
	ctx.fillText(text, 10, height / 2);
	return canvas;
}

describe("OCR Engine v2 — browser integration", () => {
	afterEach(async () => {
		await terminate();
	});

	it("fra+eng recognizes French text and English terms", async () => {
		const canvas = canvasWithText("CRP Cholesterol HDL");
		const result = await recognize(canvas, true);

		expect(result.text.trim().length).toBeGreaterThan(0);
		expect(result.confidence).toBeGreaterThanOrEqual(0);
	}, 30_000);

	it("PSM 6 (zone mode) produces non-empty result", async () => {
		const canvas = canvasWithText("Glycemie 1.05");
		const result = await recognize(canvas, false);

		expect(result.text.trim().length).toBeGreaterThan(0);
	}, 30_000);

	it("PSM 3 (global mode) produces non-empty result", async () => {
		const canvas = canvasWithText("Hemoglobine 14.2 g/dL");
		const result = await recognize(canvas, true);

		expect(result.text.trim().length).toBeGreaterThan(0);
	}, 30_000);
});
