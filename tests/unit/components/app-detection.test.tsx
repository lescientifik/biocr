import App from "@/App.tsx";
import { useAppStore } from "@/store/app-store.ts";
import { useLayoutStore } from "@/store/layout-store.ts";
import { useViewportStore } from "@/store/viewport-store.ts";
import { useZoneStore } from "@/store/zone-store.ts";
import type { LayoutRegion } from "@/types/layout.ts";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---- Module mocks ----

vi.mock("@/components/FabricOverlay.tsx", () => ({
	FabricOverlay: () => <div data-testid="fabric-overlay-mock" />,
}));

const mockRenderPageForDetection = vi.fn();
const mockLoadAndRenderPdf = vi.fn();

vi.mock("@/lib/pdf-renderer.ts", () => ({
	loadAndRenderPdf: (...args: unknown[]) => mockLoadAndRenderPdf(...args),
	renderPageForOcr: vi.fn(),
	renderPageForDetection: (...args: unknown[]) =>
		mockRenderPageForDetection(...args),
}));

vi.mock("@/lib/ocr-engine.ts", () => ({
	getEngine: vi.fn(() => Promise.resolve({})),
	recognize: vi.fn(() =>
		Promise.resolve({ text: "mock text", confidence: 95 }),
	),
	setLanguage: vi.fn(() => Promise.resolve()),
	setProgressCallback: vi.fn(),
	terminate: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/ocr-coordinator.ts", () => ({
	processZones: vi.fn(() => new Promise(() => {})),
}));

vi.mock("@/lib/preprocessing/worker-wrapper.ts", () => ({
	preprocessInWorker: vi.fn((image) => Promise.resolve(image)),
	terminatePreprocessWorker: vi.fn(),
}));

const mockDetectInWorker = vi.fn();
const mockTerminateDetectionWorker = vi.fn();

vi.mock("@/lib/layout-detection/worker-wrapper.ts", () => ({
	detectInWorker: (...args: unknown[]) => mockDetectInWorker(...args),
	terminateDetectionWorker: (...args: unknown[]) =>
		mockTerminateDetectionWorker(...args),
}));

const mockShowWarning = vi.fn();
const mockShowInfo = vi.fn();
const mockShowError = vi.fn();

vi.mock("@/lib/toast-config.ts", () => ({
	TOAST_CONFIG: {
		position: "bottom-right",
		maxVisible: 3,
		defaultDuration: 5000,
		errorDuration: Number.POSITIVE_INFINITY,
	},
	showError: (...args: unknown[]) => mockShowError(...args),
	showInfo: (...args: unknown[]) => mockShowInfo(...args),
	showWarning: (...args: unknown[]) => mockShowWarning(...args),
	showSuccess: vi.fn(),
}));

// Polyfill ImageData for happy-dom
if (typeof globalThis.ImageData === "undefined") {
	(globalThis as Record<string, unknown>).ImageData = class ImageData {
		data: Uint8ClampedArray;
		width: number;
		height: number;
		constructor(
			widthOrData: number | Uint8ClampedArray,
			heightOrWidth: number,
			maybeHeight?: number,
		) {
			if (typeof widthOrData === "number") {
				this.width = widthOrData;
				this.height = heightOrWidth;
				this.data = new Uint8ClampedArray(this.width * this.height * 4);
			} else {
				this.data = widthOrData;
				this.width = heightOrWidth;
				this.height = maybeHeight ?? widthOrData.length / (heightOrWidth * 4);
			}
		}
	};
}

// ---- Helpers ----

function installMockImage(): void {
	vi.stubGlobal("Image", function MockImageConstructor() {
		const img = {
			naturalWidth: 800,
			naturalHeight: 600,
			onload: null as (() => void) | null,
			onerror: null as (() => void) | null,
			_src: "",
		};
		Object.defineProperty(img, "src", {
			get: () => img._src,
			set: (v: string) => {
				img._src = v;
				setTimeout(() => img.onload?.(), 0);
			},
		});
		return img;
	});
}

function fakeFile(name: string): File {
	return new File([new Uint8Array(100)], name, {
		type: "application/octet-stream",
	});
}

function makeRegion(
	type: LayoutRegion["type"],
	bbox = { x: 10, y: 10, width: 100, height: 50 },
): LayoutRegion {
	return { type, bbox, confidence: 1.0 };
}

/** Sets up app state with a loaded image file and pages layout. */
function setupWithImage(name = "photo.png") {
	installMockImage();
	useAppStore.setState({
		file: fakeFile(name),
		fileType: "image",
		pages: [{ pageIndex: 0, top: 0, width: 800, height: 600 }],
	});
}

/** Sets up app state with a loaded PDF file and pages layout. */
function setupWithPdf(pageCount = 3) {
	installMockImage();
	const pages = Array.from({ length: pageCount }, (_, i) => ({
		pageIndex: i,
		top: i * 800,
		width: 612,
		height: 792,
	}));
	useAppStore.setState({
		file: fakeFile("doc.pdf"),
		fileType: "pdf",
		pages,
	});
}

describe("App — detection integration", () => {
	beforeEach(() => {
		mockDetectInWorker.mockReset();
		mockTerminateDetectionWorker.mockReset();
		mockRenderPageForDetection.mockReset();
		mockLoadAndRenderPdf.mockReset();
		mockShowWarning.mockReset();
		mockShowInfo.mockReset();
		mockShowError.mockReset();
		// Default loadAndRenderPdf mock — returns 1 page
		mockLoadAndRenderPdf.mockResolvedValue({
			pages: [{ blobUrl: "blob:page1", width: 612, height: 792 }],
			pageCount: 1,
			proxy: { destroy: vi.fn(), getPage: vi.fn() },
		});
	});

	afterEach(() => {
		cleanup();
		useAppStore.getState().reset();
		useViewportStore.getState().reset();
		useZoneStore.getState().reset();
		useLayoutStore.getState().reset();
	});

	// ---- Detection with 0 types → toast warning ----

	it("shows warning toast when detecting with 0 enabled types", async () => {
		setupWithImage();
		useLayoutStore.setState({ enabledTypes: [] });
		render(<App />);

		const btn = screen.getByRole("button", { name: "Détecter zones" });
		await userEvent.click(btn);

		expect(mockShowWarning).toHaveBeenCalledWith(
			"Sélectionnez au moins un type de zone à détecter",
		);
		expect(useZoneStore.getState().zones).toHaveLength(0);
	});

	// ---- Detection with cache valid → instant recreation ----

	it("uses cache for instant zone creation without calling worker", async () => {
		setupWithImage();
		const file = useAppStore.getState().file as File;
		const fileId = `${file.name}:${file.size}:${file.lastModified}`;
		useLayoutStore.setState({
			enabledTypes: ["table", "text"],
			detectionCache: {
				fileId,
				regionsByPage: [[makeRegion("table"), makeRegion("text")]],
				sourceImageSizes: [{ width: 800, height: 600 }],
			},
		});
		render(<App />);

		const btn = screen.getByRole("button", { name: "Détecter zones" });
		await userEvent.click(btn);

		// Zones should be added instantly from cache
		const zones = useZoneStore.getState().zones;
		expect(zones.length).toBe(2);
		expect(zones.every((z) => z.source === "auto")).toBe(true);
		// detectInWorker should NOT have been called
		expect(mockDetectInWorker).not.toHaveBeenCalled();
	});

	// ---- PDF multi-page detection → auto zones ----

	it("creates auto zones after PDF multi-page detection", async () => {
		setupWithPdf(3);
		mockLoadAndRenderPdf.mockResolvedValue({
			pages: Array.from({ length: 3 }, (_, i) => ({
				blobUrl: `blob:page${i}`,
				width: 612,
				height: 792,
			})),
			pageCount: 3,
			proxy: { destroy: vi.fn(), getPage: vi.fn() },
		});

		mockRenderPageForDetection.mockResolvedValue({
			imageData: new ImageData(10, 10),
			width: 100,
			height: 100,
		});
		mockDetectInWorker.mockResolvedValue({
			regions: [makeRegion("table")],
			pageIndex: 0,
			nonce: 1,
		});

		render(<App />);

		// Wait for DocumentViewer to load the PDF and set the proxy
		await waitFor(() => {
			expect(screen.queryByAltText("Page 1")).toBeTruthy();
		});

		const btn = screen.getByRole("button", { name: "Détecter zones" });
		await userEvent.click(btn);

		await waitFor(() => {
			expect(useLayoutStore.getState().detection.status).toBe("done");
		});

		const zones = useZoneStore.getState().zones;
		// 1 table region per page x 3 pages
		expect(zones.length).toBe(3);
		expect(zones.every((z) => z.source === "auto")).toBe(true);
		expect(mockDetectInWorker).toHaveBeenCalledTimes(3);
	});

	// ---- Toggle type OFF removes zones of that type ----

	it("removes auto zones of that type when toggling type OFF", async () => {
		setupWithImage();
		useZoneStore.getState().addAutoZones([
			{
				left: 0,
				top: 0,
				width: 100,
				height: 50,
				source: "auto",
				label: "table",
				regionKey: "0:0",
			},
			{
				left: 0,
				top: 100,
				width: 100,
				height: 50,
				source: "auto",
				label: "text",
				regionKey: "0:1",
			},
		]);
		useLayoutStore.setState({ enabledTypes: ["table", "text"] });

		render(<App />);

		// Open filter popover and uncheck "Tableau"
		const filterBtn = screen.getByLabelText("Filtres de détection");
		await userEvent.click(filterBtn);

		const tableCheckbox = screen.getByRole("checkbox", { name: /tableau/i });
		await userEvent.click(tableCheckbox);

		const zones = useZoneStore.getState().zones;
		expect(zones.length).toBe(1);
		expect(zones[0].label).toBe("text");
	});

	// ---- Toggle type ON with cache re-adds zones ----

	it("re-adds auto zones from cache when toggling type ON", async () => {
		setupWithImage();
		const file = useAppStore.getState().file as File;
		const fileId = `${file.name}:${file.size}:${file.lastModified}`;

		useLayoutStore.setState({
			enabledTypes: ["text"], // table is OFF
			detectionCache: {
				fileId,
				regionsByPage: [[makeRegion("table"), makeRegion("text")]],
				sourceImageSizes: [{ width: 800, height: 600 }],
			},
		});

		// Only text zones present
		useZoneStore.getState().addAutoZones([
			{
				left: 0,
				top: 0,
				width: 100,
				height: 50,
				source: "auto",
				label: "text",
				regionKey: "0:1",
			},
		]);

		render(<App />);

		// Open filter popover and check "Tableau"
		const filterBtn = screen.getByLabelText("Filtres de détection");
		await userEvent.click(filterBtn);

		const tableCheckbox = screen.getByRole("checkbox", { name: /tableau/i });
		await userEvent.click(tableCheckbox);

		const zones = useZoneStore.getState().zones;
		const tableZones = zones.filter((z) => z.label === "table");
		expect(tableZones.length).toBe(1);
		expect(tableZones[0].source).toBe("auto");
	});

	// ---- Toggle ON without cache → nothing added ----

	it("does not add zones when toggling type ON without cache", async () => {
		setupWithImage();
		useLayoutStore.setState({
			enabledTypes: ["text"],
			detectionCache: null,
		});

		render(<App />);

		const filterBtn = screen.getByLabelText("Filtres de détection");
		await userEvent.click(filterBtn);

		const headerCheckbox = screen.getByRole("checkbox", {
			name: /en-tête/i,
		});
		await userEvent.click(headerCheckbox);

		expect(useZoneStore.getState().zones).toHaveLength(0);
	});

	// ---- Toggle OFF then ON with deleted region → deleted absent ----

	it("excludes manually deleted zones when toggling type back ON", async () => {
		setupWithImage();
		const file = useAppStore.getState().file as File;
		const fileId = `${file.name}:${file.size}:${file.lastModified}`;

		useLayoutStore.setState({
			enabledTypes: ["text"], // table OFF
			detectionCache: {
				fileId,
				regionsByPage: [
					[makeRegion("table"), makeRegion("table"), makeRegion("text")],
				],
				sourceImageSizes: [{ width: 800, height: 600 }],
			},
			deletedRegionKeys: ["0:0"], // first table region deleted
		});

		render(<App />);

		// Open filter popover and enable table
		const filterBtn = screen.getByLabelText("Filtres de détection");
		await userEvent.click(filterBtn);

		const tableCheckbox = screen.getByRole("checkbox", { name: /tableau/i });
		await userEvent.click(tableCheckbox);

		const zones = useZoneStore.getState().zones;
		const tableZones = zones.filter((z) => z.label === "table");
		// Only 1 table zone (0:1), not 2, because 0:0 is deleted
		expect(tableZones.length).toBe(1);
		expect(tableZones[0].regionKey).toBe("0:1");
	});

	// ---- Mutual exclusion: OCR disabled during detection ----

	it("disables OCR button when detecting", () => {
		setupWithImage();
		useLayoutStore.setState({
			detection: { status: "running", currentPage: 1, totalPages: 3 },
		});
		render(<App />);

		const ocrBtn = screen.getByRole("button", { name: /ocr/i });
		expect(ocrBtn).toBeDisabled();
	});

	// ---- Mutual exclusion: Detect disabled during OCR ----

	it("disables Detect button when OCR is running", () => {
		setupWithImage();
		useAppStore.setState({
			...useAppStore.getState(),
			ocr: {
				status: "running",
				currentItem: 1,
				totalItems: 1,
				progress: 50,
				step: "recognizing",
				itemLabel: "Zone",
				partialResults: [],
			},
		});
		render(<App />);

		const detectBtn = screen.getByRole("button", {
			name: "Détecter zones",
		});
		expect(detectBtn).toBeDisabled();
	});

	// ---- Force re-detect clears deletedRegionKeys ----

	it("clears deleted keys and re-runs detection on force re-detect", async () => {
		setupWithPdf(1);
		const file = useAppStore.getState().file as File;
		const fileId = `${file.name}:${file.size}:${file.lastModified}`;

		useLayoutStore.setState({
			enabledTypes: ["table"],
			detectionCache: {
				fileId,
				regionsByPage: [[makeRegion("table"), makeRegion("table")]],
				sourceImageSizes: [{ width: 100, height: 100 }],
			},
			deletedRegionKeys: ["0:0"],
		});

		mockRenderPageForDetection.mockResolvedValue({
			imageData: new ImageData(10, 10),
			width: 100,
			height: 100,
		});
		mockDetectInWorker.mockResolvedValue({
			regions: [makeRegion("table"), makeRegion("table")],
			pageIndex: 0,
			nonce: 1,
		});

		render(<App />);

		// Wait for DocumentViewer to load the PDF
		await waitFor(() => {
			expect(screen.queryByAltText("Page 1")).toBeTruthy();
		});

		// Open filter popover
		const filterBtn = screen.getByLabelText("Filtres de détection");
		await userEvent.click(filterBtn);

		// Click Re-détecter
		const redetectBtn = screen.getByText("Re-détecter");
		await userEvent.click(redetectBtn);

		await waitFor(() => {
			expect(useLayoutStore.getState().detection.status).toBe("done");
		});

		// deletedRegionKeys should be cleared (clearDetectionCache clears them)
		expect(useLayoutStore.getState().deletedRegionKeys).toHaveLength(0);
		// Both table zones should be present (none deleted)
		const zones = useZoneStore.getState().zones;
		const tableZones = zones.filter((z) => z.label === "table");
		expect(tableZones.length).toBe(2);
	});

	// ---- doClose cleans up detection state ----

	it("cleans up detection state on close", async () => {
		setupWithImage();
		const file = useAppStore.getState().file as File;
		const fileId = `${file.name}:${file.size}:${file.lastModified}`;

		useLayoutStore.setState({
			detectionCache: {
				fileId,
				regionsByPage: [[makeRegion("table")]],
				sourceImageSizes: [{ width: 800, height: 600 }],
			},
		});
		useZoneStore.getState().addAutoZones([
			{
				left: 0,
				top: 0,
				width: 100,
				height: 50,
				source: "auto",
				label: "table",
				regionKey: "0:0",
			},
		]);

		render(<App />);

		const closeBtn = screen.getByLabelText("Fermer le fichier");
		await userEvent.click(closeBtn);

		// Auto zone counts as hasZonesOrResults, so close shows confirmation
		const confirmBtn = screen.getByText("Continuer");
		await userEvent.click(confirmBtn);

		expect(useZoneStore.getState().zones).toHaveLength(0);
		expect(useLayoutStore.getState().detectionCache).toBeNull();
		expect(useLayoutStore.getState().detection.status).toBe("idle");
		expect(mockTerminateDetectionWorker).toHaveBeenCalled();
	});

	// ---- New file load clears detection state ----

	it("clears detection state when loading a new file", async () => {
		setupWithImage();
		const file = useAppStore.getState().file as File;
		const fileId = `${file.name}:${file.size}:${file.lastModified}`;

		useLayoutStore.setState({
			detectionCache: {
				fileId,
				regionsByPage: [[makeRegion("table")]],
				sourceImageSizes: [{ width: 800, height: 600 }],
			},
		});

		render(<App />);

		// Trigger file load via hidden browse input
		const browseInput = document.querySelector(
			'input[type="file"]',
		) as HTMLInputElement;
		const newFile = fakeFile("new.png");
		await userEvent.upload(browseInput, newFile);

		expect(useLayoutStore.getState().detectionCache).toBeNull();
	});

	// ---- Page error during detection → partial zones + warning ----

	it("shows warning for errored pages and keeps zones from successful pages", async () => {
		setupWithPdf(3);
		mockLoadAndRenderPdf.mockResolvedValue({
			pages: Array.from({ length: 3 }, (_, i) => ({
				blobUrl: `blob:page${i}`,
				width: 612,
				height: 792,
			})),
			pageCount: 3,
			proxy: { destroy: vi.fn(), getPage: vi.fn() },
		});

		let callIndex = 0;
		mockRenderPageForDetection.mockImplementation(() => {
			callIndex++;
			if (callIndex === 2) {
				return Promise.reject(new Error("Page render failed"));
			}
			return Promise.resolve({
				imageData: new ImageData(10, 10),
				width: 100,
				height: 100,
			});
		});

		mockDetectInWorker.mockResolvedValue({
			regions: [makeRegion("table")],
			pageIndex: 0,
			nonce: 1,
		});

		render(<App />);

		// Wait for DocumentViewer to load
		await waitFor(() => {
			expect(screen.queryByAltText("Page 1")).toBeTruthy();
		});

		const btn = screen.getByRole("button", { name: "Détecter zones" });
		await userEvent.click(btn);

		await waitFor(() => {
			expect(useLayoutStore.getState().detection.status).toBe("done");
		});

		// 2 successful pages with 1 table zone each
		const zones = useZoneStore.getState().zones;
		expect(zones.length).toBe(2);
		expect(mockShowWarning).toHaveBeenCalledWith(
			"Détection échouée sur 1 page(s)",
		);
	});

	// ---- No zones detected → info toast ----

	it("shows info toast when no zones detected on PDF", async () => {
		setupWithPdf(1);
		mockRenderPageForDetection.mockResolvedValue({
			imageData: new ImageData(10, 10),
			width: 100,
			height: 100,
		});
		mockDetectInWorker.mockResolvedValue({
			regions: [],
			pageIndex: 0,
			nonce: 1,
		});

		render(<App />);

		// Wait for DocumentViewer to load
		await waitFor(() => {
			expect(screen.queryByAltText("Page 1")).toBeTruthy();
		});

		const btn = screen.getByRole("button", { name: "Détecter zones" });
		await userEvent.click(btn);

		await waitFor(() => {
			expect(useLayoutStore.getState().detection.status).toBe("done");
		});

		expect(mockShowInfo).toHaveBeenCalledWith("Aucune zone détectée");
		expect(useZoneStore.getState().zones).toHaveLength(0);
	});

	// ---- Clear auto zones ----

	it("clears only auto zones when clicking 'Effacer zones auto'", async () => {
		setupWithImage();

		// Add manual and auto zones
		useZoneStore.getState().addZone({
			left: 0,
			top: 0,
			width: 100,
			height: 50,
		});
		useZoneStore.getState().addAutoZones([
			{
				left: 200,
				top: 0,
				width: 100,
				height: 50,
				source: "auto",
				label: "table",
				regionKey: "0:0",
			},
		]);

		// Set cache to verify it's preserved
		const file = useAppStore.getState().file as File;
		const fileId = `${file.name}:${file.size}:${file.lastModified}`;
		useLayoutStore.setState({
			detectionCache: {
				fileId,
				regionsByPage: [[makeRegion("table")]],
				sourceImageSizes: [{ width: 800, height: 600 }],
			},
		});

		render(<App />);

		const clearBtn = screen.getByText("Effacer zones auto");
		await userEvent.click(clearBtn);

		const zones = useZoneStore.getState().zones;
		expect(zones.length).toBe(1);
		expect(zones[0].source).toBeUndefined(); // manual zone
		// Cache is preserved
		expect(useLayoutStore.getState().detectionCache).not.toBeNull();
	});

	// ---- ProgressBar visible during detection ----

	it("shows ProgressBar with detecting step during detection", () => {
		setupWithImage();
		useLayoutStore.setState({
			detection: { status: "running", currentPage: 2, totalPages: 5 },
		});
		render(<App />);

		expect(screen.getByRole("progressbar")).toBeTruthy();
		expect(screen.getByText(/Détection…/)).toBeTruthy();
		expect(screen.getByText(/2\/5/)).toBeTruthy();
	});

	// ---- Cancellation during detection ----

	it("aborts detection when cancel is clicked", async () => {
		setupWithPdf(1);

		// renderPageForDetection resolves fine
		mockRenderPageForDetection.mockResolvedValue({
			imageData: new ImageData(10, 10),
			width: 100,
			height: 100,
		});

		// detectInWorker hangs until we abort
		let workerResolve: ((v: unknown) => void) | null = null;
		mockDetectInWorker.mockImplementation(
			() =>
				new Promise((resolve) => {
					workerResolve = resolve;
				}),
		);

		render(<App />);

		// Wait for DocumentViewer to load
		await waitFor(() => {
			expect(screen.queryByAltText("Page 1")).toBeTruthy();
		});

		const btn = screen.getByRole("button", { name: "Détecter zones" });
		await userEvent.click(btn);

		// Wait for renderPageForDetection to be called (detection started)
		await waitFor(() => {
			expect(mockRenderPageForDetection).toHaveBeenCalled();
		});

		// Click cancel to abort
		const cancelBtn = screen.getByRole("button", { name: /annuler/i });
		await userEvent.click(cancelBtn);

		// Resolve the pending worker to unblock the detection loop
		workerResolve?.({
			regions: [],
			pageIndex: 0,
			nonce: 0,
		});

		// After abort, the loop should finish and set status to idle (no caching on abort)
		await waitFor(() => {
			expect(useLayoutStore.getState().detection.status).toBe("idle");
		});

		expect(mockShowInfo).toHaveBeenCalledWith(
			expect.stringContaining("Détection annulée"),
		);
	});
});
