import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock pdfjs-dist for unit tests
vi.mock("pdfjs-dist", () => {
	const mockPage = {
		getViewport: vi.fn(({ scale }: { scale: number }) => ({
			width: 612 * scale,
			height: 792 * scale,
		})),
		render: vi.fn(() => ({ promise: Promise.resolve() })),
	};

	const mockProxy = {
		numPages: 2,
		getPage: vi.fn(() => Promise.resolve(mockPage)),
		destroy: vi.fn(),
	};

	return {
		GlobalWorkerOptions: { workerSrc: "" },
		getDocument: vi.fn(() => ({
			promise: Promise.resolve(mockProxy),
		})),
		__mockProxy: mockProxy,
		__mockPage: mockPage,
	};
});

describe("PDF renderer (mocked)", () => {
	beforeEach(() => {
		// Mock canvas context for rendering
		const mockCtx = {
			fillRect: vi.fn(),
			getImageData: vi.fn(() => ({
				data: new Uint8ClampedArray(4),
				width: 1,
				height: 1,
			})),
		};

		vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
			mockCtx as unknown as CanvasRenderingContext2D,
		);
		vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
			function (this: HTMLCanvasElement, callback: BlobCallback) {
				callback(new Blob(["mock"], { type: "image/png" }));
			},
		);

		vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("loads a PDF and returns the correct page count", async () => {
		const { loadAndRenderPdf } = await import("@/lib/pdf-renderer.ts");
		const result = await loadAndRenderPdf("mock.pdf");
		expect(result.pageCount).toBe(2);
		expect(result.pages).toHaveLength(2);
	});

	it("renders pages with correct dimensions", async () => {
		const { loadAndRenderPdf } = await import("@/lib/pdf-renderer.ts");
		const result = await loadAndRenderPdf("mock.pdf", 1.5);
		// Width at displayScale=1.5: 612*1.5/1.5 = 612, height: 792*1.5/1.5 = 792
		expect(result.pages[0].width).toBeCloseTo(612);
		expect(result.pages[0].height).toBeCloseTo(792);
	});

	it("returns a warning for PDFs with more than 20 pages", async () => {
		const pdfjsLib = await import("pdfjs-dist");
		const proxy = (pdfjsLib as unknown as { __mockProxy: { numPages: number } })
			.__mockProxy;
		proxy.numPages = 25;

		const { loadAndRenderPdf } = await import("@/lib/pdf-renderer.ts");
		const result = await loadAndRenderPdf("mock.pdf");
		expect(result.warning).toContain("20 pages");

		// Reset
		proxy.numPages = 2;
	});

	it("rejects a password-protected PDF with error message", async () => {
		const pdfjsLib = await import("pdfjs-dist");
		const getDocument = pdfjsLib.getDocument as ReturnType<typeof vi.fn>;
		getDocument.mockReturnValueOnce({
			promise: Promise.reject(new Error("password required")),
		});

		const { loadAndRenderPdf } = await import("@/lib/pdf-renderer.ts");
		await expect(loadAndRenderPdf("locked.pdf")).rejects.toThrow("password");
	});

	it("rejects a corrupt PDF with error message", async () => {
		const pdfjsLib = await import("pdfjs-dist");
		const getDocument = pdfjsLib.getDocument as ReturnType<typeof vi.fn>;
		getDocument.mockReturnValueOnce({
			promise: Promise.reject(new Error("Invalid PDF structure")),
		});

		const { loadAndRenderPdf } = await import("@/lib/pdf-renderer.ts");
		await expect(loadAndRenderPdf("corrupt.pdf")).rejects.toThrow(
			"Invalid PDF structure",
		);
	});

	it("destroy() cleans up the proxy", async () => {
		const pdfjsLib = await import("pdfjs-dist");
		const proxy = (
			pdfjsLib as unknown as {
				__mockProxy: { destroy: ReturnType<typeof vi.fn> };
			}
		).__mockProxy;
		const { loadAndRenderPdf } = await import("@/lib/pdf-renderer.ts");
		const result = await loadAndRenderPdf("mock.pdf");
		result.proxy.destroy();
		expect(proxy.destroy).toHaveBeenCalled();
	});
});
