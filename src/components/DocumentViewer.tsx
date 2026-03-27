import { useZoomPan } from "@/hooks/useZoomPan.ts";
import { PAGE_GAP, computePageLayouts } from "@/lib/page-layout.ts";
import { type RenderedPage, loadAndRenderPdf } from "@/lib/pdf-renderer.ts";
import { useAppStore } from "@/store/app-store.ts";
import { useViewportStore } from "@/store/viewport-store.ts";
import type { FileType } from "@/types/index.ts";
import type * as pdfjsLib from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";

interface DocumentViewerProps {
	file: File;
	fileType: FileType;
	onLoadError?: (message: string) => void;
	onPdfProxyReady?: (proxy: unknown | null) => void;
	/** Per-page deskewed image URLs (e.g. from classic or YOLO pipeline deskew). */
	deskewedPageUrls?: Map<number, string>;
	children?: React.ReactNode;
}

/** Renders a single image page with explicit dimensions from the page layout store. */
function ImagePage({ url }: { url: string }) {
	const pageLayout = useAppStore((s) => s.pages[0]);
	return (
		<img
			id="page-0"
			src={url}
			alt="Document"
			style={{
				display: "block",
				width: pageLayout ? `${pageLayout.width}px` : undefined,
				height: pageLayout ? `${pageLayout.height}px` : undefined,
			}}
		/>
	);
}

export function DocumentViewer({
	file,
	fileType,
	onLoadError,
	onPdfProxyReady,
	deskewedPageUrls,
	children,
}: DocumentViewerProps) {
	const workspaceRef = useRef<HTMLDivElement>(null);
	const [pages, setPages] = useState<RenderedPage[]>([]);
	const [imageUrl, setImageUrl] = useState<string | null>(null);
	const objectUrlRef = useRef<string | null>(null);
	const pdfProxyRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
	const blobUrlsRef = useRef<string[]>([]);
	const onPdfProxyReadyRef = useRef(onPdfProxyReady);
	onPdfProxyReadyRef.current = onPdfProxyReady;
	const { zoom, panX, panY } = useViewportStore();
	const resetToFitWidth = useViewportStore((s) => s.resetToFitWidth);
	const setAppPages = useAppStore((s) => s.setPages);

	useZoomPan(workspaceRef);

	/** Revoke all blob URLs from previous PDF render. */
	function cleanupBlobUrls() {
		for (const url of blobUrlsRef.current) {
			URL.revokeObjectURL(url);
		}
		blobUrlsRef.current = [];
	}

	/** Destroy previous PDF proxy. */
	function cleanupPdfProxy() {
		if (pdfProxyRef.current) {
			onPdfProxyReadyRef.current?.(null);
			pdfProxyRef.current.destroy();
			pdfProxyRef.current = null;
		}
	}

	/** Revoke image object URL. */
	function cleanupImageUrl() {
		if (objectUrlRef.current) {
			URL.revokeObjectURL(objectUrlRef.current);
			objectUrlRef.current = null;
		}
	}

	// Load file
	// biome-ignore lint/correctness/useExhaustiveDependencies: only re-run on file/fileType change
	useEffect(() => {
		let cancelled = false;

		// Cleanup previous resources
		cleanupBlobUrls();
		cleanupPdfProxy();
		cleanupImageUrl();

		async function load() {
			try {
				if (fileType === "pdf") {
					const buffer = await file.arrayBuffer();
					if (cancelled) return;
					const result = await loadAndRenderPdf(buffer);
					if (cancelled) {
						// Cleanup resources from cancelled load
						for (const p of result.pages) URL.revokeObjectURL(p.blobUrl);
						result.proxy.destroy();
						return;
					}

					pdfProxyRef.current = result.proxy;
					onPdfProxyReadyRef.current?.(result.proxy);
					blobUrlsRef.current = result.pages.map((p) => p.blobUrl);
					setPages(result.pages);
					setImageUrl(null);

					const layouts = computePageLayouts(
						result.pages.map((p) => ({
							width: p.width,
							height: p.height,
						})),
					);
					setAppPages(layouts);

					const workspace = workspaceRef.current;
					if (workspace && result.pages.length > 0) {
						resetToFitWidth(workspace.clientWidth, result.pages[0].width);
					}
				} else {
					const url = URL.createObjectURL(file);
					if (cancelled) {
						URL.revokeObjectURL(url);
						return;
					}
					objectUrlRef.current = url;

					const img = new Image();
					img.onload = () => {
						if (cancelled) return;
						setImageUrl(url);
						setPages([]);

						const layouts = computePageLayouts([
							{ width: img.naturalWidth, height: img.naturalHeight },
						]);
						setAppPages(layouts);

						const workspace = workspaceRef.current;
						if (workspace) {
							resetToFitWidth(workspace.clientWidth, img.naturalWidth);
						}
					};
					img.onerror = () => {
						URL.revokeObjectURL(url);
						objectUrlRef.current = null;
						onLoadError?.("Impossible de charger cette image.");
					};
					img.src = url;
				}
			} catch (err) {
				if (cancelled) return;
				const message =
					err instanceof Error && err.message.includes("password")
						? "Ce PDF est protégé par mot de passe et ne peut pas être ouvert."
						: "Impossible de lire ce fichier PDF.";
				onLoadError?.(message);
			}
		}

		load();

		return () => {
			cancelled = true;
		};
	}, [file, fileType]);

	// Cleanup on unmount
	// biome-ignore lint/correctness/useExhaustiveDependencies: unmount-only effect
	useEffect(() => {
		return () => {
			cleanupBlobUrls();
			cleanupPdfProxy();
			cleanupImageUrl();
		};
	}, []);

	const transformStyle = {
		transform: `scale(${zoom}) translate(${panX}px, ${panY}px)`,
		transformOrigin: "0 0",
	};

	return (
		<div
			ref={workspaceRef}
			id="workspace"
			className="relative flex-1 overflow-hidden bg-gray-100"
		>
			<div id="viewport" style={transformStyle}>
				<div id="pages-container">
					{fileType === "pdf"
						? pages.map((page, i) => (
								<div key={`page-${String(i)}`}>
									{i > 0 && (
										<div
											className="page-gap"
											style={{ height: `${PAGE_GAP}px` }}
										/>
									)}
									<img
										id={`page-${i}`}
										src={deskewedPageUrls?.get(i) ?? page.blobUrl}
										alt={`Page ${i + 1}`}
										style={{
											width: `${page.width}px`,
											height: `${page.height}px`,
											display: "block",
										}}
									/>
								</div>
							))
						: imageUrl && (
								<ImagePage
									url={deskewedPageUrls?.get(0) ?? imageUrl}
								/>
							)}
				</div>
				{children}
			</div>
		</div>
	);
}
