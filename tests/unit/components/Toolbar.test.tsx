import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LanguageCode } from "@/components/LanguageSelector.tsx";
import { Toolbar } from "@/components/Toolbar.tsx";
import type { InteractionMode } from "@/types/index.ts";

/** Minimal props factory for Toolbar */
function createProps(overrides: Partial<ToolbarProps> = {}): ToolbarProps {
	return {
		fileName: "scan.pdf",
		zoneCount: 0,
		zoom: 1,
		mode: "pan" as InteractionMode,
		isOcrRunning: false,
		previewPreprocessing: false,
		language: "fra" as LanguageCode,
		isOnline: true,
		onFileClose: vi.fn(),
		onFileBrowse: vi.fn(),
		onModeChange: vi.fn(),
		onClearZones: vi.fn(),
		onPreviewToggle: vi.fn(),
		onLanguageChange: vi.fn(),
		onOcrStart: vi.fn(),
		onResetZoom: vi.fn(),
		...overrides,
	};
}

type ToolbarProps = Parameters<typeof Toolbar>[0];

describe("Toolbar", () => {
	afterEach(() => {
		cleanup();
	});

	// ---- Visibility ----

	it("is hidden when no file is loaded (fileName is null)", () => {
		const { container } = render(
			<Toolbar {...createProps({ fileName: null })} />,
		);
		// The toolbar should render nothing
		expect(container.innerHTML).toBe("");
	});

	it("is visible when a file is loaded", () => {
		render(<Toolbar {...createProps()} />);
		expect(screen.getByText("scan.pdf")).toBeTruthy();
	});

	// ---- File group ----

	it("displays the filename and a close (✕) button", () => {
		render(<Toolbar {...createProps({ fileName: "bilan.pdf" })} />);
		expect(screen.getByText("bilan.pdf")).toBeTruthy();
		expect(screen.getByLabelText("Fermer le fichier")).toBeTruthy();
	});

	it("calls onFileClose when the ✕ button is clicked", async () => {
		const onFileClose = vi.fn();
		render(<Toolbar {...createProps({ onFileClose })} />);
		await userEvent.click(screen.getByLabelText("Fermer le fichier"));
		expect(onFileClose).toHaveBeenCalledOnce();
	});

	it("shows a browse button when a file is loaded", () => {
		render(<Toolbar {...createProps()} />);
		expect(screen.getByLabelText("Parcourir")).toBeTruthy();
	});

	it("calls onFileBrowse when the browse button is clicked", async () => {
		const onFileBrowse = vi.fn();
		render(<Toolbar {...createProps({ onFileBrowse })} />);
		await userEvent.click(screen.getByLabelText("Parcourir"));
		expect(onFileBrowse).toHaveBeenCalledOnce();
	});

	// ---- Draw/Pan segmented control ----

	it("reflects active mode Pan in the segmented control", () => {
		render(<Toolbar {...createProps({ mode: "pan" })} />);
		const panRadio = screen.getByRole("radio", { name: /pan/i });
		expect(panRadio).toBeChecked();
	});

	it("reflects active mode Draw in the segmented control", () => {
		render(<Toolbar {...createProps({ mode: "draw" })} />);
		const drawRadio = screen.getByRole("radio", { name: /draw/i });
		expect(drawRadio).toBeChecked();
	});

	it("calls onModeChange when switching mode", async () => {
		const onModeChange = vi.fn();
		render(<Toolbar {...createProps({ mode: "pan", onModeChange })} />);
		await userEvent.click(screen.getByRole("radio", { name: /draw/i }));
		expect(onModeChange).toHaveBeenCalledWith("draw");
	});

	// ---- Clear zones ----

	it("hides 'Effacer zones' when zoneCount is 0", () => {
		render(<Toolbar {...createProps({ zoneCount: 0 })} />);
		expect(screen.queryByText("Effacer zones")).toBeNull();
	});

	it("shows 'Effacer zones' when zoneCount >= 1", () => {
		render(<Toolbar {...createProps({ zoneCount: 2 })} />);
		expect(screen.getByText("Effacer zones")).toBeTruthy();
	});

	it("calls onClearZones when 'Effacer zones' is clicked", async () => {
		const onClearZones = vi.fn();
		render(<Toolbar {...createProps({ zoneCount: 3, onClearZones })} />);
		await userEvent.click(screen.getByText("Effacer zones"));
		expect(onClearZones).toHaveBeenCalledOnce();
	});

	// ---- Preprocessing preview toggle ----

	it("has a preprocessing preview toggle (eye icon)", () => {
		render(<Toolbar {...createProps()} />);
		expect(screen.getByLabelText("Aperçu prétraitement")).toBeTruthy();
	});

	it("calls onPreviewToggle when toggle is clicked", async () => {
		const onPreviewToggle = vi.fn();
		render(<Toolbar {...createProps({ onPreviewToggle })} />);
		await userEvent.click(screen.getByLabelText("Aperçu prétraitement"));
		expect(onPreviewToggle).toHaveBeenCalledOnce();
	});

	// ---- Language selector ----

	it("shows language selector", () => {
		render(<Toolbar {...createProps()} />);
		expect(screen.getByLabelText("Langue OCR")).toBeTruthy();
	});

	// ---- OCR button ----

	it("shows 'OCR document' when no zones", () => {
		render(<Toolbar {...createProps({ zoneCount: 0 })} />);
		expect(screen.getByText("OCR document")).toBeTruthy();
	});

	it("shows 'OCR (3 zones)' with 3 zones", () => {
		render(<Toolbar {...createProps({ zoneCount: 3 })} />);
		expect(screen.getByText("OCR (3 zones)")).toBeTruthy();
	});

	it("OCR button is disabled during OCR", () => {
		render(<Toolbar {...createProps({ isOcrRunning: true })} />);
		const ocrBtn = screen.getByRole("button", { name: /ocr/i });
		expect(ocrBtn).toBeDisabled();
	});

	it("calls onOcrStart when OCR button is clicked", async () => {
		const onOcrStart = vi.fn();
		render(<Toolbar {...createProps({ onOcrStart })} />);
		await userEvent.click(screen.getByText("OCR document"));
		expect(onOcrStart).toHaveBeenCalledOnce();
	});

	// ---- Zoom indicator ----

	it("displays the zoom percentage", () => {
		render(<Toolbar {...createProps({ zoom: 1.5 })} />);
		expect(screen.getByText("150%")).toBeTruthy();
	});

	it("calls onResetZoom when the reset zoom button is clicked", async () => {
		const onResetZoom = vi.fn();
		render(<Toolbar {...createProps({ onResetZoom })} />);
		await userEvent.click(screen.getByLabelText("Reset zoom"));
		expect(onResetZoom).toHaveBeenCalledOnce();
	});

	// ---- Help button ----

	it("has a help (?) button", () => {
		render(<Toolbar {...createProps()} />);
		expect(screen.getByLabelText("Aide et raccourcis clavier")).toBeTruthy();
	});

	it("the help button shows keyboard shortcuts tooltip on hover", async () => {
		render(<Toolbar {...createProps()} />);
		const helpBtn = screen.getByLabelText("Aide et raccourcis clavier");
		await userEvent.hover(helpBtn);
		// Tooltip content should appear
		expect(screen.getByText(/Mode Draw/i)).toBeTruthy();
		expect(screen.getByText(/Mode Pan/i)).toBeTruthy();
	});
});
