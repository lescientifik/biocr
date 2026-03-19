import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";

export type RenderedPage = {
	blobUrl: string;
	width: number;
	height: number;
};

export type PdfLoadResult = {
	pages: RenderedPage[];
	pageCount: number;
	warning?: string;
	proxy: pdfjsLib.PDFDocumentProxy;
};

/** Converts a canvas to a blob URL (much more memory efficient than data URLs). */
function canvasToBlobUrl(canvas: HTMLCanvasElement): Promise<string> {
	return new Promise((resolve, reject) => {
		canvas.toBlob((blob) => {
			if (blob) {
				resolve(URL.createObjectURL(blob));
			} else {
				reject(new Error("Failed to create blob from canvas"));
			}
		}, "image/png");
	});
}

/**
 * Loads a PDF and renders all pages at the given scale.
 * Returns blob URLs for each page image (caller must revoke them on cleanup).
 */
export async function loadAndRenderPdf(
	source: string | ArrayBuffer,
	displayScale = 1.5,
): Promise<PdfLoadResult> {
	const loadingTask = pdfjsLib.getDocument({
		data: source instanceof ArrayBuffer ? source : undefined,
		url: typeof source === "string" ? source : undefined,
		cMapUrl: "/pdfjs/cmaps/",
		cMapPacked: true,
		standardFontDataUrl: "/pdfjs/standard_fonts/",
	});

	const pdf = await loadingTask.promise;
	const pageCount = pdf.numPages;
	const warning =
		pageCount > 20 ? "Ce PDF contient plus de 20 pages." : undefined;

	const pages: RenderedPage[] = [];

	for (let i = 1; i <= pageCount; i++) {
		const page = await pdf.getPage(i);
		const viewport = page.getViewport({ scale: displayScale });

		const canvas = document.createElement("canvas");
		canvas.width = viewport.width;
		canvas.height = viewport.height;
		const ctx = canvas.getContext("2d");
		if (!ctx) throw new Error("Cannot get canvas 2d context");

		await page.render({ canvasContext: ctx, viewport }).promise;
		const blobUrl = await canvasToBlobUrl(canvas);

		// Destroy temporary canvas
		canvas.width = 0;
		canvas.height = 0;

		pages.push({
			blobUrl,
			width: viewport.width / displayScale,
			height: viewport.height / displayScale,
		});
	}

	return { pages, pageCount, warning, proxy: pdf };
}

/**
 * Renders a single PDF page at 300 DPI for OCR.
 * Returns an ImageData of the full page at OCR resolution.
 */
export async function renderPageForOcr(
	proxy: pdfjsLib.PDFDocumentProxy,
	pageIndex: number,
): Promise<ImageData> {
	const ocrScale = 300 / 72; // ~4.17
	const page = await proxy.getPage(pageIndex + 1);
	const viewport = page.getViewport({ scale: ocrScale });

	const canvas = document.createElement("canvas");
	canvas.width = viewport.width;
	canvas.height = viewport.height;
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Cannot get canvas 2d context");

	await page.render({ canvasContext: ctx, viewport }).promise;
	const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

	// Destroy off-screen canvas
	canvas.width = 0;
	canvas.height = 0;

	return imageData;
}

/**
 * Renders a single PDF page at 150 DPI for layout detection.
 * Lower resolution than OCR (300 DPI) for faster processing.
 * Returns ImageData + dimensions of the rendered image (for coordinate conversion).
 */
export async function renderPageForDetection(
	proxy: pdfjsLib.PDFDocumentProxy,
	pageIndex: number,
): Promise<{ imageData: ImageData; width: number; height: number }> {
	const detectionScale = 150 / 72; // ≈ 2.08
	const page = await proxy.getPage(pageIndex + 1);
	const viewport = page.getViewport({ scale: detectionScale });

	const canvas = document.createElement("canvas");
	canvas.width = viewport.width;
	canvas.height = viewport.height;
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Cannot get canvas 2d context");

	await page.render({ canvasContext: ctx, viewport }).promise;
	const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

	// Destroy off-screen canvas
	canvas.width = 0;
	canvas.height = 0;

	return { imageData, width: viewport.width, height: viewport.height };
}
