import {
	type LanguageCode,
	LanguageSelector,
} from "@/components/LanguageSelector.tsx";
import { Button } from "@/components/ui/button.tsx";
import type { InteractionMode } from "@/types/index.ts";
import type { LayoutRegionType } from "@/types/layout.ts";
import { useCallback, useState } from "react";

interface ToolbarProps {
	/** Current filename, or null if no file is loaded (toolbar hidden). */
	fileName: string | null;
	/** Number of drawn zones. */
	zoneCount: number;
	/** Current zoom level (1 = 100%). */
	zoom: number;
	/** Active interaction mode. */
	mode: InteractionMode;
	/** Whether an OCR operation is in progress. */
	isOcrRunning: boolean;
	/** Whether preprocessing preview is active. */
	previewPreprocessing: boolean;
	/** Current OCR language code. */
	language: LanguageCode;
	/** Whether the app is online (for language downloads). */
	isOnline: boolean;

	/** Called when the user clicks "Détecter zones". */
	onDetectZones?: () => void;
	/** Whether layout detection is in progress. */
	isDetecting?: boolean;
	/** Currently enabled layout region types for filtering. */
	enabledTypes?: LayoutRegionType[];
	/** Called when the user toggles a region type filter. */
	onToggleType?: (type: LayoutRegionType) => void;
	/** Whether detection results are cached (enables re-detect). */
	hasDetectionCache?: boolean;
	/** Called when the user clicks "Re-détecter". */
	onForceRedetect?: () => void;
	/** Number of auto-detected zones currently on the canvas. */
	autoZoneCount?: number;
	/** Called when the user clicks "Effacer zones auto". */
	onClearAutoZones?: () => void;

	onFileClose: () => void;
	onFileBrowse: () => void;
	onModeChange: (mode: InteractionMode) => void;
	onClearZones: () => void;
	onPreviewToggle: () => void;
	onLanguageChange: (lang: LanguageCode) => void;
	onOcrStart: () => void;
	onResetZoom: () => void;
}

const KEYBOARD_SHORTCUTS = [
	{ key: "D", action: "Mode Draw" },
	{ key: "V", action: "Mode Pan" },
	{ key: "Suppr", action: "Supprimer zone" },
	{ key: "Ctrl +", action: "Zoom in" },
	{ key: "Ctrl -", action: "Zoom out" },
	{ key: "Ctrl 0", action: "Reset zoom" },
	{ key: "Échap", action: "Désélectionner" },
];

const REGION_TYPE_LABELS: { type: LayoutRegionType; label: string }[] = [
	{ type: "table", label: "Tableau" },
	{ type: "text", label: "Texte" },
	{ type: "header", label: "En-tête" },
	{ type: "footer", label: "Pied de page" },
	{ type: "figure", label: "Figure" },
	{ type: "title", label: "Titre" },
];

/** Main application toolbar, hidden when no file is loaded. */
export function Toolbar({
	fileName,
	zoneCount,
	zoom,
	mode,
	isOcrRunning,
	previewPreprocessing,
	language,
	isOnline,
	onDetectZones = () => {},
	isDetecting = false,
	enabledTypes = [],
	onToggleType = () => {},
	hasDetectionCache = false,
	onForceRedetect = () => {},
	autoZoneCount = 0,
	onClearAutoZones = () => {},
	onFileClose,
	onFileBrowse,
	onModeChange,
	onClearZones,
	onPreviewToggle,
	onLanguageChange,
	onOcrStart,
	onResetZoom,
}: ToolbarProps) {
	const [helpOpen, setHelpOpen] = useState(false);
	const [filterOpen, setFilterOpen] = useState(false);

	const handleHelpEnter = useCallback(() => setHelpOpen(true), []);
	const handleHelpLeave = useCallback(() => setHelpOpen(false), []);

	if (fileName === null) {
		return null;
	}

	const zoomPercent = `${Math.round(zoom * 100)}%`;
	const ocrLabel = zoneCount > 0 ? `OCR (${zoneCount} zones)` : "OCR document";

	return (
		<div
			className="flex items-center gap-2 border-b bg-white px-4 py-2"
			role="toolbar"
			aria-label="Barre d'outils"
		>
			{/* ---- File group ---- */}
			<span className="max-w-48 truncate text-sm font-medium" title={fileName}>
				{fileName}
			</span>
			<Button
				variant="ghost"
				size="icon-xs"
				aria-label="Fermer le fichier"
				onClick={onFileClose}
			>
				✕
			</Button>
			<Button
				variant="ghost"
				size="xs"
				aria-label="Parcourir"
				onClick={onFileBrowse}
			>
				Parcourir
			</Button>

			<Separator />

			{/* ---- Mode segmented control ---- */}
			<fieldset
				className="inline-flex rounded-lg border bg-muted p-0.5"
				aria-label="Mode d'interaction"
			>
				<ModeRadio
					label="Pan"
					value="pan"
					checked={mode === "pan"}
					onChange={() => onModeChange("pan")}
				/>
				<ModeRadio
					label="Draw"
					value="draw"
					checked={mode === "draw"}
					onChange={() => onModeChange("draw")}
				/>
			</fieldset>

			{zoneCount > 0 && (
				<Button variant="ghost" size="xs" onClick={onClearZones}>
					Effacer zones
				</Button>
			)}

			<Separator />

			{/* ---- Processing group ---- */}
			<Button
				variant="ghost"
				size="icon-xs"
				aria-label="Aperçu prétraitement"
				aria-pressed={previewPreprocessing}
				onClick={onPreviewToggle}
			>
				👁
			</Button>

			<LanguageSelector
				value={language}
				isOnline={isOnline}
				onLanguageChange={onLanguageChange}
			/>

			<Separator />

			{/* ---- Detection group ---- */}
			<Button
				size="sm"
				variant="outline"
				aria-label="Détecter zones"
				disabled={isOcrRunning || isDetecting || !fileName}
				onClick={onDetectZones}
			>
				Détecter zones
			</Button>

			<div className="relative">
				<Button
					variant="ghost"
					size="icon-xs"
					aria-label="Filtres de détection"
					disabled={isDetecting}
					onClick={() => !isDetecting && setFilterOpen((o) => !o)}
				>
					⚙
				</Button>
				{filterOpen && !isDetecting && (
					<div className="absolute left-0 top-full z-50 mt-1 w-52 rounded-lg border bg-white p-3 shadow-lg">
						<p className="mb-2 text-xs font-semibold">Types de régions</p>
						<ul className="space-y-1.5">
							{REGION_TYPE_LABELS.map(({ type, label }) => (
								<li key={type}>
									<label className="flex items-center gap-2 text-xs">
										<input
											type="checkbox"
											checked={enabledTypes.includes(type)}
											onChange={() => onToggleType(type)}
										/>
										{label}
									</label>
								</li>
							))}
						</ul>
						{hasDetectionCache && (
							<Button
								variant="ghost"
								size="xs"
								className="mt-2 w-full"
								onClick={onForceRedetect}
							>
								Re-détecter
							</Button>
						)}
					</div>
				)}
			</div>

			{autoZoneCount > 0 && (
				<Button variant="ghost" size="xs" onClick={onClearAutoZones}>
					Effacer zones auto
				</Button>
			)}

			<Separator />

			{/* ---- OCR button ---- */}
			<Button
				size="sm"
				aria-label={ocrLabel}
				disabled={isOcrRunning || isDetecting}
				onClick={onOcrStart}
			>
				{ocrLabel}
			</Button>

			<div className="flex-1" />

			{/* ---- Navigation group ---- */}
			<span className="text-sm tabular-nums text-gray-600">{zoomPercent}</span>
			<Button
				variant="ghost"
				size="icon-xs"
				aria-label="Reset zoom"
				onClick={onResetZoom}
			>
				↺
			</Button>

			<Separator />

			{/* ---- Help button ---- */}
			<div className="relative">
				<Button
					variant="ghost"
					size="icon-xs"
					aria-label="Aide et raccourcis clavier"
					onMouseEnter={handleHelpEnter}
					onMouseLeave={handleHelpLeave}
				>
					?
				</Button>
				{helpOpen && (
					<div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border bg-white p-3 shadow-lg">
						<p className="mb-2 text-xs font-semibold">Raccourcis clavier</p>
						<ul className="space-y-1">
							{KEYBOARD_SHORTCUTS.map((s) => (
								<li key={s.key} className="flex justify-between text-xs">
									<span className="text-muted-foreground">{s.action}</span>
									<kbd className="rounded bg-muted px-1 font-mono text-[10px]">
										{s.key}
									</kbd>
								</li>
							))}
						</ul>
					</div>
				)}
			</div>
		</div>
	);
}

/** Semantic radio button for the mode segmented control. */
function ModeRadio({
	label,
	value,
	checked,
	onChange,
}: {
	label: string;
	value: string;
	checked: boolean;
	onChange: () => void;
}) {
	return (
		<label
			className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
				checked
					? "bg-white text-foreground shadow-sm"
					: "text-muted-foreground hover:text-foreground"
			}`}
		>
			<input
				type="radio"
				name="interaction-mode"
				value={value}
				checked={checked}
				onChange={onChange}
				className="sr-only"
				aria-label={label}
			/>
			{label}
		</label>
	);
}

/** Visual separator between toolbar groups. */
function Separator() {
	return <div className="mx-1 h-5 w-px bg-gray-200" />;
}
