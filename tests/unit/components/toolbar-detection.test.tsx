import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { LanguageCode } from "@/components/LanguageSelector.tsx";
import { Toolbar } from "@/components/Toolbar.tsx";
import type { InteractionMode } from "@/types/index.ts";
import type { LayoutRegionType } from "@/types/layout.ts";

type ToolbarProps = Parameters<typeof Toolbar>[0];

/** Minimal props factory — detection props use component defaults unless overridden. */
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

describe("Toolbar — détection de layout", () => {
	afterEach(() => {
		cleanup();
	});

	// ---- Bouton "Détecter zones" ----

	it('bouton "Détecter zones" visible quand un fichier est chargé', () => {
		render(<Toolbar {...createProps()} />);
		expect(screen.getByLabelText("Détecter zones")).toBeTruthy();
	});

	it('bouton "Détecter zones" disabled quand isOcrRunning=true', () => {
		render(<Toolbar {...createProps({ isOcrRunning: true })} />);
		expect(screen.getByLabelText("Détecter zones")).toBeDisabled();
	});

	it('bouton "Détecter zones" disabled quand isDetecting=true', () => {
		render(<Toolbar {...createProps({ isDetecting: true })} />);
		expect(screen.getByLabelText("Détecter zones")).toBeDisabled();
	});

	it('bouton "Détecter zones" disabled quand pas de fichier', () => {
		const { container } = render(
			<Toolbar {...createProps({ fileName: null })} />,
		);
		// Toolbar renders nothing when fileName is null
		expect(container.innerHTML).toBe("");
	});

	it('clic sur "Détecter zones" appelle onDetectZones', async () => {
		const onDetectZones = vi.fn();
		render(<Toolbar {...createProps({ onDetectZones })} />);
		await userEvent.click(screen.getByLabelText("Détecter zones"));
		expect(onDetectZones).toHaveBeenCalledOnce();
	});

	// ---- Popover filtres (engrenage) ----

	it("clic sur engrenage ouvre le popover des filtres", async () => {
		render(
			<Toolbar
				{...createProps({
					enabledTypes: ["table", "text"] as LayoutRegionType[],
				})}
			/>,
		);
		await userEvent.click(screen.getByLabelText("Filtres de détection"));
		expect(screen.getByText("Types de régions")).toBeTruthy();
	});

	it("popover disabled (non interactif) quand isDetecting=true", () => {
		render(<Toolbar {...createProps({ isDetecting: true })} />);
		expect(screen.getByLabelText("Filtres de détection")).toBeDisabled();
	});

	it("popover affiche 5 checkboxes", async () => {
		render(
			<Toolbar
				{...createProps({
					enabledTypes: ["table", "text"] as LayoutRegionType[],
				})}
			/>,
		);
		await userEvent.click(screen.getByLabelText("Filtres de détection"));
		const checkboxes = screen.getAllByRole("checkbox");
		expect(checkboxes).toHaveLength(5);
	});

	it("Tableau et Texte cochés par défaut", async () => {
		render(
			<Toolbar
				{...createProps({
					enabledTypes: ["table", "text"] as LayoutRegionType[],
				})}
			/>,
		);
		await userEvent.click(screen.getByLabelText("Filtres de détection"));
		const checkboxes = screen.getAllByRole("checkbox");
		// Tableau = index 0, Texte = index 1
		expect(checkboxes[0]).toBeChecked();
		expect(checkboxes[1]).toBeChecked();
		// En-tête, Pied de page, Figure unchecked
		expect(checkboxes[2]).not.toBeChecked();
		expect(checkboxes[3]).not.toBeChecked();
		expect(checkboxes[4]).not.toBeChecked();
	});

	it("toggle d'une checkbox appelle onToggleType", async () => {
		const onToggleType = vi.fn();
		render(
			<Toolbar
				{...createProps({
					enabledTypes: ["table", "text"] as LayoutRegionType[],
					onToggleType,
				})}
			/>,
		);
		await userEvent.click(screen.getByLabelText("Filtres de détection"));
		// Click on "En-tête" (3rd checkbox)
		const checkboxes = screen.getAllByRole("checkbox");
		await userEvent.click(checkboxes[2]);
		expect(onToggleType).toHaveBeenCalledWith("header");
	});

	// ---- Bouton "Re-détecter" ----

	it('bouton "Re-détecter" visible seulement si hasDetectionCache=true', async () => {
		render(
			<Toolbar
				{...createProps({
					hasDetectionCache: true,
					enabledTypes: ["table", "text"] as LayoutRegionType[],
				})}
			/>,
		);
		await userEvent.click(screen.getByLabelText("Filtres de détection"));
		expect(screen.getByText("Re-détecter")).toBeTruthy();
	});

	it('bouton "Re-détecter" absent quand hasDetectionCache=false', async () => {
		render(
			<Toolbar
				{...createProps({
					hasDetectionCache: false,
					enabledTypes: ["table", "text"] as LayoutRegionType[],
				})}
			/>,
		);
		await userEvent.click(screen.getByLabelText("Filtres de détection"));
		expect(screen.queryByText("Re-détecter")).toBeNull();
	});

	it('clic "Re-détecter" appelle onForceRedetect', async () => {
		const onForceRedetect = vi.fn();
		render(
			<Toolbar
				{...createProps({
					hasDetectionCache: true,
					enabledTypes: ["table", "text"] as LayoutRegionType[],
					onForceRedetect,
				})}
			/>,
		);
		await userEvent.click(screen.getByLabelText("Filtres de détection"));
		await userEvent.click(screen.getByText("Re-détecter"));
		expect(onForceRedetect).toHaveBeenCalledOnce();
	});

	// ---- Bouton "Effacer zones auto" ----

	it('bouton "Effacer zones auto" visible quand autoZoneCount > 0', () => {
		render(<Toolbar {...createProps({ autoZoneCount: 3 })} />);
		expect(screen.getByText("Effacer zones auto")).toBeTruthy();
	});

	it('bouton "Effacer zones auto" absent quand autoZoneCount === 0', () => {
		render(<Toolbar {...createProps({ autoZoneCount: 0 })} />);
		expect(screen.queryByText("Effacer zones auto")).toBeNull();
	});

	it('clic "Effacer zones auto" appelle onClearAutoZones', async () => {
		const onClearAutoZones = vi.fn();
		render(
			<Toolbar {...createProps({ autoZoneCount: 5, onClearAutoZones })} />,
		);
		await userEvent.click(screen.getByText("Effacer zones auto"));
		expect(onClearAutoZones).toHaveBeenCalledOnce();
	});

	// ---- OCR button disabled during detection ----

	it("OCR button disabled quand isDetecting=true", () => {
		render(<Toolbar {...createProps({ isDetecting: true })} />);
		const ocrBtn = screen.getByRole("button", { name: /ocr/i });
		expect(ocrBtn).toBeDisabled();
	});
});
