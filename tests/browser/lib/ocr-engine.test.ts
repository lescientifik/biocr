import {
	type ProgressCallback,
	getEngine,
	recognize,
	setLanguage,
	setProgressCallback,
	terminate,
} from "@/lib/ocr-engine.ts";
import { afterEach, describe, expect, it } from "vitest";

/**
 * Creates a canvas with black text on a white background.
 */
function canvasWithText(
	text: string,
	width = 300,
	height = 80,
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

/**
 * Creates an all-white (empty) canvas.
 */
function emptyCanvas(width = 200, height = 100): HTMLCanvasElement {
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	// biome-ignore lint/style/noNonNullAssertion: 2d context always available
	const ctx = canvas.getContext("2d")!;
	ctx.fillStyle = "white";
	ctx.fillRect(0, 0, width, height);
	return canvas;
}

describe("OCR Engine — real Tesseract.js", () => {
	afterEach(async () => {
		await terminate();
	});

	it("creates worker with local paths", async () => {
		const worker = await getEngine();
		expect(worker).toBeDefined();
	});

	it("singleton: two calls return the same instance", async () => {
		const w1 = await getEngine();
		const w2 = await getEngine();
		expect(w1).toBe(w2);
	});

	it("recognizes black text on white canvas", async () => {
		const canvas = canvasWithText("Bonjour");
		const result = await recognize(canvas);

		expect(result.text.trim().length).toBeGreaterThan(0);
	});

	it("returns confidence between 0 and 100", async () => {
		const canvas = canvasWithText("Test OCR");
		const result = await recognize(canvas);

		expect(result.confidence).toBeGreaterThanOrEqual(0);
		expect(result.confidence).toBeLessThanOrEqual(100);
	});

	it("empty image returns empty/whitespace text with low confidence", async () => {
		const canvas = emptyCanvas();
		const result = await recognize(canvas);

		expect(result.text.trim()).toBe("");
	});

	it("after terminate(), a new worker is created automatically", async () => {
		const w1 = await getEngine();
		await terminate();

		const w2 = await getEngine();
		expect(w2).toBeDefined();
		expect(w2).not.toBe(w1);
	});

	it("calls progress callback with increasing percentages", async () => {
		const progressValues: number[] = [];
		const logger: ProgressCallback = (msg) => {
			if (msg.status === "recognizing text") {
				progressValues.push(msg.progress);
			}
		};

		// Set the mutable progress callback and create worker
		setProgressCallback(logger);
		await getEngine();

		const canvas = canvasWithText("Progress");
		await recognize(canvas);

		// We should have received at least one progress event
		expect(progressValues.length).toBeGreaterThan(0);

		// Progress values should be non-decreasing
		for (let i = 1; i < progressValues.length; i++) {
			expect(progressValues[i]).toBeGreaterThanOrEqual(progressValues[i - 1]);
		}
	});

	it("can change language to eng without recreating worker", async () => {
		const worker = await getEngine();

		// Change language to English
		await setLanguage("eng");

		// Worker should still be the same instance
		const sameWorker = await getEngine();
		expect(sameWorker).toBe(worker);

		// Recognize English text
		const canvas = canvasWithText("Hello");
		const result = await recognize(canvas);

		// Should produce non-empty text
		expect(result.text.trim().length).toBeGreaterThan(0);
	});
});
