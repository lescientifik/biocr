import { extractBioResults } from "@/lib/bio/pipeline.ts";
import type { BioResult } from "@/types/bio.ts";
import { useMemo } from "react";

interface BioResultsSectionProps {
	ocrText: string;
}

/** Format a single bio result as a copy-friendly string. */
function formatResult(r: BioResult): string {
	const val = r.qualifier ? `${r.qualifier}${r.value}` : `${r.value}`;
	return `${r.name} ${val} ${r.unit}`.trim();
}

/**
 * Displays structured biological parameter results extracted from OCR text.
 * Each parameter is shown on one line: "Name Value Unit".
 * Flagged values (physiologically implausible, likely OCR errors) get a warning indicator.
 */
export function BioResultsSection({ ocrText }: BioResultsSectionProps) {
	const results = useMemo(() => extractBioResults(ocrText), [ocrText]);
	const copyText = useMemo(
		() => results.map(formatResult).join("\n"),
		[results],
	);

	if (results.length === 0) return null;

	return (
		<div data-testid="bio-results-section" className="mt-3 border-t pt-3">
			<div className="mb-2 flex items-center justify-between">
				<span className="text-xs font-semibold text-gray-700">
					Bio — Paramètres extraits
				</span>
			</div>
			<div className="space-y-0.5">
				{results.map((r, i) => (
					<div
						key={`${i}-${r.name}-${r.unit}`}
						className={`flex items-baseline gap-2 font-mono text-sm ${
							r.flagged ? "text-red-600" : "text-gray-900"
						}`}
					>
						{r.flagged && (
							<span title="Valeur aberrante (erreur OCR probable)">{"⚠"}</span>
						)}
						<span>{formatResult(r)}</span>
					</div>
				))}
			</div>
			{/* Hidden textarea for clean copy */}
			<textarea
				data-testid="bio-results-copy-text"
				className="sr-only"
				readOnly
				value={copyText}
				tabIndex={-1}
			/>
		</div>
	);
}
