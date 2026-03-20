import { CoachMark } from "@/components/CoachMark.tsx";
import { DocumentViewer } from "@/components/DocumentViewer.tsx";
import { DropZone } from "@/components/DropZone.tsx";
import { FabricOverlay } from "@/components/FabricOverlay.tsx";
import { FileReplaceDialog } from "@/components/FileReplaceDialog.tsx";
import type { LanguageCode } from "@/components/LanguageSelector.tsx";
import { ProgressBar } from "@/components/ProgressBar.tsx";
import { ResultsPanel } from "@/components/ResultsPanel.tsx";
import { Toolbar } from "@/components/Toolbar.tsx";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts.ts";
import { ProxyDestroyedError } from "@/lib/errors.ts";
import {
	buildFileId,
	getFilteredRegions,
	isCacheValid,
	regionsToAutoZones,
} from "@/lib/layout-detection/cache.ts";
import {
	detectInYoloWorker,
	terminateYoloWorker,
} from "@/lib/layout-detection/yolo-worker-wrapper.ts";
import type { ZoneProvider } from "@/lib/ocr-coordinator.ts";
import { processZones } from "@/lib/ocr-coordinator.ts";
import * as ocrEngine from "@/lib/ocr-engine.ts";
import {
	renderPageForDetection,
	renderPageForOcr,
} from "@/lib/pdf-renderer.ts";
import { postProcess } from "@/lib/post-processing.ts";
import {
	preprocessInWorker,
	terminatePreprocessWorker,
} from "@/lib/preprocessing/worker-wrapper.ts";
import {
	TOAST_CONFIG,
	showError,
	showInfo,
	showWarning,
} from "@/lib/toast-config.ts";
import { useAppStore } from "@/store/app-store.ts";
import { useLayoutStore } from "@/store/layout-store.ts";
import { useViewportStore } from "@/store/viewport-store.ts";
import { useZoneStore } from "@/store/zone-store.ts";
import type { FileType, ImageBuffer, InteractionMode } from "@/types/index.ts";
import type { LayoutRegion, LayoutRegionType } from "@/types/layout.ts";
import type { OcrZoneResult } from "@/types/ocr.ts";
import { useCallback, useEffect, useRef, useState } from "react";
import { Toaster } from "sonner";

/** Computes a rough total document size from page layouts for the FabricOverlay. */
function useDocumentSize() {
	const pages = useAppStore((s) => s.pages);
	if (pages.length === 0) return { width: 0, height: 0 };
	const maxWidth = Math.max(...pages.map((p) => p.width));
	const lastPage = pages[pages.length - 1];
	const totalHeight = lastPage.top + lastPage.height;
	return { width: maxWidth, height: totalHeight };
}

/**
 * Extracts ImageData from a DOM img element at its native resolution.
 * Used for layout detection on single-image documents.
 */
function extractImageFromDOM(imgEl: HTMLImageElement): {
	imageData: ImageData;
	width: number;
	height: number;
} {
	const canvas = document.createElement("canvas");
	canvas.width = imgEl.naturalWidth;
	canvas.height = imgEl.naturalHeight;
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Cannot create canvas 2d context");
	ctx.drawImage(imgEl, 0, 0);
	const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
	canvas.width = 0;
	canvas.height = 0;
	return { imageData, width: imgEl.naturalWidth, height: imgEl.naturalHeight };
}

/**
 * Extracts an ImageBuffer from the document by cropping the zone rectangle.
 *
 * Zone coordinates are in document space (CSS pixels at 100% zoom).
 * We need to map them to the image's native pixel space for drawImage.
 *
 * The output is rendered at a higher resolution (scaleFactor) for better OCR.
 */
function cropZoneFromDocument(rect: {
	left: number;
	top: number;
	width: number;
	height: number;
}): ImageBuffer {
	const pagesContainer = document.getElementById("pages-container");
	if (!pagesContainer) {
		const w = Math.max(1, Math.round(rect.width));
		const h = Math.max(1, Math.round(rect.height));
		return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
	}

	const imgs = pagesContainer.querySelectorAll("img");

	// Render at high resolution for OCR quality.
	// For PDFs rendered at displayScale=1.5, we want 300 DPI (scale ≈ 4.17).
	// So we need bestScale = 300/72 / displayScale ≈ 2.78x the CSS size.
	// For images, use natural/display ratio (often 1:1 or higher).
	// We aim for at least 300 DPI equivalent.
	let bestScale = 1;
	for (const img of imgs) {
		if (img.offsetWidth > 0) {
			const nativeScale = img.naturalWidth / img.offsetWidth;
			// Target ~300 DPI: if nativeScale is low (e.g., 1.5), boost further
			bestScale = Math.max(bestScale, Math.max(nativeScale, 2.5));
		}
	}

	const outW = Math.max(1, Math.round(rect.width * bestScale));
	const outH = Math.max(1, Math.round(rect.height * bestScale));
	const canvas = document.createElement("canvas");
	canvas.width = outW;
	canvas.height = outH;
	const ctx = canvas.getContext("2d");
	if (!ctx) {
		return {
			data: new Uint8ClampedArray(outW * outH * 4),
			width: outW,
			height: outH,
		};
	}

	// White background (so gaps between pages are white, not transparent)
	ctx.fillStyle = "white";
	ctx.fillRect(0, 0, outW, outH);

	for (const img of imgs) {
		// Position in document space (CSS pixels)
		const imgTop = img.offsetTop;
		const imgLeft = img.offsetLeft;
		const imgDisplayW = img.offsetWidth;
		const imgDisplayH = img.offsetHeight;

		// Scale factor from CSS pixels to native pixels for this image
		const scaleX = img.naturalWidth / imgDisplayW;
		const scaleY = img.naturalHeight / imgDisplayH;

		// Overlap in document space
		const overlapLeft = Math.max(rect.left, imgLeft);
		const overlapTop = Math.max(rect.top, imgTop);
		const overlapRight = Math.min(
			rect.left + rect.width,
			imgLeft + imgDisplayW,
		);
		const overlapBottom = Math.min(
			rect.top + rect.height,
			imgTop + imgDisplayH,
		);

		if (overlapRight > overlapLeft && overlapBottom > overlapTop) {
			// Source coordinates in native image pixels
			const sx = (overlapLeft - imgLeft) * scaleX;
			const sy = (overlapTop - imgTop) * scaleY;
			const sw = (overlapRight - overlapLeft) * scaleX;
			const sh = (overlapBottom - overlapTop) * scaleY;

			// Destination coordinates in output canvas
			const dx = (overlapLeft - rect.left) * bestScale;
			const dy = (overlapTop - rect.top) * bestScale;
			const dw = (overlapRight - overlapLeft) * bestScale;
			const dh = (overlapBottom - overlapTop) * bestScale;

			ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
		}
	}

	const imageData = ctx.getImageData(0, 0, outW, outH);

	// Destroy temp canvas
	canvas.width = 0;
	canvas.height = 0;
	return { data: imageData.data, width: outW, height: outH };
}

/** Adapter: wraps ocr-engine to match OcrEngine interface (recognize(ImageBuffer)). */
function createEngineAdapter(isGlobalOcr: boolean): {
	recognize: (
		image: ImageBuffer,
		onProgress?: (progress: number) => void,
	) => Promise<{ text: string; confidence: number }>;
} {
	return {
		async recognize(
			image: ImageBuffer,
			onProgress?: (progress: number) => void,
		) {
			const canvas = document.createElement("canvas");
			canvas.width = image.width;
			canvas.height = image.height;
			const ctx = canvas.getContext("2d");
			if (!ctx) throw new Error("Cannot create canvas context");

			const pixelData = new Uint8ClampedArray(image.data);
			const imageData = new ImageData(pixelData, image.width, image.height);
			ctx.putImageData(imageData, 0, 0);

			// Convert to data URL — Tesseract.js v7 handles it reliably
			const dataUrl = canvas.toDataURL("image/png");

			// Release temp canvas memory
			canvas.width = 0;
			canvas.height = 0;

			// Route progress through the mutable callback in ocr-engine
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
			const result = await ocrEngine.recognize(dataUrl, isGlobalOcr);
			return { text: result.text, confidence: result.confidence };
		},
	};
}

/** Stable cache key from zone geometry (rounded to avoid float drift). */
function zoneCacheKey(z: {
	left: number;
	top: number;
	width: number;
	height: number;
}): string {
	return `${Math.round(z.left)},${Math.round(z.top)},${Math.round(z.width)},${Math.round(z.height)}`;
}

function App() {
	const file = useAppStore((s) => s.file);
	const fileType = useAppStore((s) => s.fileType);
	const fileName = file?.name ?? null;
	const setFile = useAppStore((s) => s.setFile);
	const clearFile = useAppStore((s) => s.clearFile);
	const ocr = useAppStore((s) => s.ocr);
	const language = useAppStore((s) => s.language);
	const setLanguage = useAppStore((s) => s.setLanguage);
	const previewPreprocessing = useAppStore((s) => s.previewPreprocessing);
	const togglePreprocessingPreview = useAppStore(
		(s) => s.togglePreprocessingPreview,
	);
	const setOcrState = useAppStore((s) => s.setOcrState);

	const zones = useZoneStore((s) => s.zones);
	const mode = useZoneStore((s) => s.mode);
	const setMode = useZoneStore((s) => s.setMode);
	const clearZones = useZoneStore((s) => s.clearZones);
	const resetZones = useZoneStore((s) => s.reset);
	const snapshotCurrentZones = useZoneStore((s) => s.snapshotCurrentZones);
	const addAutoZones = useZoneStore((s) => s.addAutoZones);
	const clearAutoZones = useZoneStore((s) => s.clearAutoZones);
	const clearAutoZonesByType = useZoneStore((s) => s.clearAutoZonesByType);

	const detection = useLayoutStore((s) => s.detection);
	const enabledTypes = useLayoutStore((s) => s.enabledTypes);
	const detectionCache = useLayoutStore((s) => s.detectionCache);
	const setDetectionState = useLayoutStore((s) => s.setDetectionState);
	const toggleType = useLayoutStore((s) => s.toggleType);
	const setDetectionCache = useLayoutStore((s) => s.setDetectionCache);
	const clearDetectionCache = useLayoutStore((s) => s.clearDetectionCache);
	const resetLayoutStore = useLayoutStore((s) => s.reset);

	const zoom = useViewportStore((s) => s.zoom);
	const resetViewport = useViewportStore((s) => s.reset);
	const { width: docWidth, height: docHeight } = useDocumentSize();

	const browseInputRef = useRef<HTMLInputElement>(null);
	const abortControllerRef = useRef<AbortController | null>(null);
	const detectionAbortRef = useRef<AbortController | null>(null);
	const pdfProxyRef = useRef<unknown>(null);

	/** Cache of OCR results by zone geometry. Invalidated on file/language change. */
	const ocrCacheRef = useRef<Map<string, { text: string; confidence: number }>>(
		new Map(),
	);

	// Online status tracking
	const [isOnline, setIsOnline] = useState(
		typeof navigator !== "undefined" ? navigator.onLine : true,
	);

	useEffect(() => {
		const handleOnline = () => setIsOnline(true);
		const handleOffline = () => setIsOnline(false);
		window.addEventListener("online", handleOnline);
		window.addEventListener("offline", handleOffline);
		return () => {
			window.removeEventListener("online", handleOnline);
			window.removeEventListener("offline", handleOffline);
		};
	}, []);

	// Pending file state for FileReplaceDialog
	const [pendingFile, setPendingFile] = useState<{
		file: File;
		type: FileType;
	} | null>(null);

	// Pending close state for close confirmation dialog
	const [pendingClose, setPendingClose] = useState(false);

	useKeyboardShortcuts();

	// OCR results from done state or partial results during running
	const ocrResults: OcrZoneResult[] =
		ocr.status === "done"
			? ocr.results
			: ocr.status === "running"
				? ocr.partialResults
				: [];

	const hasZonesOrResults = zones.length > 0 || ocrResults.length > 0;
	const isDetecting = detection.status === "running";
	const autoZoneCount = zones.filter((z) => z.source === "auto").length;
	const hasDetectionCache = detectionCache !== null;

	const loadFile = useCallback(
		(f: File, type: FileType) => {
			abortControllerRef.current?.abort();
			detectionAbortRef.current?.abort();
			ocrCacheRef.current.clear();
			terminateYoloWorker();
			terminatePreprocessWorker();
			clearZones();
			clearDetectionCache();
			clearAutoZones();
			setDetectionState({ status: "idle" });
			setOcrState({ status: "idle" });
			pdfProxyRef.current = null;
			setFile(f, type);
		},
		[
			clearZones,
			clearDetectionCache,
			clearAutoZones,
			setDetectionState,
			setOcrState,
			setFile,
		],
	);

	const handleFileAccepted = useCallback(
		(f: File, type: FileType) => {
			if (hasZonesOrResults) {
				setPendingFile({ file: f, type });
			} else {
				loadFile(f, type);
			}
		},
		[hasZonesOrResults, loadFile],
	);

	const handleReplaceConfirm = useCallback(() => {
		if (pendingFile) {
			loadFile(pendingFile.file, pendingFile.type);
			setPendingFile(null);
		}
	}, [pendingFile, loadFile]);

	const handleReplaceCancel = useCallback(() => {
		setPendingFile(null);
	}, []);

	const handleFileRejected = useCallback((message: string) => {
		showError(message);
	}, []);

	const handleMultipleFiles = useCallback(() => {
		showWarning("Un seul fichier à la fois. Le premier a été utilisé.");
	}, []);

	const handleLoadError = useCallback(
		(message: string) => {
			showError(message);
			clearFile();
		},
		[clearFile],
	);

	const doClose = useCallback(() => {
		abortControllerRef.current?.abort();
		detectionAbortRef.current?.abort();
		ocrCacheRef.current.clear();
		terminatePreprocessWorker();
		terminateYoloWorker();
		resetLayoutStore();
		pdfProxyRef.current = null;
		clearFile();
		resetZones();
		resetViewport();
	}, [clearFile, resetZones, resetViewport, resetLayoutStore]);

	const handleClose = useCallback(() => {
		if (hasZonesOrResults) {
			setPendingClose(true);
		} else {
			doClose();
		}
	}, [hasZonesOrResults, doClose]);

	const handleCloseConfirm = useCallback(() => {
		setPendingClose(false);
		doClose();
	}, [doClose]);

	const handleCloseCancel = useCallback(() => {
		setPendingClose(false);
	}, []);

	const handleResetZoom = useCallback(() => {
		resetViewport();
	}, [resetViewport]);

	const handleModeChange = useCallback(
		(newMode: InteractionMode) => {
			setMode(newMode);
		},
		[setMode],
	);

	const handleClearZones = useCallback(() => {
		clearZones();
	}, [clearZones]);

	const handleFileBrowse = useCallback(() => {
		browseInputRef.current?.click();
	}, []);

	const handleBrowseInputChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const f = e.target.files?.[0];
			if (f) {
				handleFileAccepted(
					f,
					f.name.toLowerCase().endsWith(".pdf") ? "pdf" : "image",
				);
			}
			e.target.value = "";
		},
		[handleFileAccepted],
	);

	const handleLanguageChange = useCallback(
		(lang: LanguageCode) => {
			ocrCacheRef.current.clear();
			setLanguage(lang);
			ocrEngine.setLanguage(lang);
		},
		[setLanguage],
	);

	const handleDetectZones = useCallback(async () => {
		// Guard: mutual exclusion with OCR and re-entrancy
		if (useAppStore.getState().ocr.status === "running") return;
		if (useLayoutStore.getState().detection.status === "running") return;

		const {
			enabledTypes: types,
			detectionCache: cache,
			deletedRegionKeys: deleted,
		} = useLayoutStore.getState();
		const pages = useAppStore.getState().pages;
		const currentFile = useAppStore.getState().file;
		const currentFileType = useAppStore.getState().fileType;

		if (types.length === 0) {
			showWarning("Sélectionnez au moins un type de zone à détecter");
			return;
		}

		if (!currentFile) return;
		const fileId = buildFileId(currentFile);

		// Cache hit → instant recreation (only if all requested types were detected)
		const cacheCoversTypes =
			cache &&
			isCacheValid(cache, fileId) &&
			types.every((t) => cache.detectedTypes.includes(t));
		if (cacheCoversTypes) {
			clearAutoZones();
			const filtered = getFilteredRegions(cache.regionsByPage, types, deleted);
			const autoZones = regionsToAutoZones(
				filtered,
				pages,
				cache.sourceImageSizes,
			);
			addAutoZones(autoZones);
			return;
		}

		// Full detection
		clearAutoZones();
		const controller = new AbortController();
		detectionAbortRef.current = controller;

		const isPdf = currentFileType === "pdf";
		const totalPages = isPdf ? pages.length : 1;

		setDetectionState({
			status: "running",
			currentPage: 1,
			totalPages,
		});

		const regionsByPage: LayoutRegion[][] = [];
		const sourceImageSizes: { width: number; height: number }[] = [];
		let errorPages = 0;

		for (let i = 0; i < totalPages; i++) {
			if (controller.signal.aborted) break;
			setDetectionState({
				status: "running",
				currentPage: i + 1,
				totalPages,
			});

			try {
				let imageData: ImageData;
				let imgWidth: number;
				let imgHeight: number;

				if (isPdf) {
					const proxy = pdfProxyRef.current;
					if (!proxy) throw new Error("PDF proxy not available");
					const rendered = await renderPageForDetection(
						proxy as Parameters<typeof renderPageForDetection>[0],
						i,
					);
					imageData = rendered.imageData;
					imgWidth = rendered.width;
					imgHeight = rendered.height;
				} else {
					const pagesContainer = document.getElementById("pages-container");
					const imgEl = pagesContainer?.querySelector("img");
					if (!imgEl) throw new Error("Image element not found");
					const extracted = extractImageFromDOM(imgEl);
					imageData = extracted.imageData;
					imgWidth = extracted.width;
					imgHeight = extracted.height;
				}

				sourceImageSizes[i] = { width: imgWidth, height: imgHeight };

				if (controller.signal.aborted) break;

				// Transfer imageData directly — no copy needed since we don't reuse it
				const response = await detectInYoloWorker(
					{
						data: imageData.data as Uint8ClampedArray<ArrayBuffer>,
						width: imageData.width,
						height: imageData.height,
					},
					i,
				);

				if (response.error) {
					regionsByPage[i] = [];
					errorPages++;
				} else {
					// Only keep regions matching the requested types
					regionsByPage[i] = response.regions.filter((r) =>
						types.includes(r.type),
					);

					// Add auto zones for this page immediately
					const filtered = regionsByPage[i].map((r, idx) => ({
						region: r,
						regionKey: `${i}:${idx}`,
					}));
					const currentPages = useAppStore.getState().pages;
					const autoZones = regionsToAutoZones(
						filtered,
						currentPages,
						sourceImageSizes,
					);
					addAutoZones(autoZones);
				}
			} catch {
				regionsByPage[i] = [];
				sourceImageSizes[i] = sourceImageSizes[i] ?? {
					width: 0,
					height: 0,
				};
				errorPages++;
			}
		}

		// Guard: if a new run or file close has superseded us, bail
		if (detectionAbortRef.current !== controller) return;

		// Fill any missing indices (from abort)
		for (let j = 0; j < totalPages; j++) {
			regionsByPage[j] ??= [];
			sourceImageSizes[j] ??= { width: 0, height: 0 };
		}

		// Consolidated toasts and state transitions
		if (controller.signal.aborted) {
			// Don't cache partial results on abort — they're incomplete
			setDetectionState({ status: "idle" });
			const partialAutoZones = useZoneStore
				.getState()
				.zones.filter((z) => z.source === "auto");
			if (partialAutoZones.length > 0) {
				showInfo("Détection annulée — zones partielles conservées");
			} else {
				showInfo("Détection annulée");
			}
		} else {
			// Cache complete results
			setDetectionCache({
				fileId,
				regionsByPage,
				sourceImageSizes,
				detectedTypes: types,
			});
			setDetectionState({ status: "done" });

			if (errorPages > 0) {
				showWarning(`Détection échouée sur ${errorPages} page(s)`);
			}

			const allEmpty = regionsByPage.every((r) => r.length === 0);
			if (allEmpty) {
				showInfo("Aucune zone détectée");
			}
		}

		// Null the ref if we're still the current controller
		if (detectionAbortRef.current === controller) {
			detectionAbortRef.current = null;
		}
	}, [clearAutoZones, addAutoZones, setDetectionState, setDetectionCache]);

	const handleToggleType = useCallback(
		(type: LayoutRegionType) => {
			const {
				enabledTypes: types,
				detectionCache: cache,
				deletedRegionKeys: deleted,
			} = useLayoutStore.getState();
			const wasEnabled = types.includes(type);
			toggleType(type);

			if (wasEnabled) {
				clearAutoZonesByType(type);
			} else if (cache) {
				// Type was not detected in this run → need re-detection
				if (!cache.detectedTypes.includes(type)) {
					showInfo("Relancez la détection pour inclure ce type");
					return;
				}
				const filtered = getFilteredRegions(
					cache.regionsByPage,
					[type],
					deleted,
				);
				const pages = useAppStore.getState().pages;
				const autoZones = regionsToAutoZones(
					filtered,
					pages,
					cache.sourceImageSizes,
				);
				addAutoZones(autoZones);
			}
		},
		[toggleType, clearAutoZonesByType, addAutoZones],
	);

	const handleForceRedetect = useCallback(() => {
		clearDetectionCache();
		handleDetectZones();
	}, [clearDetectionCache, handleDetectZones]);

	const handleClearAutoZones = useCallback(() => {
		clearAutoZones();
	}, [clearAutoZones]);

	const handleDetectionCancel = useCallback(() => {
		detectionAbortRef.current?.abort();
	}, []);

	const handleOcrStart = useCallback(async () => {
		// Guard: mutual exclusion with detection
		if (useLayoutStore.getState().detection.status === "running") return;
		const snapshot = snapshotCurrentZones();
		const isGlobalOcr = snapshot.length === 0;

		// Guard: empty document
		if (docWidth === 0 || docHeight === 0) {
			showError("Le document ne contient pas d'image exploitable");
			return;
		}

		// Determine itemLabel and estimatedDPI
		const isPdf = fileType === "pdf";
		const isMultiPagePdf = isPdf && isGlobalOcr && pdfProxyRef.current !== null;
		const itemLabel: "Zone" | "Page" =
			isGlobalOcr && isMultiPagePdf ? "Page" : "Zone";
		const estimatedDPI = isGlobalOcr ? 300 : 150;

		// Build zones or ZoneProvider
		let zonesOrProvider: Parameters<typeof processZones>[0];
		let cachedResultsForMerge: OcrZoneResult[] = [];

		if (isMultiPagePdf) {
			// PDF multi-page: lazy ZoneProvider
			const pageCount = useAppStore.getState().pages.length;
			const provider: ZoneProvider = {
				count: pageCount,
				getZone: async (index: number) => {
					const currentProxy = pdfProxyRef.current;
					if (!currentProxy) {
						throw new ProxyDestroyedError();
					}
					const imageData = await renderPageForOcr(
						currentProxy as Parameters<typeof renderPageForOcr>[0],
						index,
					);
					return {
						id: index + 1,
						image: {
							data: new Uint8ClampedArray(imageData.data),
							width: imageData.width,
							height: imageData.height,
						},
					};
				},
			};
			zonesOrProvider = provider;
		} else if (isGlobalOcr) {
			// Single image or single-page PDF: one zone covering the whole document
			zonesOrProvider = [
				{
					id: 1,
					image: cropZoneFromDocument({
						left: 0,
						top: 0,
						width: docWidth,
						height: docHeight,
					}),
				},
			];
		} else {
			// User-drawn zones — check cache for unchanged zones
			const cachedResults: OcrZoneResult[] = [];
			const uncachedSnapshot: typeof snapshot = [];

			for (const z of snapshot) {
				const key = zoneCacheKey(z);
				const cached = ocrCacheRef.current.get(key);
				if (cached) {
					cachedResults.push({
						zoneId: z.id,
						text: cached.text,
						confidence: cached.confidence,
					});
				} else {
					uncachedSnapshot.push(z);
				}
			}

			// All zones cached — skip straight to done
			if (uncachedSnapshot.length === 0) {
				setOcrState({ status: "done", results: cachedResults });
				return;
			}

			zonesOrProvider = uncachedSnapshot.map((z) => ({
				id: z.id,
				image: cropZoneFromDocument({
					left: z.left,
					top: z.top,
					width: z.width,
					height: z.height,
				}),
			}));

			// Stash cached results to pre-populate partialResults
			cachedResultsForMerge = cachedResults;
		}

		const totalItems = isMultiPagePdf
			? useAppStore.getState().pages.length
			: Array.isArray(zonesOrProvider)
				? zonesOrProvider.length
				: 0;

		// Set initial running state (with cached results pre-populated if any)
		setOcrState({
			status: "running",
			currentItem: 1,
			totalItems,
			progress: 0,
			step: "preprocessing",
			itemLabel,
			partialResults: cachedResultsForMerge,
		});

		const controller = new AbortController();
		abortControllerRef.current = controller;

		try {
			const adapter = createEngineAdapter(isGlobalOcr);
			await processZones(zonesOrProvider, {
				engine: adapter,
				preprocess: async (image) =>
					preprocessInWorker(image, { estimatedDPI }),
				signal: controller.signal,
				onProgress: (progress) => {
					const current = useAppStore.getState().ocr;
					if (current.status !== "running") return;
					setOcrState({
						...current,
						currentItem: progress.currentItem,
						totalItems: progress.totalItems,
						progress: Math.round(progress.globalProgress * 100),
					});
				},
				onWarning: (message) => {
					showWarning(message);
				},
				onStepChange: (step) => {
					const current = useAppStore.getState().ocr;
					if (current.status !== "running") return;
					setOcrState({ ...current, step });
				},
				onItemComplete: (result) => {
					const postProcessed = {
						...result,
						text: postProcess(result.text),
					};
					const current = useAppStore.getState().ocr;
					if (current.status !== "running") return;
					setOcrState({
						...current,
						partialResults: [...current.partialResults, postProcessed],
					});
				},
			});

			// If a new run has started, don't touch state
			if (abortControllerRef.current !== controller) return;

			// Post-processZones: read partialResults from store (single source of truth)
			const finalState = useAppStore.getState().ocr;
			const partialResults =
				finalState.status === "running" ? finalState.partialResults : [];

			if (controller.signal.aborted) {
				if (partialResults.length > 0) {
					setOcrState({ status: "done", results: partialResults });
					showInfo("OCR annulé — résultats partiels affichés");
				} else {
					setOcrState({ status: "idle" });
					showInfo("OCR annulé");
				}
			} else {
				// Populate cache with newly processed zone results
				if (!isGlobalOcr) {
					for (const z of snapshot) {
						const result = partialResults.find((r) => r.zoneId === z.id);
						if (result) {
							ocrCacheRef.current.set(zoneCacheKey(z), {
								text: result.text,
								confidence: result.confidence,
							});
						}
					}
				}
				setOcrState({ status: "done", results: partialResults });
			}
		} catch (err) {
			if (!controller.signal.aborted) {
				// If a new run has started, don't touch state
				if (abortControllerRef.current !== controller) return;
				// Check for partial results even on error
				const finalState = useAppStore.getState().ocr;
				const partialResults =
					finalState.status === "running" ? finalState.partialResults : [];
				if (partialResults.length > 0) {
					setOcrState({ status: "done", results: partialResults });
					showWarning(
						err instanceof Error
							? err.message
							: "Une erreur est survenue pendant l'OCR.",
					);
				} else {
					setOcrState({ status: "idle" });
					showError(
						err instanceof Error
							? err.message
							: "Une erreur est survenue pendant l'OCR.",
					);
				}
			}
		} finally {
			// Guard: only nullify if this is still the current controller
			if (abortControllerRef.current === controller) {
				abortControllerRef.current = null;
			}
		}
	}, [snapshotCurrentZones, docWidth, docHeight, fileType, setOcrState]);

	const handleOcrCancel = useCallback(() => {
		abortControllerRef.current?.abort();
	}, []);

	const isOcrRunning = ocr.status === "running";

	const ocrProgress =
		ocr.status === "running"
			? {
					percentage: ocr.progress,
					currentItem: ocr.currentItem,
					totalItems: ocr.totalItems,
				}
			: null;

	return (
		<div className="flex h-screen w-screen flex-col">
			<Toaster
				position={TOAST_CONFIG.position}
				richColors
				visibleToasts={TOAST_CONFIG.maxVisible}
			/>

			{/* Hidden file input for toolbar browse button */}
			<input
				ref={browseInputRef}
				type="file"
				className="hidden"
				accept=".png,.jpg,.jpeg,.webp,.bmp,.pdf"
				onChange={handleBrowseInputChange}
			/>

			{/* File replace confirmation dialog */}
			<FileReplaceDialog
				open={pendingFile !== null}
				hasZonesOrResults={hasZonesOrResults}
				onConfirm={handleReplaceConfirm}
				onCancel={handleReplaceCancel}
			/>

			{/* Close confirmation dialog */}
			<FileReplaceDialog
				open={pendingClose}
				hasZonesOrResults={hasZonesOrResults}
				onConfirm={handleCloseConfirm}
				onCancel={handleCloseCancel}
			/>

			{file && fileType ? (
				<>
					<Toolbar
						fileName={fileName}
						zoneCount={zones.length}
						zoom={zoom}
						mode={mode}
						isOcrRunning={isOcrRunning}
						previewPreprocessing={previewPreprocessing}
						language={language}
						isOnline={isOnline}
						onDetectZones={handleDetectZones}
						isDetecting={isDetecting}
						enabledTypes={enabledTypes}
						onToggleType={handleToggleType}
						hasDetectionCache={hasDetectionCache}
						onForceRedetect={handleForceRedetect}
						autoZoneCount={autoZoneCount}
						onClearAutoZones={handleClearAutoZones}
						onFileClose={handleClose}
						onFileBrowse={handleFileBrowse}
						onModeChange={handleModeChange}
						onClearZones={handleClearZones}
						onPreviewToggle={togglePreprocessingPreview}
						onLanguageChange={handleLanguageChange}
						onOcrStart={handleOcrStart}
						onResetZoom={handleResetZoom}
					/>

					<ProgressBar
						visible={isOcrRunning || isDetecting}
						percentage={
							isDetecting
								? detection.status === "running"
									? Math.round(
											(detection.currentPage / detection.totalPages) * 100,
										)
									: 0
								: (ocrProgress?.percentage ?? 0)
						}
						step={
							isDetecting
								? "detecting"
								: ocr.status === "running"
									? ocr.step
									: "recognizing"
						}
						itemLabel={
							isDetecting
								? "Page"
								: ocr.status === "running"
									? ocr.itemLabel
									: "Zone"
						}
						currentItem={
							isDetecting && detection.status === "running"
								? detection.currentPage
								: ocrProgress && ocrProgress.totalItems > 1
									? ocrProgress.currentItem
									: undefined
						}
						totalItems={
							isDetecting && detection.status === "running"
								? detection.totalPages
								: ocrProgress && ocrProgress.totalItems > 1
									? ocrProgress.totalItems
									: undefined
						}
						onCancel={isDetecting ? handleDetectionCancel : handleOcrCancel}
					/>

					{/* Document area with optional results panel */}
					<div className="flex flex-1 overflow-hidden">
						<DocumentViewer
							file={file}
							fileType={fileType}
							onLoadError={handleLoadError}
							onPdfProxyReady={(proxy) => {
								pdfProxyRef.current = proxy;
							}}
						>
							{docWidth > 0 && docHeight > 0 && (
								<FabricOverlay width={docWidth} height={docHeight} />
							)}
						</DocumentViewer>

						{ocrResults.length > 0 && (
							<ResultsPanel
								results={ocrResults}
								isGlobalOcr={
									ocr.status === "running"
										? ocr.itemLabel === "Page"
										: zones.length === 0
								}
							/>
						)}
					</div>

					<CoachMark />
				</>
			) : (
				<div className="flex flex-1 items-center justify-center">
					<DropZone
						onFileAccepted={handleFileAccepted}
						onFileRejected={handleFileRejected}
						onMultipleFilesWarning={handleMultipleFiles}
					/>
				</div>
			)}
		</div>
	);
}

export default App;
