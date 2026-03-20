import { BioResultsSection } from "@/components/BioResultsSection.tsx";
import { useClipboard } from "@/hooks/useClipboard.ts";
import type { OcrZoneResult } from "@/types/ocr.ts";
import { useCallback, useRef, useState } from "react";

interface ResultsPanelProps {
	results: OcrZoneResult[];
	isGlobalOcr: boolean;
}

const EMPTY_RESULT_MESSAGE =
	"Aucun texte détecté. Vérifiez que la zone couvre du texte lisible et essayez l'aperçu prétraitement.";

const COPY_FEEDBACK_MS = 2000;

/**
 * Results panel showing OCR output with tabs for each zone or a single "Document" tab.
 * Supports copy per zone, "Tout copier", confidence badges, and resize.
 */
export function ResultsPanel({ results, isGlobalOcr }: ResultsPanelProps) {
	const [activeTab, setActiveTab] = useState(0);
	const [copiedZoneId, setCopiedZoneId] = useState<number | null>(null);
	const [copiedAll, setCopiedAll] = useState(false);
	const { copy } = useClipboard();
	const panelRef = useRef<HTMLDivElement>(null);
	const [width, setWidth] = useState<number | null>(null);
	const resizing = useRef(false);

	const sortedResults = [...results].sort((a, b) => a.zoneId - b.zoneId);

	if (results.length === 0) {
		return null;
	}

	// In global OCR mode, merge all pages into a single "Document" view
	const mergedResults: OcrZoneResult[] = isGlobalOcr
		? [
				{
					zoneId: 0,
					text:
						sortedResults.length === 1
							? sortedResults[0].text
							: sortedResults
									.map((r) => `--- Page ${r.zoneId} ---\n${r.text}`)
									.join("\n\n"),
					confidence:
						sortedResults.reduce((sum, r) => sum + r.confidence, 0) /
						sortedResults.length,
				},
			]
		: sortedResults;

	const activeResult = mergedResults[activeTab] ?? mergedResults[0];

	const handleCopyZone = async (text: string, zoneId: number) => {
		await copy(text);
		setCopiedZoneId(zoneId);
		setTimeout(() => setCopiedZoneId(null), COPY_FEEDBACK_MS);
	};

	const handleCopyAll = async () => {
		// In global mode, mergedResults already has the concatenated text
		const text =
			mergedResults.length === 1
				? mergedResults[0].text
				: mergedResults
						.map((r) => `--- Zone ${r.zoneId} ---\n${r.text}`)
						.join("\n\n");
		await copy(text);
		setCopiedAll(true);
		setTimeout(() => setCopiedAll(false), COPY_FEEDBACK_MS);
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

			{/* Header with "Tout copier" */}
			<div className="flex items-center justify-between border-b px-3 py-2">
				<span className="text-sm font-medium">Résultats</span>
				<div aria-live="polite">
					<button
						type="button"
						className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
						onClick={handleCopyAll}
					>
						{copiedAll ? "Copié !" : "Tout copier"}
					</button>
				</div>
			</div>

			{/* Tabs */}
			<div className="flex border-b overflow-x-auto" role="tablist">
				{mergedResults.map((result, index) => {
					const label = isGlobalOcr ? "Document" : `Zone ${result.zoneId}`;
					const isActive = index === activeTab;
					return (
						<button
							key={result.zoneId}
							type="button"
							role="tab"
							aria-selected={isActive}
							className={`shrink-0 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
								isActive
									? "border-blue-500 text-blue-600"
									: "border-transparent text-gray-500 hover:text-gray-700"
							}`}
							onClick={() => setActiveTab(index)}
						>
							{label}
						</button>
					);
				})}
			</div>

			{/* Tab content */}
			{activeResult && (
				<div className="flex-1 overflow-auto p-3">
					{activeResult.confidence < 40 && (
						<div className="mb-2 rounded bg-yellow-50 px-2 py-1 text-xs text-yellow-700">
							{"⚠ Fiabilité faible"}
						</div>
					)}

					{activeResult.text === "" ? (
						<p className="text-sm text-gray-500 italic">
							{EMPTY_RESULT_MESSAGE}
						</p>
					) : (
						<pre className="font-mono text-sm whitespace-pre-wrap select-text">
							{activeResult.text}
						</pre>
					)}

					{activeResult.text !== "" && (
						<BioResultsSection ocrText={activeResult.text} />
					)}

					<div className="mt-3" aria-live="polite">
						{copiedZoneId === activeResult.zoneId ? (
							<span className="text-xs text-green-600 font-medium">
								Copié !
							</span>
						) : (
							<button
								type="button"
								className="rounded border px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
								onClick={() =>
									handleCopyZone(activeResult.text, activeResult.zoneId)
								}
							>
								Copier
							</button>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
