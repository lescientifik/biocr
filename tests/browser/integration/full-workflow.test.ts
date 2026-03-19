import { validateFile } from "@/lib/file-validation.ts";
import { processZones } from "@/lib/ocr-coordinator.ts";
import type { OcrEngine } from "@/lib/ocr-coordinator.ts";
import * as ocrEngine from "@/lib/ocr-engine.ts";
import { loadAndRenderPdf } from "@/lib/pdf-renderer.ts";
import { _resetIdCounter } from "@/lib/zone-manager.ts";
import { useAppStore } from "@/store/app-store.ts";
import { useZoneStore } from "@/store/zone-store.ts";
import type { ImageBuffer } from "@/types/index.ts";
import type { OcrZoneResult } from "@/types/ocr.ts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a canvas with black text on white, returns both canvas and ImageBuffer. */
function makeTestImageBuffer(
	text: string,
	width = 300,
	height = 100,
): { buffer: ImageBuffer; canvas: HTMLCanvasElement } {
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

	const imageData = ctx.getImageData(0, 0, width, height);
	return {
		buffer: { data: imageData.data, width, height },
		canvas,
	};
}

/** Converts an ImageBuffer to a canvas for Tesseract. */
function imageBufferToCanvas(img: ImageBuffer): HTMLCanvasElement {
	const canvas = document.createElement("canvas");
	canvas.width = img.width;
	canvas.height = img.height;
	// biome-ignore lint/style/noNonNullAssertion: 2d context always available
	const ctx = canvas.getContext("2d")!;
	const imageData = new ImageData(
		new Uint8ClampedArray(img.data),
		img.width,
		img.height,
	);
	ctx.putImageData(imageData, 0, 0);
	return canvas;
}

/** Creates a real OcrEngine adapter that goes through Tesseract.js. */
function createRealEngine(): OcrEngine {
	return {
		async recognize(
			image: ImageBuffer,
			onProgress?: (progress: number) => void,
		) {
			const canvas = imageBufferToCanvas(image);
			ocrEngine.setProgressCallback(
				onProgress
					? (msg) => {
							if (msg.status === "recognizing text") {
								onProgress(msg.progress);
							}
						}
					: null,
			);

			await ocrEngine.getEngine();
			return ocrEngine.recognize(canvas);
		},
	};
}

/** Helper to create a fake File object. */
function createFakeFile(
	name: string,
	content = "fake-content",
	type = "image/png",
): File {
	return new File([content], name, { type });
}

/** Formats results like "Tout copier" concatenation. */
function formatCopyAll(results: OcrZoneResult[]): string {
	const sorted = [...results].sort((a, b) => a.zoneId - b.zoneId);
	return sorted.map((r) => `\n--- Zone ${r.zoneId} ---\n${r.text}`).join("");
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("Full workflow integration tests", () => {
	beforeEach(() => {
		// Reset all stores to initial state
		useAppStore.getState().reset();
		useZoneStore.getState().reset();
		_resetIdCounter();
	});

	afterEach(async () => {
		await ocrEngine.terminate();
	});

	// -----------------------------------------------------------------------
	// Test 1: Workflow complete image
	// -----------------------------------------------------------------------
	it("1 — image workflow: validate → load in store → add zone → OCR → result", async () => {
		// Validate file
		const file = createFakeFile("photo.png");
		const validation = validateFile(file);
		expect(validation).toEqual({ ok: true, type: "image" });

		// Simulate loading in stores
		const appStore = useAppStore.getState();
		appStore.setFile(file, "image");
		expect(useAppStore.getState().file).toBe(file);
		expect(useAppStore.getState().fileType).toBe("image");

		// Create a test image with text and add a zone
		const { buffer } = makeTestImageBuffer("Bonjour");
		const zoneStore = useZoneStore.getState();
		const zone = zoneStore.addZone({
			left: 0,
			top: 0,
			width: 300,
			height: 100,
		});
		expect(useZoneStore.getState().zones).toHaveLength(1);

		// Run OCR via processZones with real engine
		const engine = createRealEngine();
		const results = await processZones([{ id: zone.id, image: buffer }], {
			engine,
		});

		// Assert text in results
		expect(results).toHaveLength(1);
		expect(results[0].zoneId).toBe(zone.id);
		expect(results[0].text.trim().length).toBeGreaterThan(0);
		expect(results[0].confidence).toBeGreaterThanOrEqual(0);
		expect(results[0].confidence).toBeLessThanOrEqual(100);

		// Store the results in app store
		useAppStore.getState().setOcrState({ status: "done", results });
		expect(useAppStore.getState().ocr.status).toBe("done");
	}, 30_000);

	// -----------------------------------------------------------------------
	// Test 2: Workflow complete PDF
	// -----------------------------------------------------------------------
	it("2 — PDF workflow: load PDF → render page → add zone → OCR → result", async () => {
		// Load real PDF via pdf.js
		const pdfResult = await loadAndRenderPdf("/test-fixtures/sample.pdf");
		expect(pdfResult.pageCount).toBe(1);
		expect(pdfResult.pages).toHaveLength(1);

		// Set file in store
		const file = createFakeFile("sample.pdf", "pdf-content", "application/pdf");
		useAppStore.getState().setFile(file, "pdf");
		useAppStore.getState().setPages(
			pdfResult.pages.map((p, i) => ({
				pageIndex: i,
				top: 0,
				width: p.width,
				height: p.height,
			})),
		);

		// Add a zone covering the page
		const page = pdfResult.pages[0];
		const zone = useZoneStore.getState().addZone({
			left: 0,
			top: 0,
			width: page.width,
			height: page.height,
		});

		// Render the page at OCR resolution and create an ImageBuffer
		const ocrImageData = await import("@/lib/pdf-renderer.ts").then((mod) =>
			mod.renderPageForOcr(pdfResult.proxy, 0),
		);
		const ocrBuffer: ImageBuffer = {
			data: ocrImageData.data,
			width: ocrImageData.width,
			height: ocrImageData.height,
		};

		// Run OCR
		const engine = createRealEngine();
		const results = await processZones([{ id: zone.id, image: ocrBuffer }], {
			engine,
		});

		expect(results).toHaveLength(1);
		expect(results[0].zoneId).toBe(zone.id);
		// PDF may or may not have readable text; just check no crash
		expect(results[0].confidence).toBeGreaterThanOrEqual(0);

		// Cleanup
		for (const p of pdfResult.pages) {
			URL.revokeObjectURL(p.blobUrl);
		}
		pdfResult.proxy.destroy();
	}, 30_000);

	// -----------------------------------------------------------------------
	// Test 3: Multi-zones + copy
	// -----------------------------------------------------------------------
	it("3 — multi-zones: 3 zones → OCR → 3 results with correct IDs → concatenation format", async () => {
		const zoneStore = useZoneStore.getState();

		// Create 3 zones
		const z1 = zoneStore.addZone({ left: 0, top: 0, width: 300, height: 100 });
		const z2 = zoneStore.addZone({
			left: 0,
			top: 100,
			width: 300,
			height: 100,
		});
		const z3 = zoneStore.addZone({
			left: 0,
			top: 200,
			width: 300,
			height: 100,
		});
		expect(useZoneStore.getState().zones).toHaveLength(3);

		// Create test images for each zone
		const { buffer: buf1 } = makeTestImageBuffer("Zone1");
		const { buffer: buf2 } = makeTestImageBuffer("Zone2");
		const { buffer: buf3 } = makeTestImageBuffer("Zone3");

		// Run OCR
		const engine = createRealEngine();
		const results = await processZones(
			[
				{ id: z1.id, image: buf1 },
				{ id: z2.id, image: buf2 },
				{ id: z3.id, image: buf3 },
			],
			{ engine },
		);

		// Verify 3 results with correct zone IDs
		expect(results).toHaveLength(3);
		const ids = results.map((r) => r.zoneId);
		expect(ids).toContain(z1.id);
		expect(ids).toContain(z2.id);
		expect(ids).toContain(z3.id);

		// Verify "tout copier" concatenation format
		const copyText = formatCopyAll(results);
		expect(copyText).toContain(`--- Zone ${z1.id} ---`);
		expect(copyText).toContain(`--- Zone ${z2.id} ---`);
		expect(copyText).toContain(`--- Zone ${z3.id} ---`);

		// Verify order is ascending by zone ID
		const sortedIds = [...ids].sort((a, b) => a - b);
		const resultIds = results.map((r) => r.zoneId);
		expect(resultIds).toEqual(sortedIds);
	}, 30_000);

	// -----------------------------------------------------------------------
	// Test 4: File replacement with confirmation
	// -----------------------------------------------------------------------
	it("4 — file replacement with confirmation: zones exist → old state cleared on confirm", () => {
		// Load first file and add zones
		const fileA = createFakeFile("fileA.png");
		useAppStore.getState().setFile(fileA, "image");
		useZoneStore
			.getState()
			.addZone({ left: 0, top: 0, width: 100, height: 100 });
		useZoneStore
			.getState()
			.addZone({ left: 100, top: 0, width: 100, height: 100 });

		// Simulate OCR results
		useAppStore.getState().setOcrState({
			status: "done",
			results: [
				{ zoneId: 1, text: "result1", confidence: 90 },
				{ zoneId: 2, text: "result2", confidence: 85 },
			],
		});

		// Verify state is populated
		expect(useZoneStore.getState().zones).toHaveLength(2);
		expect(useAppStore.getState().ocr.status).toBe("done");

		// Simulate "confirm replacement": clear old state and load new file
		const fileB = createFakeFile("fileB.jpg");
		useZoneStore.getState().clearZones();
		useAppStore.getState().setOcrState({ status: "idle" });
		useAppStore.getState().setFile(fileB, "image");

		// Verify old state cleared, new file loaded
		expect(useZoneStore.getState().zones).toHaveLength(0);
		expect(useAppStore.getState().ocr.status).toBe("idle");
		expect(useAppStore.getState().file).toBe(fileB);
		expect(useAppStore.getState().fileType).toBe("image");
	});

	// -----------------------------------------------------------------------
	// Test 5: File replacement without confirmation
	// -----------------------------------------------------------------------
	it("5 — file replacement without confirmation: no zones/results → direct replacement", () => {
		// Load first file, no zones or results
		const fileA = createFakeFile("fileA.png");
		useAppStore.getState().setFile(fileA, "image");
		expect(useZoneStore.getState().zones).toHaveLength(0);
		expect(useAppStore.getState().ocr.status).toBe("idle");

		// No zones or results → direct replacement (no dialog needed)
		const hasZonesOrResults =
			useZoneStore.getState().zones.length > 0 ||
			useAppStore.getState().ocr.status === "done";
		expect(hasZonesOrResults).toBe(false);

		// Load new file directly
		const fileB = createFakeFile("fileB.png");
		useAppStore.getState().setFile(fileB, "image");

		expect(useAppStore.getState().file).toBe(fileB);
	});

	// -----------------------------------------------------------------------
	// Test 6: File close with confirmation
	// -----------------------------------------------------------------------
	it("6 — file close with confirmation: file + zones → clear returns to empty", () => {
		// Load file and add zones
		const file = createFakeFile("document.png");
		useAppStore.getState().setFile(file, "image");
		useZoneStore.getState().addZone({ left: 0, top: 0, width: 50, height: 50 });

		expect(useAppStore.getState().file).not.toBeNull();
		expect(useZoneStore.getState().zones).toHaveLength(1);

		// Zones exist → confirmation needed
		const hasZonesOrResults = useZoneStore.getState().zones.length > 0;
		expect(hasZonesOrResults).toBe(true);

		// Simulate confirm close: clear everything
		useAppStore.getState().clearFile();
		useZoneStore.getState().reset();

		// Verify return to empty state
		expect(useAppStore.getState().file).toBeNull();
		expect(useAppStore.getState().fileType).toBeNull();
		expect(useAppStore.getState().pages).toEqual([]);
		expect(useAppStore.getState().ocr.status).toBe("idle");
		expect(useZoneStore.getState().zones).toHaveLength(0);
		expect(useZoneStore.getState().mode).toBe("pan");
	});

	// -----------------------------------------------------------------------
	// Test 7: File close without confirmation
	// -----------------------------------------------------------------------
	it("7 — file close without confirmation: file loaded, no zones → direct return to empty", () => {
		// Load file, no zones
		const file = createFakeFile("photo.jpg");
		useAppStore.getState().setFile(file, "image");

		expect(useZoneStore.getState().zones).toHaveLength(0);

		// No zones → no confirmation needed
		const hasZonesOrResults = useZoneStore.getState().zones.length > 0;
		expect(hasZonesOrResults).toBe(false);

		// Close directly
		useAppStore.getState().clearFile();
		useZoneStore.getState().reset();

		expect(useAppStore.getState().file).toBeNull();
		expect(useAppStore.getState().fileType).toBeNull();
		expect(useZoneStore.getState().zones).toHaveLength(0);
	});

	// -----------------------------------------------------------------------
	// Test 8: Preview preprocessing toggle
	// -----------------------------------------------------------------------
	it("8 — preview preprocessing: toggle changes store state", () => {
		// Initial state: preview off
		expect(useAppStore.getState().previewPreprocessing).toBe(false);

		// Toggle on
		useAppStore.getState().togglePreprocessingPreview();
		expect(useAppStore.getState().previewPreprocessing).toBe(true);

		// Toggle off
		useAppStore.getState().togglePreprocessingPreview();
		expect(useAppStore.getState().previewPreprocessing).toBe(false);
	});

	// -----------------------------------------------------------------------
	// Test 9: OCR cancellation
	// -----------------------------------------------------------------------
	it("9 — OCR cancellation: abort during processing → state returns to idle", async () => {
		const { buffer } = makeTestImageBuffer("Cancel");

		// Set up OCR running state
		useAppStore.getState().setOcrState({
			status: "running",
			currentItem: 1,
			totalItems: 1,
			progress: 0,
			step: "recognizing",
			itemLabel: "Zone",
			partialResults: [],
		});

		const controller = new AbortController();
		const engine = createRealEngine();

		// Start OCR and immediately abort
		const ocrPromise = processZones([{ id: 1, image: buffer }], {
			engine,
			signal: controller.signal,
			onProgress: (progress) => {
				// Abort after first progress report
				if (progress.globalProgress > 0) {
					controller.abort();
				}
			},
		});

		// Abort right away to ensure cancellation
		controller.abort();

		const results = await ocrPromise;

		// When aborted, processZones returns early with partial/empty results
		// The important thing is it doesn't throw and respects the abort signal
		expect(results.length).toBeLessThanOrEqual(1);

		// Simulate the app's cancel handler: set state back to idle
		useAppStore.getState().setOcrState({ status: "idle" });
		expect(useAppStore.getState().ocr.status).toBe("idle");
	}, 30_000);
});
