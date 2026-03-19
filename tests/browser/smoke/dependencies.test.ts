import { describe, expect, it } from "vitest";

describe("Smoke tests — critical dependencies", () => {
	it("pdf.js: loads a 1-page PDF from public/test-fixtures/", async () => {
		const pdfjsLib = await import("pdfjs-dist");
		pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";

		const pdf = await pdfjsLib.getDocument("/test-fixtures/sample.pdf").promise;
		expect(pdf.numPages).toBe(1);
		pdf.destroy();
	});

	it("Tesseract.js: initializes worker with local paths and recognizes without crash", async () => {
		const Tesseract = await import("tesseract.js");
		const worker = await Tesseract.createWorker("fra", undefined, {
			workerPath: "/tesseract/worker.min.js",
			corePath: "/tesseract/tesseract-core-simd-lstm.wasm.js",
			langPath: "/tesseract/lang",
			cacheMethod: "none",
		});

		// Create a small white canvas
		const canvas = document.createElement("canvas");
		canvas.width = 100;
		canvas.height = 100;
		// biome-ignore lint/style/noNonNullAssertion: canvas 2d context always available
		const ctx = canvas.getContext("2d")!;
		ctx.fillStyle = "white";
		ctx.fillRect(0, 0, 100, 100);

		const result = await worker.recognize(canvas);
		expect(result.data).toBeDefined();
		await worker.terminate();
	}, 30000);

	it("Web Worker: echo worker posts and receives messages", async () => {
		const worker = new Worker(
			new URL("@/workers/echo.worker.ts", import.meta.url),
			{ type: "module" },
		);

		const response = await new Promise<string>((resolve, reject) => {
			worker.onmessage = (e) => resolve(e.data);
			worker.onerror = (e) => reject(e);
			worker.postMessage("hello");
		});

		expect(response).toBe("hello");
		worker.terminate();
	});
});
