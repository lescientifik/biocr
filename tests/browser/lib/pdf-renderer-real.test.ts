import { describe, expect, it, vi } from "vitest";

describe("PDF renderer — real browser", () => {
	it("loads a 1-page PDF via pdf.js with local paths", async () => {
		const pdfjsLib = await import("pdfjs-dist");
		pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";

		const pdf = await pdfjsLib.getDocument({
			url: "/test-fixtures/sample.pdf",
			cMapUrl: "/pdfjs/cmaps/",
			cMapPacked: true,
			standardFontDataUrl: "/pdfjs/standard_fonts/",
		}).promise;

		expect(pdf.numPages).toBe(1);
		pdf.destroy();
	});

	it("workerSrc points to local pdf.worker.min.mjs", async () => {
		const pdfjsLib = await import("pdfjs-dist");
		expect(pdfjsLib.GlobalWorkerOptions.workerSrc).toBe(
			"/pdfjs/pdf.worker.min.mjs",
		);
	});

	it("no network requests to CDN during loading", async () => {
		const originalFetch = window.fetch;
		const fetchSpy = vi.fn((...args: Parameters<typeof fetch>) => {
			const url =
				typeof args[0] === "string"
					? args[0]
					: args[0] instanceof URL
						? args[0].href
						: (args[0] as Request).url;

			// Fail if any request goes to an external CDN
			if (url.startsWith("http") && !url.startsWith(window.location.origin)) {
				throw new Error(`Unexpected external request: ${url}`);
			}
			return originalFetch(...args);
		});

		window.fetch = fetchSpy;

		try {
			const pdfjsLib = await import("pdfjs-dist");
			pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";

			const pdf = await pdfjsLib.getDocument({
				url: "/test-fixtures/sample.pdf",
				cMapUrl: "/pdfjs/cmaps/",
				cMapPacked: true,
				standardFontDataUrl: "/pdfjs/standard_fonts/",
			}).promise;

			pdf.destroy();

			// Verify no CDN requests were made
			for (const call of fetchSpy.mock.calls) {
				const url =
					typeof call[0] === "string"
						? call[0]
						: call[0] instanceof URL
							? call[0].href
							: (call[0] as Request).url;
				expect(url).not.toMatch(/cdn|jsdelivr|cloudflare|unpkg/);
			}
		} finally {
			window.fetch = originalFetch;
		}
	});
});
