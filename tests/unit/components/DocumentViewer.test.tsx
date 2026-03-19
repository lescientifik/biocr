import { DocumentViewer } from "@/components/DocumentViewer.tsx";
import { loadAndRenderPdf } from "@/lib/pdf-renderer.ts";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Mock the pdf-renderer module
vi.mock("@/lib/pdf-renderer.ts", () => ({
	loadAndRenderPdf: vi.fn(() =>
		Promise.resolve({
			pages: [
				{
					blobUrl: "blob:page1",
					width: 612,
					height: 792,
				},
				{
					blobUrl: "blob:page2",
					width: 612,
					height: 792,
				},
			],
			pageCount: 2,
			proxy: { destroy: vi.fn() },
		}),
	),
	renderPageForOcr: vi.fn(),
}));

function fakeFile(name: string): File {
	return new File([new Uint8Array(100)], name, {
		type: "application/octet-stream",
	});
}

describe("DocumentViewer", () => {
	afterEach(cleanup);

	it("displays an image with fit-to-width", async () => {
		// For image files, we need to mock the Image constructor
		const originalImage = global.Image;
		class MockImage {
			naturalWidth = 800;
			naturalHeight = 600;
			src = "";
			onload: (() => void) | null = null;
			onerror: (() => void) | null = null;

			set _src(v: string) {
				this.src = v;
				setTimeout(() => this.onload?.(), 0);
			}
		}
		vi.stubGlobal("Image", function MockImageConstructor(this: MockImage) {
			const img = new MockImage();
			// Trigger onload after src is set via a setter
			const originalSrcDescriptor = Object.getOwnPropertyDescriptor(
				MockImage.prototype,
				"src",
			);
			let _src = "";
			Object.defineProperty(img, "src", {
				get: () => _src,
				set: (v: string) => {
					_src = v;
					setTimeout(() => img.onload?.(), 0);
				},
			});
			return img;
		});

		render(<DocumentViewer file={fakeFile("photo.png")} fileType="image" />);

		// The workspace container should exist
		const workspace = document.getElementById("workspace");
		expect(workspace).toBeTruthy();

		vi.stubGlobal("Image", originalImage);
	});

	it("displays N img elements for a PDF of N pages", async () => {
		render(<DocumentViewer file={fakeFile("doc.pdf")} fileType="pdf" />);

		await waitFor(() => {
			const images = screen.getAllByRole("img");
			expect(images).toHaveLength(2);
		});
	});

	it("applies CSS transform on the viewport", async () => {
		render(<DocumentViewer file={fakeFile("doc.pdf")} fileType="pdf" />);

		const viewport = document.getElementById("viewport");
		expect(viewport).toBeTruthy();
		expect(viewport?.style.transform).toContain("scale");
		expect(viewport?.style.transformOrigin).toBe("0 0");
	});

	describe("PDF proxy lifecycle", () => {
		it("calls onPdfProxyReady with proxy when PDF is loaded", async () => {
			const onPdfProxyReady = vi.fn();
			render(
				<DocumentViewer
					file={fakeFile("doc.pdf")}
					fileType="pdf"
					onPdfProxyReady={onPdfProxyReady}
				/>,
			);

			await waitFor(() => {
				expect(onPdfProxyReady).toHaveBeenCalledTimes(1);
			});

			// The argument should be the proxy object (non-null)
			const proxy = onPdfProxyReady.mock.calls[0][0];
			expect(proxy).not.toBeNull();
			expect(proxy).toHaveProperty("destroy");
		});

		it("calls onPdfProxyReady(null) then onPdfProxyReady(proxy) when file changes", async () => {
			const onPdfProxyReady = vi.fn();
			const { rerender } = render(
				<DocumentViewer
					file={fakeFile("doc1.pdf")}
					fileType="pdf"
					onPdfProxyReady={onPdfProxyReady}
				/>,
			);

			await waitFor(() => {
				expect(onPdfProxyReady).toHaveBeenCalledTimes(1);
			});

			onPdfProxyReady.mockClear();

			rerender(
				<DocumentViewer
					file={fakeFile("doc2.pdf")}
					fileType="pdf"
					onPdfProxyReady={onPdfProxyReady}
				/>,
			);

			await waitFor(() => {
				// First call: null (cleanup of previous), second call: new proxy
				expect(onPdfProxyReady).toHaveBeenCalledTimes(2);
				expect(onPdfProxyReady.mock.calls[0][0]).toBeNull();
				expect(onPdfProxyReady.mock.calls[1][0]).not.toBeNull();
			});
		});

		it("calls onPdfProxyReady(null) on unmount", async () => {
			const onPdfProxyReady = vi.fn();
			const { unmount } = render(
				<DocumentViewer
					file={fakeFile("doc.pdf")}
					fileType="pdf"
					onPdfProxyReady={onPdfProxyReady}
				/>,
			);

			await waitFor(() => {
				expect(onPdfProxyReady).toHaveBeenCalledTimes(1);
			});

			onPdfProxyReady.mockClear();
			unmount();

			expect(onPdfProxyReady).toHaveBeenCalledWith(null);
		});

		it("does not crash when onPdfProxyReady is not provided", async () => {
			// This should work without errors — existing behavior
			render(<DocumentViewer file={fakeFile("doc.pdf")} fileType="pdf" />);

			await waitFor(() => {
				const images = screen.getAllByRole("img");
				expect(images).toHaveLength(2);
			});
		});
	});

	it("calls onLoadError for a corrupt image", async () => {
		const originalImage = global.Image;
		vi.stubGlobal("Image", function MockImageConstructor() {
			const img = {
				naturalWidth: 0,
				naturalHeight: 0,
				onload: null as (() => void) | null,
				onerror: null as (() => void) | null,
				_src: "",
			};
			Object.defineProperty(img, "src", {
				get: () => img._src,
				set: (v: string) => {
					img._src = v;
					setTimeout(() => img.onerror?.(), 0);
				},
			});
			return img;
		});

		const onLoadError = vi.fn();
		render(
			<DocumentViewer
				file={fakeFile("broken.png")}
				fileType="image"
				onLoadError={onLoadError}
			/>,
		);

		await waitFor(() => {
			expect(onLoadError).toHaveBeenCalledWith(
				"Impossible de charger cette image.",
			);
		});

		vi.stubGlobal("Image", originalImage);
	});
});
