import App from "@/App.tsx";
import { useAppStore } from "@/store/app-store.ts";
import { useViewportStore } from "@/store/viewport-store.ts";
import { useZoneStore } from "@/store/zone-store.ts";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

// Mock FabricOverlay to avoid canvas errors in happy-dom
vi.mock("@/components/FabricOverlay.tsx", () => ({
	FabricOverlay: () => <div data-testid="fabric-overlay-mock" />,
}));

// Mock the pdf-renderer module to avoid real PDF loading
vi.mock("@/lib/pdf-renderer.ts", () => ({
	loadAndRenderPdf: vi.fn(() =>
		Promise.resolve({
			pages: [{ blobUrl: "blob:page1", width: 612, height: 792 }],
			pageCount: 1,
			proxy: { destroy: vi.fn() },
		}),
	),
	renderPageForOcr: vi.fn(),
}));

// Mock OCR engine to avoid real Tesseract loading
vi.mock("@/lib/ocr-engine.ts", () => ({
	getEngine: vi.fn(() => Promise.resolve({})),
	recognize: vi.fn(() =>
		Promise.resolve({ text: "mock text", confidence: 95 }),
	),
	setLanguage: vi.fn(() => Promise.resolve()),
	terminate: vi.fn(() => Promise.resolve()),
}));

// Mock OCR coordinator — return a never-resolving promise so status stays "running"
vi.mock("@/lib/ocr-coordinator.ts", () => ({
	processZones: vi.fn(() => new Promise(() => {})),
}));

// Mock preprocessing worker wrapper
vi.mock("@/lib/preprocessing/worker-wrapper.ts", () => ({
	preprocessInWorker: vi.fn((image) => Promise.resolve(image)),
	terminatePreprocessWorker: vi.fn(),
}));

// Mock Image constructor to avoid real image loading
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

describe("App — toolbar integration", () => {
	afterEach(() => {
		cleanup();
		useAppStore.getState().reset();
		useViewportStore.getState().reset();
		useZoneStore.getState().reset();
	});

	it("displays zoom percentage when a file is loaded", () => {
		installMockImage();
		useAppStore.setState({ file: fakeFile("photo.png"), fileType: "image" });
		render(<App />);
		expect(screen.getByText("100%")).toBeTruthy();
	});

	it("displays correct zoom percentage at non-default zoom", () => {
		installMockImage();
		useAppStore.setState({ file: fakeFile("photo.png"), fileType: "image" });
		useViewportStore.setState({ zoom: 1.5 });
		render(<App />);
		expect(screen.getByText("150%")).toBeTruthy();
	});

	it("shows a Reset zoom button when a file is loaded", () => {
		installMockImage();
		useAppStore.setState({ file: fakeFile("photo.png"), fileType: "image" });
		render(<App />);
		expect(screen.getByLabelText("Reset zoom")).toBeTruthy();
	});

	it("clicking Reset zoom resets the viewport", async () => {
		installMockImage();
		useAppStore.setState({ file: fakeFile("photo.png"), fileType: "image" });
		useViewportStore.setState({ zoom: 2.5, panX: 100, panY: 200 });
		render(<App />);

		const resetBtn = screen.getByLabelText("Reset zoom");
		await userEvent.click(resetBtn);

		const { zoom, panX, panY } = useViewportStore.getState();
		expect(zoom).toBe(1);
		expect(panX).toBe(0);
		expect(panY).toBe(0);
	});

	it("shows the Toolbar when a file is loaded", () => {
		installMockImage();
		useAppStore.setState({ file: fakeFile("scan.pdf"), fileType: "pdf" });
		render(<App />);
		expect(screen.getByText("scan.pdf")).toBeTruthy();
		expect(screen.getByLabelText("Fermer le fichier")).toBeTruthy();
	});

	it("hides the Toolbar when no file is loaded", () => {
		render(<App />);
		expect(screen.queryByRole("toolbar")).toBeNull();
	});

	it("shows OCR button that triggers running state", async () => {
		installMockImage();
		useAppStore.setState({
			file: fakeFile("photo.png"),
			fileType: "image",
			pages: [{ top: 0, left: 0, width: 800, height: 600 }],
		});
		render(<App />);

		const ocrBtn = screen.getByRole("button", { name: /ocr document/i });
		await userEvent.click(ocrBtn);

		expect(useAppStore.getState().ocr.status).toBe("running");
	});

	it("shows ProgressBar when OCR is running", () => {
		installMockImage();
		useAppStore.setState({
			file: fakeFile("photo.png"),
			fileType: "image",
			ocr: {
				status: "running",
				currentItem: 1,
				totalItems: 1,
				progress: 42,
				step: "recognizing",
				itemLabel: "Zone",
				partialResults: [],
			},
		});
		render(<App />);
		expect(screen.getByRole("progressbar")).toBeTruthy();
	});

	it("hides ProgressBar when OCR is idle", () => {
		installMockImage();
		useAppStore.setState({
			file: fakeFile("photo.png"),
			fileType: "image",
			ocr: { status: "idle" },
		});
		render(<App />);
		expect(screen.queryByRole("progressbar")).toBeNull();
	});

	it("handleOcrCancel only calls abort without setting idle", async () => {
		installMockImage();
		useAppStore.setState({
			file: fakeFile("photo.png"),
			fileType: "image",
			pages: [{ top: 0, left: 0, width: 800, height: 600 }],
		});
		render(<App />);

		// Start OCR to get into running state
		const ocrBtn = screen.getByRole("button", { name: /ocr document/i });
		await userEvent.click(ocrBtn);
		expect(useAppStore.getState().ocr.status).toBe("running");

		// Cancel OCR — should NOT immediately set to idle (handleOcrStart handles that)
		const cancelBtn = screen.getByRole("button", { name: /annuler/i });
		await userEvent.click(cancelBtn);

		// State should still be running (the abort signal will be handled by handleOcrStart's finally)
		// Since processZones is mocked to never resolve, the state stays running
		expect(useAppStore.getState().ocr.status).toBe("running");
	});

	it("doClose aborts OCR and terminates worker", async () => {
		const { terminatePreprocessWorker } = await import(
			"@/lib/preprocessing/worker-wrapper.ts"
		);
		installMockImage();
		useAppStore.setState({
			file: fakeFile("photo.png"),
			fileType: "image",
		});
		render(<App />);

		const closeBtn = screen.getByLabelText("Fermer le fichier");
		await userEvent.click(closeBtn);

		expect(terminatePreprocessWorker).toHaveBeenCalled();
	});

	it("loadFile aborts OCR before setting file", async () => {
		installMockImage();
		useAppStore.setState({
			file: fakeFile("photo.png"),
			fileType: "image",
			pages: [{ top: 0, left: 0, width: 800, height: 600 }],
		});
		render(<App />);

		// Start OCR so status becomes "running"
		const ocrBtn = screen.getByRole("button", { name: /ocr document/i });
		await userEvent.click(ocrBtn);
		expect(useAppStore.getState().ocr.status).toBe("running");

		// Trigger a new file load via the hidden browse input.
		// With no zones and no partial results, hasZonesOrResults is false,
		// so handleFileAccepted calls loadFile directly (abort + idle + setFile).
		const browseInput = document.querySelector(
			'input[type="file"]',
		) as HTMLInputElement;
		expect(browseInput).toBeTruthy();

		const newFile = fakeFile("new.png");
		await userEvent.upload(browseInput, newFile);

		// loadFile should have aborted OCR and reset to idle
		expect(useAppStore.getState().ocr.status).toBe("idle");
		// The new file should be loaded
		expect(useAppStore.getState().file?.name).toBe("new.png");
	});

	it("ResultsPanel shows during running with partialResults", () => {
		installMockImage();
		useAppStore.setState({
			file: fakeFile("photo.png"),
			fileType: "image",
			ocr: {
				status: "running",
				currentItem: 2,
				totalItems: 3,
				progress: 33,
				step: "recognizing",
				itemLabel: "Zone",
				partialResults: [{ zoneId: 1, text: "partial result", confidence: 90 }],
			},
		});
		render(<App />);

		expect(screen.getByTestId("results-panel")).toBeTruthy();
		expect(screen.getByText("partial result")).toBeTruthy();
	});
});
