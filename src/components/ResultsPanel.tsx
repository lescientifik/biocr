import { useClipboard } from "@/hooks/useClipboard.ts";
import { useZoneStore } from "@/store/zone-store.ts";
import type { OcrZoneResult } from "@/types/ocr.ts";
import { Suspense, lazy, useCallback, useRef, useState } from "react";

const BioResultsSection = lazy(() =>
	import("@/components/BioResultsSection.tsx").then((m) => ({
		default: m.BioResultsSection,
	})),
);

interface ResultsPanelProps {
	results: OcrZoneResult[];
	isGlobalOcr: boolean;
}

const EMPTY_RESULT_MESSAGE =
	"Aucun texte détecté. Vérifiez que la zone couvre du texte lisible et essayez l'aperçu prétraitement.";

const COPY_FEEDBACK_MS = 2000;

/**
 * Results panel showing all OCR output combined in a single view.
 * Supports copy, confidence indicator, bio results, and resize.
 */
export function ResultsPanel({ results, isGlobalOcr }: ResultsPanelProps) {
	const [copied, setCopied] = useState(false);
	const { copy } = useClipboard();
	const panelRef = useRef<HTMLDivElement>(null);
	const [width, setWidth] = useState<number | null>(null);
	const resizing = useRef(false);

	// Sort results by vertical position (page order) using zone geometry
	const zones = useZoneStore((s) => s.zones);
	const zoneTopMap = new Map(zones.map((z) => [z.id, z.top]));
	const sortedResults = [...results].sort(
		(a, b) =>
			(zoneTopMap.get(a.zoneId) ?? 0) - (zoneTopMap.get(b.zoneId) ?? 0) ||
			a.zoneId - b.zoneId,
	);

	if (results.length === 0) {
		return null;
	}

	// Combine all results into a single text block separated by blank lines
	const combinedText = sortedResults.map((r) => r.text).join("\n\n");

	// Compute lowest confidence across all zones
	const lowestConfidence = Math.min(...sortedResults.map((r) => r.confidence));

	const handleCopy = async () => {
		await copy(combinedText);
		setCopied(true);
		setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
	};

	const handleResizeStart = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		resizing.current = true;
		const startX = e.clientX;
		const startWidth = panelRef.current?.offsetWidth ?? 300;

		const handleMouseMove = (moveEvent: MouseEvent) => {
			if (!resizing.current) return;
			const delta = startX - moveEvent.clientX;
			const windowWidth = window.innerWidth;
			const newWidth = Math.min(
				windowWidth * 0.6,
				Math.max(200, startWidth + delta),
			);
			setWidth(newWidth);
		};

		const handleMouseUp = () => {
			resizing.current = false;
			document.removeEventListener("mousemove", handleMouseMove);
			document.removeEventListener("mouseup", handleMouseUp);
		};

		document.addEventListener("mousemove", handleMouseMove);
		document.addEventListener("mouseup", handleMouseUp);
	}, []);

	return (
		<div
			data-testid="results-panel"
			ref={panelRef}
			className="flex flex-col border-l bg-background"
			style={{
				width: width ? `${width}px` : "30%",
				minWidth: "200px",
				maxWidth: "60%",
			}}
		>
			{/* Resize handle */}
			<div
				className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 transition-colors"
				onMouseDown={handleResizeStart}
			/>

			{/* Header with copy button */}
			<div className="flex items-center justify-between border-b px-3 py-2">
				<span className="text-sm font-medium">Résultats</span>
				<div aria-live="polite">
					<button
						type="button"
						className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
						onClick={handleCopy}
					>
						{copied ? "Copié !" : "Copier"}
					</button>
				</div>
			</div>

			{/* Content */}
			<div className="flex-1 overflow-auto p-3">
				{lowestConfidence < 40 && (
					<div className="mb-2 rounded bg-yellow-50 px-2 py-1 text-xs text-yellow-700">
						{"⚠ Fiabilité faible"}
					</div>
				)}

				{/* Bio results (filtered/processed) first */}
				{combinedText !== "" && (
					<Suspense>
						<BioResultsSection ocrText={combinedText} />
					</Suspense>
				)}

				{/* Raw OCR text below (debug) */}
				{combinedText === "" ? (
					<p className="text-sm text-gray-500 italic">
						{EMPTY_RESULT_MESSAGE}
					</p>
				) : (
					<details className="mt-3">
						<summary className="cursor-pointer text-xs text-gray-400 select-none">
							Texte brut OCR
						</summary>
						<pre className="mt-1 font-mono text-sm whitespace-pre-wrap select-text text-gray-500">
							{combinedText}
						</pre>
					</details>
				)}
			</div>
		</div>
	);
}
